/**
 * `reissueWrites` (#185, P8) on states reached by random multi-device
 * histories: the result is a valid state that shows exactly what the
 * original showed, and no write of the old ID past the cut is left.
 */
import { describe, expect, test } from 'bun:test';

import { highestTime } from '../../src/lib/cloudSync/v2/clock';
import { decodeEnvelope, encodeEnvelope } from '../../src/lib/cloudSync/v2/codec';
import { absorb } from '../../src/lib/cloudSync/v2/compact';
import { reissueWrites } from '../../src/lib/cloudSync/v2/reissue';
import type { SyncState } from '../../src/lib/cloudSync/v2/types';
import {
  attachmentIds,
  isLive,
  isReturned,
  memberIds,
  shownItems,
  shownNamed,
} from '../../src/lib/cloudSync/v2/view';
import { configFor, runCase } from './sim/driver';
import { Random, seedRange } from './sim/random';
import { V2Adapter } from './sim/v2Adapter';

const SCALE = Number(process.env.SYNC_SIM_SCALE ?? 1);

async function samplePool(seed: number): Promise<SyncState[]> {
  const pool: SyncState[] = [];
  await runCase(
    (devices) => new V2Adapter(devices, 'pairwise', absorb, (state) => pool.push(state)),
    configFor(seed),
  );
  return pool;
}

/** Everything a device shows, in a comparable form. */
function shown(state: SyncState) {
  return JSON.stringify({
    entries: [...state.entries.values()]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((entry) => ({
        id: entry.id,
        live: isLive(entry),
        returned: isReturned(entry),
        title: shownItems(entry.title).map((item) => item.v),
        text: shownItems(entry.text).map((item) => item.v),
        mood: entry.mood?.v ?? null,
        date: entry.date?.v ?? null,
        tags: memberIds(entry.tags),
        attachments: attachmentIds(entry),
      })),
    tags: shownNamed(state, 'tag'),
    prompts: shownNamed(state, 'prompt'),
    name: shownItems(state.profile.name).map((item) => item.v),
    photo: shownItems(state.profile.photo).map((item) => item.v),
  });
}

function oldStampsPast(state: SyncState, from: string, keepUpTo: number): number {
  let found = 0;
  const visit = (value: unknown, key?: string): void => {
    if (key === 'split') return;
    if (Array.isArray(value)) {
      if (
        value.length === 2 &&
        typeof value[0] === 'number' &&
        value[1] === from &&
        value[0] > keepUpTo
      )
        found += 1;
      else value.forEach((item) => visit(item));
    } else if (value instanceof Map) value.forEach((item) => visit(item));
    else if (value && typeof value === 'object')
      for (const [name, item] of Object.entries(value)) visit(item, name);
  };
  visit({ ...state, roster: {}, ctx: {}, acks: {}, floor: null });
  return found;
}

describe('reissueWrites', () => {
  test(
    'valid, shows the same journal, and leaves no old write past the cut',
    async () => {
      let checked = 0;
      for (const seed of seedRange(1, 40 * SCALE)) {
        const rng = new Random(seed * 7919);
        const pool = await samplePool(seed);
        for (let sample = 0; sample < 6 && pool.length > 0; sample++) {
          const state = pool[rng.int(0, pool.length - 1)];
          const devices = Object.keys(state.ctx);
          if (devices.length === 0) continue;
          const from = devices[rng.int(0, devices.length - 1)];
          const top = state.ctx[from];
          const hlcs = rng.pick(['same', 'after'] as const);
          let others = -1;
          for (const [device, hlc] of Object.entries(state.ctx))
            if (device !== from) others = Math.max(others, hlc);
          // A clock far ahead: the writes that move are above every other
          // device's (they are from the future), so the cut is at least there.
          const keepUpTo =
            hlcs === 'same'
              ? rng.pick([-1, Math.floor(top / 2), top - 1, top])
              : Math.max(others, rng.pick([-1, top - 1]));
          // Sorts like `from` among these devices, so ties on one HLC (broken
          // by device ID) keep their order; see the module's shortcut.
          const to = `${from}~`;
          const result = reissueWrites(state, { from, to, keepUpTo, hlcs });
          const context = `seed ${seed}, from ${from}, keepUpTo ${keepUpTo}, ${hlcs}`;
          const encoded = encodeEnvelope(result, {
            // The author is put on the roster when it publishes (`markSeen`).
            authorDeviceId: to in result.roster ? to : from,
            deviceSequence: 1,
            createdAt: 1,
          });
          const decoded = decodeEnvelope(encoded.bytes, encoded.snapshotId).state;
          expect(shown(decoded), context).toBe(shown(state));
          expect(oldStampsPast(result, from, keepUpTo), context).toBe(0);
          if (hlcs === 'after' && keepUpTo >= 0) {
            const moved = oldStampsPast(state, from, keepUpTo);
            expect(highestTime(result), context).toBeLessThanOrEqual(
              Math.max(keepUpTo + moved, highestTime({ ctx: {}, roster: result.roster })),
            );
            expect(result.ctx[from] ?? -1, context).toBeLessThanOrEqual(keepUpTo);
          }
          checked += 1;
        }
      }
      console.log('reissue checks', checked);
      expect(checked).toBeGreaterThan(100);
    },
    120_000 * SCALE,
  );
});
