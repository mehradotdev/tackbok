import {
  canonicalizeJsonV1,
  type CanonicalJsonValue,
} from '../phase0/canonicalJsonV1';
import { sha256Text } from './sha256';

export { canonicalizeJsonV1 } from '../phase0/canonicalJsonV1';
export type { StreamingHashResult } from '../phase0/streamingHashSpike';
export { sha256Bytes, sha256Text } from './sha256';
export { IncrementalSha256 } from './incrementalSha256';

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeJsonV1(value as CanonicalJsonValue));
}

export function hashCanonical(value: unknown): { canonical: string; hash: string } {
  const canonical = canonicalizeJsonV1(value as CanonicalJsonValue);
  return { canonical, hash: sha256Text(canonical) };
}

/** Lazily loads the Phase-0 native module so pure codec tests stay host-runnable. */
export async function hashFileStreaming(uri: string) {
  const { runStreamingHashSpike } = await import('../phase0/streamingHashSpike');
  return runStreamingHashSpike(uri);
}
