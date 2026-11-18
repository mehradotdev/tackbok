/**
 * Cloud sync v2, step P5 (#185): the N-device simulation run through real
 * SQLite. Edits use the app's repositories; every sync captures from SQLite,
 * joins and applies with `storage/v2State.ts`, and checks that capturing
 * again gives back exactly the joined state. The oracle is the same as for
 * the model (`sim/driver.ts`).
 */
import { describe, expect, test } from 'bun:test';

import { installSqliteDevices } from './sim/sqliteDevices';

const devices = installSqliteDevices();
const { V2StoreAdapter } = await import('./sim/v2StoreAdapter');
const { caseFailed, configFor, describeEvents, runCase, shrinkCase } =
  await import('./sim/driver');
const { seedRange } = await import('./sim/random');
type CaseResult = Awaited<ReturnType<typeof runCase>>['result'];

const SCALE = Number(process.env.SYNC_SIM_SCALE ?? 1);
const failed = (result: CaseResult) =>
  caseFailed(result) ||
  result.staleValues.length > 0 ||
  result.undoneDeletes.length > 0 ||
  result.incompleteEntries.length > 0;

describe('v2 simulation through SQLite', () => {
  test.each([
    ['pairwise', seedRange(1, 150 * SCALE)],
    ['drive', seedRange(200_000, 60 * SCALE)],
    ['engine', seedRange(300_000, 60 * SCALE)],
  ] as const)(
    '%s syncs: devices converge, keep every value, and capture what they applied',
    async (topology, seeds) => {
      const factory = (count: number) => V2StoreAdapter.create(devices, count, topology);
      const failures: CaseResult[] = [];
      let events = 0;
      for (const seed of seeds) {
        const config = configFor(seed);
        const run = await runCase(factory, config);
        events += run.events.length;
        if (!failed(run.result)) continue;
        failures.push(run.result);
        if (failures.length === 1) {
          const small = await shrinkCase(factory, config, run.events, failed, 150);
          console.error(
            `v2 store ${topology} failure, seed ${seed}:\n${describeEvents(small.events)}\n${JSON.stringify(small.result)}`,
          );
        }
      }
      console.log(
        `v2 store ${topology} simulation`,
        JSON.stringify({ cases: seeds.length, events, failures: failures.length }),
      );
      expect(failures.map((result) => result.seed)).toEqual([]);
    },
    600_000,
  );
});
