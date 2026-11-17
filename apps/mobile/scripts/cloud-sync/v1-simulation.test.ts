/**
 * Phase 0 (#185) baseline: the N-device simulation run against the shipped
 * v1 engine (see `sim/v1Adapter.ts`). v1 has known failures, so this test
 * pins them instead of asserting none: the counts and the failing seeds must
 * match `fixtures/v1-sim-baseline.json`. A change in v1 behaviour fails here;
 * if it is intended, rerun with UPDATE_V1_BASELINE=1 and commit the file.
 * SYNC_SIM_SCALE>1 runs more seeds and only prints the numbers.
 */
import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { configFor, runCase, type CaseResult } from './sim/driver';
import { seedRange } from './sim/random';
import { V1Adapter } from './sim/v1Adapter';

const BASELINE = join(import.meta.dir, 'fixtures/v1-sim-baseline.json');
const CI_CASES = 300;

type Metric =
  | 'notConverged'
  | 'lostText'
  | 'lostKeptVersion'
  | 'keptBothLost'
  | 'lostEntry'
  | 'staleValue'
  | 'undoneDelete'
  | 'duplicateTitle'
  | 'syncFailure';

const METRICS: Record<Metric, (result: CaseResult) => boolean> = {
  notConverged: (r) => !r.converged,
  lostText: (r) => r.lostTexts.length > 0,
  lostKeptVersion: (r) => r.lostKept.length > 0,
  keptBothLost: (r) => r.keptBothLost > 0,
  lostEntry: (r) => r.lostEntries.length > 0,
  staleValue: (r) => r.staleValues.length > 0,
  undoneDelete: (r) => r.undoneDeletes.length > 0,
  duplicateTitle: (r) => r.duplicateTitles > 0,
  syncFailure: (r) => r.syncFailures.length > 0,
};

test('v1 baseline: known failures of the shipped merge stay as recorded', async () => {
  const seeds = seedRange(1, CI_CASES);
  const metrics = Object.keys(METRICS) as Metric[];
  const counts = {} as Record<Metric, number>;
  const failingSeeds = {} as Record<Metric, number[]>;
  for (const metric of metrics) {
    counts[metric] = 0;
    failingSeeds[metric] = [];
  }
  for (const seed of seeds) {
    const { result } = await runCase(
      (devices) => new V1Adapter(devices),
      configFor(seed),
    );
    for (const metric of metrics) {
      if (!METRICS[metric](result)) continue;
      counts[metric]++;
      failingSeeds[metric].push(seed);
    }
  }
  const summary = { cases: seeds.length, counts, failingSeeds };
  console.log('v1 simulation baseline', JSON.stringify({ cases: seeds.length, counts }));
  if (seeds.length !== CI_CASES) return;
  if (process.env.UPDATE_V1_BASELINE === '1') {
    writeFileSync(BASELINE, `${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  expect(summary).toEqual(JSON.parse(readFileSync(BASELINE, 'utf8')));
}, 600_000);
