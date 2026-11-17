/**
 * Phase 0 (#185): N-device simulation of the v2 model. 2 to 6 devices make
 * random edits and sync in random orders, then every device syncs with every
 * other. All devices must end byte-identical, and the oracle in
 * `sim/driver.ts` must find no lost authored value, no entry deleted despite
 * an edit its deleter had not seen, no replaced value coming back, and no
 * delete undone without such an edit.
 */
import { describe, expect, test } from 'bun:test';

import { compact, isCompacted } from '../../src/lib/cloudSync/v2/compact';
import type { SyncState } from '../../src/lib/cloudSync/v2/types';
import {
  caseFailed,
  configFor,
  describeEvents,
  replayCase,
  runCase,
  shrinkCase,
  type CaseResult,
} from './sim/driver';
import { seedRange } from './sim/random';
import { V2Adapter } from './sim/v2Adapter';

const v2Failed = (result: CaseResult) =>
  caseFailed(result) ||
  result.staleValues.length > 0 ||
  result.undoneDeletes.length > 0 ||
  result.incompleteEntries.length > 0;

describe('v2 N-device simulation', () => {
  test.each([
    ['pairwise', seedRange(1, 2_000)],
    ['drive', seedRange(100_000, 600)],
  ] as const)(
    '%s syncs: every device converges and keeps every authored value',
    async (topology, seeds) => {
      const stats = {
        cases: 0,
        events: 0,
        devices: [0, 0, 0, 0, 0, 0, 0],
        duplicateTitles: 0,
        /** Cases ending with at least one compacted entry. */
        compactedCases: 0,
        compactedEntries: 0,
        /** Cases where an unseen edit brought an entry back after compaction. */
        revivedCases: 0,
        /** Cases where a device refused a state whose clock was too far ahead. */
        refusedCases: 0,
      };
      let adapter: V2Adapter | null = null;
      const factory = (devices: number) => (adapter = new V2Adapter(devices, topology));
      const kinds: Record<string, number> = {};
      const failures: CaseResult[] = [];
      for (const seed of seeds) {
        const config = configFor(seed);
        const { result, events } = await runCase(factory, config);
        stats.cases++;
        stats.events += events.length;
        stats.devices[config.devices]++;
        if (result.duplicateTitles > 0) stats.duplicateTitles++;
        const compacted = [...adapter!.states[0].entries.values()].filter(
          isCompacted,
        ).length;
        stats.compactedEntries += compacted;
        if (compacted > 0) stats.compactedCases++;
        if (result.revived > 0) stats.revivedCases++;
        if (adapter!.refusedPulls > 0) stats.refusedCases++;
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
      // Display-level merge: no two shown tags or prompts share a title.
      expect(stats.duplicateTitles).toBe(0);
      // The generator reaches compaction, entries brought back after it and refused clocks.
      expect(stats.compactedCases).toBeGreaterThan(seeds.length / 10);
      expect(stats.revivedCases).toBeGreaterThan(0);
      expect(stats.refusedCases).toBeGreaterThan(0);
    },
    600_000,
  );

  test('compaction changes nothing shown except entries brought back after it', async () => {
    // The same events with and without compaction: every device shows the
    // same entries, tags, prompts and profile. An entry an unseen edit brings
    // back after compaction may show older values (compact.ts).
    let compared = 0,
      revivedCases = 0;
    const mismatches: number[] = [];
    for (const seed of seedRange(200_000, 500)) {
      const config = configFor(seed);
      let withCompaction: V2Adapter | null = null;
      const { result, events } = await runCase(
        (devices) => (withCompaction = new V2Adapter(devices)),
        config,
      );
      let without: V2Adapter | null = null;
      await replayCase(
        (devices) =>
          (without = new V2Adapter(devices, 'pairwise', undefined, undefined, false)),
        config,
        events,
      );
      if (result.revived > 0) revivedCases++;
      const revived = new Set(withCompaction!.revivedEntries);
      for (let device = 0; device < config.devices; device++) {
        const a = withCompaction!.view(device),
          b = without!.view(device);
        const strip = (view: typeof a) => ({
          ...view,
          entries: view.entries.filter((entry) => !revived.has(entry.id)),
        });
        compared++;
        // The same entries are shown, brought back or not...
        if (
          JSON.stringify(a.entries.map((e) => e.id)) !==
            JSON.stringify(b.entries.map((e) => e.id)) ||
          // ...and everything else is identical.
          JSON.stringify(strip(a)) !== JSON.stringify(strip(b))
        )
          mismatches.push(seed);
      }
    }
    console.log('v2 compaction comparison', JSON.stringify({ compared, revivedCases }));
    expect([...new Set(mismatches)]).toEqual([]);
    expect(revivedCases).toBeGreaterThan(0);
  }, 600_000);

  test('negative control: compaction whose empty copy removes values brings entries back partly', async () => {
    // Compacting without emptying `known` lets the compacted copy remove the
    // returning device's values: the entry comes back without its title or text.
    const naive = (state: SyncState) => {
      const compacted = compact(state);
      const entries = new Map(compacted.entries);
      for (const [id, entry] of compacted.entries) {
        const before = state.entries.get(id)!;
        if (isCompacted(entry) && !isCompacted(before))
          entries.set(id, {
            ...entry,
            known: null,
            mood: before.mood,
            date: before.date,
          });
      }
      return { ...compacted, entries };
    };
    let caught: CaseResult | null = null;
    for (const seed of seedRange(1, 2_000)) {
      const { result } = await runCase(
        (devices) =>
          new V2Adapter(devices, 'pairwise', undefined, undefined, true, naive),
        configFor(seed),
      );
      if (v2Failed(result)) {
        caught = result;
        break;
      }
    }
    expect(caught?.incompleteEntries.length ?? 0).toBeGreaterThan(0);
  }, 600_000);
});
