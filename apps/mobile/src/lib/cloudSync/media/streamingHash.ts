import { requireNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';

interface StreamingHashNativeModule {
  sha256File(uri: string): Promise<{
    sha256: string;
    bytesRead: number;
    maximumReadBytes: number;
  }>;
}

/** Production entry point for the Phase-0 native streaming module. */
export async function hashLocalMediaFile(uri: string): Promise<string> {
  const resolvedUri = uri.startsWith('file:') || uri.startsWith('/')
    ? uri
    : new File(Paths.document, uri).uri;
  const result = await requireNativeModule<StreamingHashNativeModule>(
    'StreamingHashModule',
  ).sha256File(resolvedUri);
  if (!/^[a-f0-9]{64}$/.test(result.sha256)) throw new Error('invalid-streaming-hash');
  if (result.maximumReadBytes > 1024 * 1024) throw new Error('unbounded-streaming-hash-read');
  return result.sha256;
}
