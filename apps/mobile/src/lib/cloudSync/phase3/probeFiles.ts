import { File, FileMode, Paths, type FileHandle } from 'expo-file-system';

import {
  DETERMINISTIC_FIXTURES,
  FIXTURE_CHUNK_BYTES,
  fillDeterministicFixtureChunk,
  type DeterministicFixtureId,
} from '../phase0/deterministicFixture';
import { runStreamingHashSpike } from '../phase0/streamingHashSpike';
import type { ResumableDownloadSink } from '../providers/googleDrive';
import type { SizedByteSource } from '../providers/types';

const YIELD_INTERVAL_CHUNKS = 8;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Durable download target for `GoogleDriveProvider.downloadToSink`. Bytes go
 * straight to disk and the digest is taken by the native streaming hasher, so
 * a 200 MiB object is verified without ever being held in JavaScript memory.
 */
export class FileDownloadSink implements ResumableDownloadSink {
  private handle: FileHandle | null = null;

  constructor(private readonly file: File) {}

  get uri(): string {
    return this.file.uri;
  }

  async byteLength(): Promise<number> {
    this.closeHandle();
    return this.file.exists ? (this.file.size ?? 0) : 0;
  }

  async append(chunk: Uint8Array): Promise<void> {
    if (!this.file.exists) this.file.create();
    if (!this.handle) this.handle = this.file.open(FileMode.Append);
    this.handle.writeBytes(chunk);
  }

  async reset(): Promise<void> {
    this.closeHandle();
    if (this.file.exists) this.file.delete();
    this.file.create();
  }

  async digestSha256(): Promise<string> {
    this.closeHandle();
    const { sha256 } = await runStreamingHashSpike(this.file.uri);
    return sha256;
  }

  /** Removes the probe's scratch file. Probe hygiene only. */
  dispose(): void {
    this.closeHandle();
    if (this.file.exists) this.file.delete();
  }

  private closeHandle(): void {
    if (!this.handle) return;
    this.handle.close();
    this.handle = null;
  }
}

export interface ProbeFixtureFile {
  file: File;
  byteLength: number;
  /** Host-frozen in the Phase-0 fixture table; never derived on-device. */
  expectedSha256: string;
  generationMs: number;
}

/**
 * Materializes a deterministic transfer fixture in the cache directory. The
 * bytes come from the frozen Phase-0 generator, so the upload and the download
 * are checked against a hash this device did not choose. An existing file of
 * the exact size is reused; its content is proven by the hash check, not by
 * trusting the filename.
 */
export async function ensureProbeFixtureFile(
  fixtureId: DeterministicFixtureId,
): Promise<ProbeFixtureFile> {
  const spec = DETERMINISTIC_FIXTURES[fixtureId];
  const file = new File(Paths.cache, `phase3-transfer-fixture-${fixtureId}.bin`);

  if (file.exists && file.size === spec.totalBytes) {
    return {
      file,
      byteLength: spec.totalBytes,
      expectedSha256: spec.expectedSha256,
      generationMs: 0,
    };
  }

  const startedAt = performance.now();
  if (file.exists) file.delete();
  file.create();

  const handle = file.open();
  try {
    const chunk = new Uint8Array(FIXTURE_CHUNK_BYTES);
    const chunkCount = spec.totalBytes / FIXTURE_CHUNK_BYTES;
    for (let index = 0; index < chunkCount; index += 1) {
      fillDeterministicFixtureChunk(index, chunk);
      handle.writeBytes(chunk);
      if ((index + 1) % YIELD_INTERVAL_CHUNKS === 0) await yieldToEventLoop();
    }
  } finally {
    handle.close();
  }

  return {
    file,
    byteLength: spec.totalBytes,
    expectedSha256: spec.expectedSha256,
    generationMs: Math.round(performance.now() - startedAt),
  };
}

/**
 * Deterministic probe payload. Reuses the frozen Phase-0 chunk generator with a
 * seed offset so each probe object has distinct, reproducible bytes.
 */
export function deterministicBytes(byteLength: number, seed: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  const scratch = new Uint8Array(FIXTURE_CHUNK_BYTES);
  let offset = 0;
  let index = 0;
  while (offset < byteLength) {
    fillDeterministicFixtureChunk(seed * 4096 + index, scratch);
    const take = Math.min(FIXTURE_CHUNK_BYTES, byteLength - offset);
    out.set(scratch.subarray(0, take), offset);
    offset += take;
    index += 1;
  }
  return out;
}

/** Writes a probe payload to the cache directory so it can be streamed back. */
export function writeProbeBlobFile(name: string, bytes: Uint8Array): File {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  const handle = file.open();
  try {
    handle.writeBytes(bytes);
  } finally {
    handle.close();
  }
  return file;
}

/** Removes every scratch file this probe suite writes into the cache. */
export function deleteProbeScratchFiles(): number {
  const directory = Paths.cache;
  let deleted = 0;
  for (const entry of directory.list()) {
    if (entry instanceof File && entry.name.startsWith('phase3-')) {
      entry.delete();
      deleted += 1;
    }
  }
  return deleted;
}

export class SimulatedTransferInterruption extends Error {
  constructor(readonly bytesDelivered: number) {
    super(`Simulated transfer interruption after ${bytesDelivered} bytes`);
    this.name = 'SimulatedTransferInterruption';
  }
}

export interface FileByteSourceOptions {
  /**
   * Throws once this many bytes have been yielded, standing in for the app
   * being killed mid-upload. The persisted resumable session is what must
   * survive; the next attempt uses a source without this option.
   */
  failAfterBytes?: number;
  readChunkBytes?: number;
}

/**
 * Streams a file as a `SizedByteSource` so the adapter takes its resumable
 * upload path. Reads are bounded by `readChunkBytes`, never the file size.
 */
export function createFileByteSource(
  file: File,
  contentHash: string,
  options: FileByteSourceOptions = {},
): SizedByteSource {
  const readChunkBytes = options.readChunkBytes ?? FIXTURE_CHUNK_BYTES;
  const byteLength = file.size ?? 0;

  return {
    byteLength,
    contentHash,
    chunks: {
      async *[Symbol.asyncIterator]() {
        const handle = file.open(FileMode.ReadOnly);
        let delivered = 0;
        try {
          while (delivered < byteLength) {
            const wanted = Math.min(readChunkBytes, byteLength - delivered);
            const bytes = handle.readBytes(wanted);
            if (bytes.length === 0) break;
            delivered += bytes.length;
            yield bytes;
            if (
              options.failAfterBytes !== undefined &&
              delivered >= options.failAfterBytes &&
              delivered < byteLength
            ) {
              throw new SimulatedTransferInterruption(delivered);
            }
          }
        } finally {
          handle.close();
        }
      },
    },
  };
}
