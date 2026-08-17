import { closeSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DETERMINISTIC_FIXTURES,
  FIXTURE_CHUNK_BYTES,
  fillDeterministicFixtureChunk,
} from '../../src/lib/cloudSync/phase0/deterministicFixture';

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error('Usage: generate-media-fixture.ts <output.bin>');
}

const spec = DETERMINISTIC_FIXTURES['full-200mib'];
const absolute = resolve(outputPath);
const descriptor = openSync(absolute, 'wx');
try {
  const chunk = new Uint8Array(FIXTURE_CHUNK_BYTES);
  for (let index = 0; index < spec.totalBytes / FIXTURE_CHUNK_BYTES; index++) {
    fillDeterministicFixtureChunk(index, chunk);
    writeSync(descriptor, chunk);
  }
} finally {
  closeSync(descriptor);
}

console.log(JSON.stringify({
  output: absolute,
  byteCount: spec.totalBytes,
  expectedSha256: spec.expectedSha256,
}, null, 2));
