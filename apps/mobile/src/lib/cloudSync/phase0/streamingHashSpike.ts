import { requireNativeModule } from 'expo';

export type StreamingHashResult = {
  sha256: string;
  bytesRead: number;
  elapsedMs: number;
  maximumReadBytes: number;
};

type StreamingHashNativeModule = {
  sha256File(uri: string): Promise<StreamingHashResult>;
};

export type StreamingHashBenchmark = StreamingHashResult & {
  mebibytesPerSecond: number;
  passesThroughputTarget: boolean;
  respectsBoundedRead: boolean;
};

const ONE_MEBIBYTE = 1024 * 1024;
export const STREAMING_HASH_TARGET_MIB_PER_SECOND = 25;

function getNativeModule(): StreamingHashNativeModule {
  return requireNativeModule<StreamingHashNativeModule>('StreamingHashModule');
}

/**
 * Callable Phase-0 device probe. The caller supplies the platform file URI for
 * the 200 MiB fixture and persists the returned JSON in the spike report.
 */
export async function runStreamingHashSpike(fileUri: string): Promise<StreamingHashBenchmark> {
  const result = await getNativeModule().sha256File(fileUri);
  const seconds = result.elapsedMs / 1000;
  const mebibytesPerSecond = result.bytesRead / ONE_MEBIBYTE / seconds;

  return {
    ...result,
    mebibytesPerSecond,
    passesThroughputTarget: mebibytesPerSecond >= STREAMING_HASH_TARGET_MIB_PER_SECOND,
    respectsBoundedRead: result.maximumReadBytes <= ONE_MEBIBYTE,
  };
}
