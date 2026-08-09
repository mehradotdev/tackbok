import { canonicalJsonV1Bytes, type CanonicalJsonValue } from './canonicalJsonV1';
import canonicalFixture from './fixtures/canonical-v1.json';

export interface CanonicalFixtureProbeResult {
  id: string;
  actualByteLength: number;
  expectedByteLength: number;
  byteIdentical: boolean;
}

export interface CanonicalFixtureProbeReport {
  passed: boolean;
  vectors: CanonicalFixtureProbeResult[];
}

/**
 * Run this function inside the Android or iOS app process. It deliberately uses
 * the platform JavaScript runtime's TextEncoder so the Phase-0 gate can detect
 * a runtime-specific canonical UTF-8 mismatch rather than only proving Jest.
 */
export function runCanonicalFixtureDeviceProbe(): CanonicalFixtureProbeReport {
  const textEncoder = new TextEncoder();
  const vectors = canonicalFixture.vectors.map((vector) => {
    const actual = canonicalJsonV1Bytes(vector.value as unknown as CanonicalJsonValue);
    const expected = textEncoder.encode(vector.canonical);
    const byteIdentical =
      actual.length === expected.length &&
      actual.every((byte, index) => byte === expected[index]);

    return {
      id: vector.id,
      actualByteLength: actual.length,
      expectedByteLength: expected.length,
      byteIdentical,
    };
  });

  return {
    passed: vectors.every(({ byteIdentical }) => byteIdentical),
    vectors,
  };
}
