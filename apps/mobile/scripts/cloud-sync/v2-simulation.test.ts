/**
 * Phase 0 (#185): N-device simulation of the v2 model. 2 to 6 devices make
 * random edits and sync in random orders, then every device syncs with every
 * other. All devices must end byte-identical, and the oracle in
 * `sim/driver.ts` must find no lost authored value, no entry deleted despite
 * an edit its deleter had not seen, no replaced value coming back, and no
 * delete undone without such an edit.
 */
import { describe, expect, test } from 'bun:test';

import {
  caseFailed,
  configFor,
  describeEvents,
  runCase,
  shrinkCase,
  type CaseResult,
} from './sim/driver';
import { seedRange } from './sim/random';
import { V2Adapter } from './sim/v2Adapter';

const v2Failed = (result: CaseResult) =>
  caseFailed(result) || result.staleValues.length > 0 || result.undoneDeletes.length > 0;

describe('v2 N-device simulation', () => {
  test.each([
    ['pairwise', seedRange(1, 2_000)],
    ['drive', seedRange(100_000, 600)],
  ] as const)(
    '%s syncs: every device converges and keeps every authored value',
    async (topology, seeds) => {
      const factory = (devices: number) => new V2Adapter(devices, topology);
      const stats = {
        cases: 0,
        events: 0,
        devices: [0, 0, 0, 0, 0, 0, 0],
        duplicateTitles: 0,
      };
      const kinds: Record<string, number> = {};
      const failures: CaseResult[] = [];
      for (const seed of seeds) {
        const config = configFor(seed);
        const { result, events } = await runCase(factory, config);
        stats.cases++;
        stats.events += events.length;
        stats.devices[config.devices]++;
        if (result.duplicateTitles > 0) stats.duplicateTitles++;
        for (const event of events) kinds[event.kind] = (kinds[event.kind] ?? 0) + 1;
        if (!v2Failed(result)) continue;
        failures.push(result);
        if (failures.length === 1) {
          const small = await shrinkCase(factory, config, events, v2Failed);
          console.error(
            `v2 ${topology} failure, seed ${seed}:\n${describeEvents(small.events)}\n${JSON.stringify(small.result)}`,
          );
        }
      }
      console.log(`v2 ${topology} simulation`, JSON.stringify({ ...stats, kinds }));
      expect(failures.map((result) => result.seed)).toEqual([]);
      expect(kinds.keep ?? 0).toBeGreaterThan(seeds.length / 8);
      expect(kinds.keepBoth ?? 0).toBeGreaterThan(seeds.length / 40);
    },
    600_000,
  );
});
