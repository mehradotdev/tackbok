/**
 * Phase 0 (#185) baseline: the N-device simulation run against the shipped
 * v1 engine (see `sim/v1Adapter.ts`). v1 has known failures, so this test
 * pins them instead of asserting none: the counts and the failing seeds must
 * match `fixtures/v1-sim-baseline.json`. A change in v1 behaviour fails here;
 * if it is intended, rerun with UPDATE_V1_BASELINE=1 and commit the file.
 * SYNC_SIM_SCALE>1 runs more seeds and prints their numbers; the first 300
 * are still compared with the file.
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
  | 'syncFailure'
  | 'unsettled'
  | 'lostMembership';

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
  unsettled: (r) => r.unsettled,
  lostMembership: (r) => r.lostMemberships.length > 0,
};

function tally(results: CaseResult[]) {
  const metrics = Object.keys(METRICS) as Metric[];
  const counts = {} as Record<Metric, number>;
  const failingSeeds = {} as Record<Metric, number[]>;
  for (const metric of metrics) {
    counts[metric] = 0;
    failingSeeds[metric] = [];
  }
  for (const result of results) {
    for (const metric of metrics) {
      if (!METRICS[metric](result)) continue;
      counts[metric]++;
      failingSeeds[metric].push(result.seed);
    }
  }
  return { cases: results.length, counts, failingSeeds };
}

test('v1 baseline: known failures of the shipped merge stay as recorded', async () => {
  const results: CaseResult[] = [];
  for (const seed of seedRange(1, CI_CASES)) {
    const { result } = await runCase(
      (devices) => new V1Adapter(devices),
      configFor(seed),
    );
    results.push(result);
  }
  const all = tally(results);
  console.log(
    'v1 simulation baseline',
    JSON.stringify({ cases: all.cases, counts: all.counts }),
  );
  // The pinned seeds are always compared, whatever SYNC_SIM_SCALE adds.
  const pinned = tally(results.filter((result) => result.seed <= CI_CASES));
  if (process.env.UPDATE_V1_BASELINE === '1') {
    writeFileSync(BASELINE, `${JSON.stringify(pinned, null, 2)}\n`);
    return;
  }
  const expected = JSON.parse(readFileSync(BASELINE, 'utf8')) as typeof pinned;
  if (!Bun.deepEquals(pinned, expected)) {
    // Which seeds changed: replay one with its seed to see why.
    for (const metric of Object.keys(METRICS) as Metric[]) {
      const now = new Set(pinned.failingSeeds[metric]);
      const before = new Set(expected.failingSeeds[metric] ?? []);
      const changed = [...now, ...before].filter(
        (seed) => now.has(seed) !== before.has(seed),
      );
      if (changed.length > 0)
        console.error(`v1 baseline ${metric} changed for seeds`, changed);
    }
  }
  expect(pinned).toEqual(expected);
}, 600_000);
