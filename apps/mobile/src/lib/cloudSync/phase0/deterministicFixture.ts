export const FIXTURE_CHUNK_BYTES = 1024 * 1024;

export type DeterministicFixtureId = 'quick-32mib' | 'full-200mib';

export interface DeterministicFixtureSpec {
  id: DeterministicFixtureId;
  totalBytes: number;
  /** Host-computed with scripts/cloud-sync-phase0/fixture-hashes.ts; never derived on-device. */
  expectedSha256: string;
}

/**
 * Fills one 1 MiB fixture chunk with xorshift32 output seeded by the chunk
 * index. The stream is pure integer math so Node, Bun, Hermes, and JSC all
 * produce identical bytes; the host script and the device probe share this
 * exact function.
 */
export function fillDeterministicFixtureChunk(chunkIndex: number, out: Uint8Array): void {
  if (out.length % 4 !== 0) {
    throw new Error('Fixture chunks must be a multiple of 4 bytes');
  }

  let state = (chunkIndex + 0x9e3779b9) >>> 0;
  if (state === 0) {
    state = 0x6c078965;
  }

  for (let index = 0; index < out.length; index += 4) {
    state ^= (state << 13) >>> 0;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    state >>>= 0;
    out[index] = state & 0xff;
    out[index + 1] = (state >>> 8) & 0xff;
    out[index + 2] = (state >>> 16) & 0xff;
    out[index + 3] = (state >>> 24) & 0xff;
  }
}

export const DETERMINISTIC_FIXTURES: Record<DeterministicFixtureId, DeterministicFixtureSpec> = {
  'quick-32mib': {
    id: 'quick-32mib',
    totalBytes: 32 * FIXTURE_CHUNK_BYTES,
    expectedSha256: 'd9b1bdf76d9db342ad851bca6d47d8bc7e78b5ca23ab6a366757eecdf701a51c',
  },
  'full-200mib': {
    id: 'full-200mib',
    totalBytes: 200 * FIXTURE_CHUNK_BYTES,
    expectedSha256: '502bfded85f94ec7c5a6284ba359cc6f219438aada6099ab5f2c8560fcbc3868',
  },
};
