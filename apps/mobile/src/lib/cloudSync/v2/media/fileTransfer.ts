import { requireNativeModule } from 'expo';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { inspectLocalMediaFile } from '../../media/streamingHash';
import type { V2MediaDownloadSink, V2MediaUploadSource } from '../sync/types';
import { V2LocalStorageError, V2MediaIntegrityError } from '../sync/types';

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

export function openV2MediaUploadSource(
  uri: string,
  contentHash: string,
  byteLength: number,
): V2MediaUploadSource | null {
  const file = resolveFile(uri);
  if (!file.exists || file.size !== byteLength) return null;
  return {
    byteLength,
    contentHash,
    async read(offset, length) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > byteLength ||
          !Number.isSafeInteger(length) || length <= 0) {
        throw new V2LocalStorageError('local-media-unreadable', 'invalid-media-read-range');
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

export class V2MediaPartialFileSink implements V2MediaDownloadSink {
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
    } catch {
      throw new V2LocalStorageError('local-storage-full', 'media-partial-append-failed');
    }
  }

  async reset(): Promise<void> {
    try {
      if (this.partial.exists) this.partial.delete();
    } catch {
      throw new V2LocalStorageError('local-storage-full', 'media-partial-reset-failed');
    }
  }

  async verifyAndPromote(expectedByteLength: number, expectedSha256: string): Promise<void> {
    if (!this.partial.exists || this.partial.size !== expectedByteLength) {
      await this.reset();
      throw new V2MediaIntegrityError('downloaded-media-size-mismatch');
    }
    const inspected = await inspectLocalMediaFile(this.partial.uri);
    if (inspected.byteSize !== expectedByteLength || inspected.sha256 !== expectedSha256) {
      await this.reset();
      throw new V2MediaIntegrityError('downloaded-media-hash-mismatch');
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
      if (error instanceof V2LocalStorageError) throw error;
      throw new V2LocalStorageError('local-storage-full', 'media-atomic-promotion-failed');
    }
  }
}

export function createV2MediaPartialFileSink(
  directory: Directory,
  blobHash: string,
): V2MediaPartialFileSink {
  directory.create({ intermediates: true, idempotent: true });
  return new V2MediaPartialFileSink(
    new File(directory, `${blobHash}.partial`),
    new File(directory, `${blobHash}.bin`),
  );
}
