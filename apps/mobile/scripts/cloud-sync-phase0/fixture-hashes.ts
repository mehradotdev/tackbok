import { createHash } from 'node:crypto';

import {
  DETERMINISTIC_FIXTURES,
  FIXTURE_CHUNK_BYTES,
  fillDeterministicFixtureChunk,
} from '../../src/lib/cloudSync/phase0/deterministicFixture';

for (const spec of Object.values(DETERMINISTIC_FIXTURES)) {
  const hash = createHash('sha256');
  const chunk = new Uint8Array(FIXTURE_CHUNK_BYTES);
  const chunkCount = spec.totalBytes / FIXTURE_CHUNK_BYTES;
  const startedAt = performance.now();

  for (let index = 0; index < chunkCount; index += 1) {
    fillDeterministicFixtureChunk(index, chunk);
    hash.update(chunk);
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  const digest = hash.digest('hex');
  const matches =
    spec.expectedSha256 === digest ? 'matches frozen constant' : 'UPDATE deterministicFixture.ts';
  console.log(`${spec.id}: ${digest} (${elapsedMs} ms) — ${matches}`);
}
