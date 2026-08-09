import golden from '../phase0/fixtures/canonical-v1.json';
import type { CanonicalJsonValue } from '../protocol/canonicalJsonV1';
import { canonicalizeJsonV1, IncrementalSha256, sha256Text } from '.';

test('production codec stays byte-identical to every frozen Phase-0 vector', () => {
  for (const vector of golden.vectors) {
    const canonical = canonicalizeJsonV1(vector.value as unknown as CanonicalJsonValue);
    expect(canonical).toBe(vector.canonical);
    expect(sha256Text(canonical)).toBe(vector.sha256);
  }
});

test('incremental metadata/network hashing matches the frozen digest across chunking', () => {
  const value = golden.vectors[1].canonical;
  const bytes = new TextEncoder().encode(value);
  const hash = new IncrementalSha256();
  for (let offset = 0; offset < bytes.length; offset += 3) {
    hash.update(bytes.subarray(offset, offset + 3));
  }
  expect(hash.digestHex()).toBe(golden.vectors[1].sha256);
});
