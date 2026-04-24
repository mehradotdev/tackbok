import { File } from 'expo-file-system';
import {
  createZipWriter,
  type ZipWriter,
  type ZipChunkSource,
} from '../../writer/sequential-writer';
import { getFileByteSize, readFileBytesRange } from './file-bytes';

const DEFAULT_CHUNK_SIZE = 256 * 1024;

/**
 * File-backed ZIP writer used by mobile backup export.
 */
export interface ExpoZipWriter extends ZipWriter {
  readonly outputFile: File;
  addFile(path: string, fileOrUri: File | string): Promise<void>;
}

/**
 * Adapts an Expo file into a chunk source for the streaming ZIP writer.
 */
function createFileZipChunkSource(
  fileOrUri: File | string,
  chunkSize = DEFAULT_CHUNK_SIZE,
): ZipChunkSource {
  const file = typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;
  const fileSize = getFileByteSize(file);

  return {
    size: BigInt(fileSize),
    async *chunks(): AsyncIterable<Uint8Array> {
      for (let offset = 0; offset < fileSize; offset += chunkSize) {
        const length = Math.min(chunkSize, fileSize - offset);
        yield readFileBytesRange(file, offset, length);
      }
    },
  };
}

/**
 * Creates an Expo-backed ZIP writer that writes entries directly to disk.
 */
export function createExpoZipWriter(fileOrUri: File | string): ExpoZipWriter {
  const file = typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;

  if (file.exists) {
    file.delete();
  }

  file.create();
  const handle = file.open();
  const writer = createZipWriter({
    async write(bytes: Uint8Array): Promise<void> {
      if (bytes.length === 0) {
        return;
      }

      handle.writeBytes(bytes);
    },
    async close(): Promise<void> {
      handle.close();
    },
  });

  return {
    outputFile: file,
    addBytes(path: string, bytes: Uint8Array, noCompress?: boolean): Promise<void> {
      return writer.addBytes(path, bytes, noCompress);
    },
    addText(path: string, text: string): Promise<void> {
      return writer.addText(path, text);
    },
    addStored(path: string, source: ZipChunkSource): Promise<void> {
      return writer.addStored(path, source);
    },
    addFile(path: string, sourceFile: File | string): Promise<void> {
      return writer.addStored(path, createFileZipChunkSource(sourceFile));
    },
    close(): Promise<void> {
      return writer.close();
    },
    abort(): Promise<void> {
      return writer.abort();
    },
  };
}
