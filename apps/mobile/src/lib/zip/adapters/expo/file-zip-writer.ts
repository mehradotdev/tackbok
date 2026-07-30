import { File } from 'expo-file-system';
import {
  createZipWriter,
  type ZipWriter,
  type ZipChunkSource,
} from '../../writer/sequential-writer';
import { getFileByteSize } from './file-bytes';

const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * How many bytes to stream between yields back to the event loop. Expo file
 * reads/writes are synchronous, so without a real macrotask yield the JS
 * thread (and therefore the UI) is frozen for the whole export.
 */
const YIELD_INTERVAL_BYTES = 4 * 1024 * 1024;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * File-backed ZIP writer used by mobile backup export.
 */
export interface ExpoZipWriter extends ZipWriter {
  readonly outputFile: File;
  addFile(path: string, fileOrUri: File | string): Promise<void>;
}

/**
 * Adapts an Expo file into a chunk source for the streaming ZIP writer.
 *
 * The source keeps one native handle open for the whole file instead of
 * paying an open/close round-trip per chunk, and periodically yields a
 * macrotask so the UI can render between chunks.
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
      const handle = file.open();
      try {
        let bytesSinceYield = 0;
        for (let offset = 0; offset < fileSize; offset += chunkSize) {
          const length = Math.min(chunkSize, fileSize - offset);
          handle.offset = offset;
          const chunk = handle.readBytes(length);
          if (chunk.length !== length) {
            throw new Error(`File shrank while being added to the ZIP: ${file.uri}`);
          }

          bytesSinceYield += length;
          if (bytesSinceYield >= YIELD_INTERVAL_BYTES) {
            bytesSinceYield = 0;
            await yieldToEventLoop();
          }

          yield chunk;
        }
      } finally {
        handle.close();
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
