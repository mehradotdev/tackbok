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
/**
 * Long cases for media garbage collection: 75 to 125 days at 12 hours per
 * event, with few devices so each syncs every few days, and more photos
 * and deletes.
 */
function gcConfig(seed: number) {
  const config = configFor(seed);
  return {
    ...config,
    devices: 2 + (seed % 3),
    steps: 150 + (seed % 101),
    msPerEvent: 12 * 60 * 60 * 1000,
    weights: { attach: 6, detach: 3, deleteEntry: 3, setProfilePhoto: 2 },
  };
}
const failed = (result: CaseResult) =>
  caseFailed(result) ||
  result.staleValues.length > 0 ||
  result.undoneDeletes.length > 0 ||
  result.incompleteEntries.length > 0;

describe('v2 simulation through SQLite', () => {
  test.each([
    ['pairwise', seedRange(1, 150 * SCALE)],
    ['drive', seedRange(200_000, 60 * SCALE)],
    // 300_073: an entry back after its delete was compacted (#185 P6b).
    ['engine', [...new Set([...seedRange(300_000, 60 * SCALE), 300_073])]],
    // A dead device's unreadable heads in the vault (#185 P8): skipped, never a pause.
    ['engine-damaged', seedRange(400_000, 30 * SCALE)],
    // Months of use with attachments (#185 P12): media garbage collection
    // runs, and no snapshot on Drive ever refers to a deleted blob.
    ['engine-gc', seedRange(500_000, 20 * SCALE)],
  ] as const)(
    '%s syncs: devices converge, keep every value, and capture what they applied',
    async (name, seeds) => {
      const topology =
        name === 'engine-damaged' || name === 'engine-gc' ? 'engine' : name;
      let collected = 0;
      const factory = async (count: number) => {
        const adapter = await V2StoreAdapter.create(devices, count, topology);
        adapter.damagedHeads = name === 'engine-damaged';
        adapters.push(adapter);
        return adapter;
      };
      const adapters: Awaited<ReturnType<typeof V2StoreAdapter.create>>[] = [];
      const failures: CaseResult[] = [];
      let events = 0;
      for (const seed of seeds) {
        const config = name === 'engine-gc' ? gcConfig(seed) : configFor(seed);
        const run = await runCase(factory, config);
        events += run.events.length;
        collected += adapters.at(-1)!.collectedBlobs;
        if (!failed(run.result)) continue;
        failures.push(run.result);
        if (failures.length === 1) {
          const small = await shrinkCase(factory, config, run.events, failed, 150);
          console.error(
            `v2 store ${name} failure, seed ${seed}:\n${describeEvents(small.events)}\n${JSON.stringify(small.result)}`,
          );
        }
      }
      console.log(
        `v2 store ${name} simulation`,
        JSON.stringify({
          cases: seeds.length,
          events,
          failures: failures.length,
          ...(topology === 'engine' ? { collectedBlobs: collected } : {}),
        }),
      );
      expect(failures.map((result) => result.seed)).toEqual([]);
      // The GC runs must have collected something, or they prove nothing.
      if (name === 'engine-gc') expect(collected).toBeGreaterThan(0);
    },
    600_000 * SCALE,
  );
});
