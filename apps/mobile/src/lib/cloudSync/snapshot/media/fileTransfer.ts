import { requireNativeModule } from 'expo';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { inspectLocalMediaFile } from '../../media/streamingHash';
import type { MediaDownloadSink, MediaUploadSource } from '../sync/types';
import { LocalStorageError, MediaIntegrityError } from '../sync/types';

interface AtomicFileNativeModule {
  appendAndSync(uri: string, bytes: Uint8Array): Promise<void>;
  replaceAndSync(sourceUri: string, destinationUri: string): Promise<void>;
}

function atomicFiles(): AtomicFileNativeModule {
  return requireNativeModule<AtomicFileNativeModule>('AtomicFileModule');
}

function resolveFile(uri: string): File {
  return uri.startsWith('file:') || uri.startsWith('/')
    ? new File(uri)
    : new File(Paths.document, uri);
}

function nativeFileError(error: unknown, operation: string): LocalStorageError {
  const message = error instanceof Error ? error.message : String(error);
  const storageFull = /ENOSPC|no space left|disk.*full|storage.*full/i.test(message);
  return new LocalStorageError(
    storageFull ? 'local-storage-full' : 'local-media-unreadable',
    `${operation}-${storageFull ? 'storage-full' : 'io-failed'}`,
  );
}

export function openMediaUploadSource(
  uri: string,
  contentHash: string,
  byteLength: number,
): MediaUploadSource | null {
  const file = resolveFile(uri);
  if (!file.exists || file.size !== byteLength) return null;
  return {
    byteLength,
    contentHash,
    async read(offset, length) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > byteLength ||
          !Number.isSafeInteger(length) || length <= 0) {
        throw new LocalStorageError('local-media-unreadable', 'invalid-media-read-range');
      }
      const requested = Math.min(length, byteLength - offset);
      if (requested === 0) return new Uint8Array();
      const handle = file.open(FileMode.ReadOnly);
      try {
        handle.offset = offset;
        return handle.readBytes(requested);
      } finally {
        handle.close();
      }
    },
  };
}

export class MediaPartialFileSink implements MediaDownloadSink {
  constructor(
    private readonly partial: File,
    private readonly final: File,
  ) {}

  async byteLength(): Promise<number> {
    return this.partial.exists ? (this.partial.size ?? 0) : 0;
  }

  async appendAndSync(bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength === 0) return;
    try {
      await atomicFiles().appendAndSync(this.partial.uri, bytes);
    } catch (error) {
      throw nativeFileError(error, 'media-partial-append');
    }
  }

  async reset(): Promise<void> {
    try {
      if (this.partial.exists) this.partial.delete();
    } catch (error) {
      throw nativeFileError(error, 'media-partial-reset');
    }
  }

  async verifyAndPromote(expectedByteLength: number, expectedSha256: string): Promise<void> {
    if (!this.partial.exists || this.partial.size !== expectedByteLength) {
      await this.reset();
      throw new MediaIntegrityError('downloaded-media-size-mismatch');
    }
    const inspected = await inspectLocalMediaFile(this.partial.uri);
    if (inspected.byteSize !== expectedByteLength || inspected.sha256 !== expectedSha256) {
      await this.reset();
      throw new MediaIntegrityError('downloaded-media-hash-mismatch');
    }
    try {
      if (this.final.exists) {
        const existing = await inspectLocalMediaFile(this.final.uri);
        if (existing.byteSize === expectedByteLength && existing.sha256 === expectedSha256) {
          await this.reset();
          return;
        }
        this.final.delete();
      }
      await atomicFiles().replaceAndSync(this.partial.uri, this.final.uri);
    } catch (error) {
      if (error instanceof LocalStorageError) throw error;
      throw nativeFileError(error, 'media-atomic-promotion');
    }
  }
}

export function createMediaPartialFileSink(
  directory: Directory,
  blobHash: string,
): MediaPartialFileSink {
  directory.create({ intermediates: true, idempotent: true });
  return new MediaPartialFileSink(
    new File(directory, `${blobHash}.partial`),
    new File(directory, `${blobHash}.bin`),
  );
}

export async function copyVerifiedMediaFile(
  source: File,
  destination: File,
  expectedByteLength: number,
  expectedSha256: string,
): Promise<void> {
  if (destination.exists) {
    try {
      const existing = await inspectLocalMediaFile(destination.uri);
      if (existing.byteSize === expectedByteLength && existing.sha256 === expectedSha256) return;
    } catch {
      // Replace an unreadable/truncated destination from the verified stage.
    }
  }
  const temporary = new File(`${destination.uri}.cloud-sync.tmp`);
  try {
    if (temporary.exists) temporary.delete();
    await source.copy(temporary);
    const inspected = await inspectLocalMediaFile(temporary.uri);
    if (inspected.byteSize !== expectedByteLength || inspected.sha256 !== expectedSha256) {
      throw new MediaIntegrityError('staged-media-hash-mismatch');
    }
    await atomicFiles().replaceAndSync(temporary.uri, destination.uri);
  } catch (error) {
    try {
      if (temporary.exists) temporary.delete();
    } catch {
      // A later attempt reclaims the deterministic temporary file.
    }
    if (error instanceof MediaIntegrityError) throw error;
    throw nativeFileError(error, 'media-materialization');
  }
}
