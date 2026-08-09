import { File, FileMode, Paths } from 'expo-file-system';
import type { SizedByteSource } from '../providers';

const READ_CHUNK_BYTES = 1024 * 1024;

function resolveLocalFile(uri: string): File {
  return uri.startsWith('file:') || uri.startsWith('/')
    ? new File(uri)
    : new File(Paths.document, uri);
}

/** Bounded production upload source; no complete media file enters JS memory. */
export function createLocalMediaByteSource(
  uri: string,
  contentHash: string,
): SizedByteSource | null {
  const file = resolveLocalFile(uri);
  if (!file.exists || file.size === null) return null;
  const byteLength = file.size;
  return {
    byteLength,
    contentHash,
    chunks: {
      async *[Symbol.asyncIterator]() {
        const handle = file.open(FileMode.ReadOnly);
        let delivered = 0;
        try {
          while (delivered < byteLength) {
            const bytes = handle.readBytes(Math.min(READ_CHUNK_BYTES, byteLength - delivered));
            if (bytes.length === 0) break;
            delivered += bytes.length;
            yield bytes;
          }
        } finally {
          handle.close();
        }
      },
    },
  };
}
