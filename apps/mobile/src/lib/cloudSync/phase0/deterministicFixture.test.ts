import { createHash } from 'node:crypto';

import {
  DETERMINISTIC_FIXTURES,
  FIXTURE_CHUNK_BYTES,
  fillDeterministicFixtureChunk,
} from './deterministicFixture';

describe('Phase-0 deterministic hash fixture', () => {
  it('reproduces the frozen quick-fixture SHA-256 on the host runtime', () => {
    const spec = DETERMINISTIC_FIXTURES['quick-32mib'];
    const hash = createHash('sha256');
    const chunk = new Uint8Array(FIXTURE_CHUNK_BYTES);
    for (let index = 0; index < spec.totalBytes / FIXTURE_CHUNK_BYTES; index += 1) {
      fillDeterministicFixtureChunk(index, chunk);
      hash.update(chunk);
    }
    expect(hash.digest('hex')).toBe(spec.expectedSha256);
  });

  it('produces distinct chunks and stable bytes per chunk index', () => {
    const a = new Uint8Array(FIXTURE_CHUNK_BYTES);
    const b = new Uint8Array(FIXTURE_CHUNK_BYTES);
    const aAgain = new Uint8Array(FIXTURE_CHUNK_BYTES);
    fillDeterministicFixtureChunk(0, a);
    fillDeterministicFixtureChunk(1, b);
    fillDeterministicFixtureChunk(0, aAgain);
    expect(aAgain).toEqual(a);
    expect(b).not.toEqual(a);
    expect(DETERMINISTIC_FIXTURES['full-200mib'].totalBytes % FIXTURE_CHUNK_BYTES).toBe(0);
  });
});
