/**
 * Phase 0 (#185) go/no-go evidence: algebraic properties of the v2 join on
 * states reached by random operations, compared as canonical bytes.
 *
 * States come from random 2-6 device simulations (every state any device held
 * along the way), plus "damaged" copies missing random records, as after a
 * capture bug. CI runs a fixed seed set; SYNC_SIM_SCALE=10 runs ten times more.
 * Negative controls check that the same harness catches broken joins.
 */
import { describe, expect, test } from 'bun:test';

import {
  canonicalState,
  decodeEnvelope,
  encodeEnvelope,
} from '../../src/lib/cloudSync/v2/codec';
import { absorb, compact, isCompacted } from '../../src/lib/cloudSync/v2/compact';
import { join, pruneMedia } from '../../src/lib/cloudSync/v2/join';
import { markSeen } from '../../src/lib/cloudSync/v2/ops';
import type { EntryRecord, SyncState } from '../../src/lib/cloudSync/v2/types';
import {
  attachmentIds,
  isLive,
  isReturned,
  liveEntries,
  liveTags,
  memberIds,
  shownItems,
  shownNamed,
} from '../../src/lib/cloudSync/v2/view';
import { configFor, runCase, caseFailed, type CaseResult } from './sim/driver';
import { Random, seedRange } from './sim/random';
import { V2Adapter, plainMerge } from './sim/v2Adapter';

type Join = (left: SyncState, right: SyncState) => SyncState;

/** Seeds from this one on run a mix focused on last-writer-wins ties. */
const TIE_SEEDS = 1_000_000;

function sampleConfig(seed: number) {
  const config = configFor(seed);
  if (seed < TIE_SEEDS) return config;
  return { ...config, coarseClock: true, weights: { setMood: 40, setDate: 30 } };
}

async function samplePool(seed: number): Promise<SyncState[]> {
  const pool: SyncState[] = [];
  await runCase(
    (devices) => new V2Adapter(devices, 'pairwise', absorb, (state) => pool.push(state)),
    sampleConfig(seed),
  );
  return pool;
}

/** A copy missing random entries and prompts, keeping its context: absence is not deletion. */
function damage(state: SyncState, rng: Random): SyncState {
  const entries = new Map([...state.entries].filter(() => !rng.chance(0.35)));
  const prompts = new Map([...state.prompts].filter(() => !rng.chance(0.35)));
  return {
    ...state,
    entries,
    prompts,
    media: pruneMedia(state.media, entries, state.profile),
  };
}

const PROPERTIES = [
  'commutative',
  'associative',
  'idempotent',
  'absorbs',
  'encodes',
  'missing-never-deletes',
  'compaction-hides-nothing',
  'compaction-idempotent',
  'compaction-keeps-liveness',
] as const;
type Property = (typeof PROPERTIES)[number];

const C = canonicalState;

/** The first property that fails for (a, b, c), or null. */
function checkTriple(
  joinStates: Join,
  a: SyncState,
  b: SyncState,
  c: SyncState,
  partial: SyncState,
  counts: Record<Property, number>,
): Property | null {
  const ab = joinStates(a, b);
  counts.commutative++;
  if (C(ab) !== C(joinStates(b, a))) return 'commutative';
  counts.associative++;
  if (C(joinStates(ab, c)) !== C(joinStates(a, joinStates(b, c)))) return 'associative';
  counts.idempotent++;
  // A deep copy: `join` returns its argument when both sides are the same object.
  if (C(joinStates(a, structuredClone(a))) !== C(a)) return 'idempotent';
  counts.absorbs++;
  if (C(joinStates(ab, structuredClone(a))) !== C(ab)) return 'absorbs';
  counts.encodes++;
  // The publisher puts itself on the roster first.
  const published = markSeen(ab, { device: 'device-publisher', wallMs: 1 });
  const encoded = encodeEnvelope(published, {
    authorDeviceId: 'device-publisher',
    deviceSequence: 1,
    createdAt: 1,
  });
  if (C(decodeEnvelope(encoded.bytes, encoded.snapshotId).state) !== C(published))
    return 'encodes';
  // `partial` lacks some of c's records: joining it with a must keep every
  // record of a it lacks exactly as a has it, live or not.
  counts['missing-never-deletes']++;
  const withPartial = joinStates(a, partial);
  for (const [id, record] of a.entries) {
    if (partial.entries.has(id)) continue;
    const result = withPartial.entries.get(id);
    if (!result || !Bun.deepEquals(result, record) || isLive(result) !== isLive(record))
      return 'missing-never-deletes';
  }
  for (const [id, record] of a.prompts) {
    if (partial.prompts.has(id)) continue;
    if (!Bun.deepEquals(withPartial.prompts.get(id), record))
      return 'missing-never-deletes';
  }
  // Compaction: what is shown stays the same; compacting again changes
  // nothing; and joining a compacted copy shows the same records as joining
  // the uncompacted one, so it never brings a deleted entry back or hides one.
  const compacted = compact(ab);
  counts['compaction-hides-nothing']++;
  if (JSON.stringify(shown(compacted)) !== JSON.stringify(shown(ab)))
    return 'compaction-hides-nothing';
  counts['compaction-idempotent']++;
  if (C(compact(compacted)) !== C(compacted)) return 'compaction-idempotent';
  counts['compaction-keeps-liveness']++;
  const plain = joinStates(ab, c),
    early = joinStates(compacted, c);
  for (const [id, record] of plain.entries)
    if (isLive(record) !== isLive(early.entries.get(id)!))
      return 'compaction-keeps-liveness';
  return null;
}

/** What a device shows, in the simulation's terms. */
function shown(state: SyncState) {
  return {
    entries: liveEntries(state).map((entry) => ({
      id: entry.id,
      title: shownItems(entry.title).map((item) => item.v),
      text: shownItems(entry.text).map((item) => item.v),
      mood: entry.mood?.v,
      date: entry.date?.v,
      tags: memberIds(entry.tags),
      media: attachmentIds(entry),
      returned: isReturned(entry),
      ext: entry.ext,
    })),
    tags: shownNamed(state, 'tag'),
    prompts: shownNamed(state, 'prompt'),
    name: shownItems(state.profile.name).map((item) => item.v),
    photo: shownItems(state.profile.photo).map((item) => item.v),
  };
}

/** How often the sampled joins exercise each rule (guards against weak generators). */
interface Coverage {
  joins: number;
  openConflict: number;
  returnedEntry: number;
  hiddenEntry: number;
  tagByReference: number;
  droppedItem: number;
  lwwTie: number;
  bothDeleted: number;
  acknowledged: number;
  ordered: number;
  /** A side holds a compacted entry the other side still has values for. */
  compactedMeetsValues: number;
  /** An entry is shown after the join although one side had compacted it. */
  revived: number;
  /** Both sides carry extension items on one entry. */
  extJoined: number;
}

function cover(coverage: Coverage, a: SyncState, b: SyncState, ab: SyncState) {
  coverage.joins++;
  const entries = [...ab.entries.values()];
  if (
    entries.some(
      (e) =>
        isLive(e) && (shownItems(e.title).length > 1 || shownItems(e.text).length > 1),
    ) ||
    shownItems(ab.profile.name).length > 1
  )
    coverage.openConflict++;
  if (entries.some(isReturned)) coverage.returnedEntry++;
  if (entries.some((e) => !isLive(e))) coverage.hiddenEntry++;
  if (liveTags(ab).some((tag) => !isLive(tag))) coverage.tagByReference++;
  const items = (e: EntryRecord | undefined) =>
    e ? e.title.length + e.text.length + e.tags.length : 0;
  let dropped = false,
    tie = false,
    bothDeleted = false;
  for (const [id, left] of a.entries) {
    const right = b.entries.get(id);
    if (!right) continue;
    const joined = ab.entries.get(id)!;
    if (items(joined) < Math.max(items(left), items(right))) dropped = true;
    for (const [l, r] of [
      [left.mood?.s, right.mood?.s],
      [left.date?.s, right.date?.s],
    ])
      if (l && r && l[0] === r[0] && l[1] !== r[1]) tie = true;
    if (left.del && right.del && !Bun.deepEquals(left.del, right.del)) bothDeleted = true;
  }
  if (dropped) coverage.droppedItem++;
  if (tie) coverage.lwwTie++;
  if (bothDeleted) coverage.bothDeleted++;
  if (entries.some((e) => e.del?.ackSeen)) coverage.acknowledged++;
  if (entries.some((e) => e.order)) coverage.ordered++;
  let meets = false,
    revived = false,
    ext = false;
  for (const [id, left] of a.entries) {
    const right = b.entries.get(id);
    if (!right) continue;
    if (isCompacted(left) !== isCompacted(right)) {
      meets = true;
      if (isLive(ab.entries.get(id)!)) revived = true;
    }
    if (Object.keys(left.ext).length > 0 && Object.keys(right.ext).length > 0) ext = true;
  }
  if (meets) coverage.compactedMeetsValues++;
  if (revived) coverage.revived++;
  if (ext) coverage.extJoined++;
}

interface Failure {
  property: Property;
  seed: number;
  triple: number;
  sizes: number[];
}

async function runProperties(
  joinStates: Join,
  seeds: number[],
  triplesPerSeed: number,
  stopAtFirst: boolean,
) {
  const counts = Object.fromEntries(PROPERTIES.map((p) => [p, 0])) as Record<
    Property,
    number
  >;
  const coverage: Coverage = {
    joins: 0,
    openConflict: 0,
    returnedEntry: 0,
    hiddenEntry: 0,
    tagByReference: 0,
    droppedItem: 0,
    lwwTie: 0,
    bothDeleted: 0,
    acknowledged: 0,
    ordered: 0,
    compactedMeetsValues: 0,
    revived: 0,
    extJoined: 0,
  };
  const failures: Failure[] = [];
  for (const seed of seeds) {
    const pool = await samplePool(seed);
    if (pool.length === 0) continue;
    const rng = new Random(seed * 7919);
    for (let triple = 0; triple < triplesPerSeed; triple++) {
      // Late states are the interesting ones: bias towards them.
      const pick = () =>
        pool[Math.min(pool.length - 1, Math.floor(pool.length * Math.sqrt(rng.next())))];
      let [a, b, c] = [pick(), pick(), pick()];
      if (rng.chance(0.25)) a = damage(a, rng);
      if (rng.chance(0.25)) b = damage(b, rng);
      const partial = damage(c, rng);
      const failed = checkTriple(joinStates, a, b, c, partial, counts);
      cover(coverage, a, b, joinStates(a, b));
      if (failed) {
        failures.push({
          property: failed,
          seed,
          triple,
          sizes: [a, b, c].map((state) => state.entries.size),
        });
        if (stopAtFirst) return { counts, coverage, failures };
      }
    }
  }
  return { counts, coverage, failures };
}

describe('v2 join properties', () => {
  test('commutative, associative, idempotent, encodable, and absence never deletes', async () => {
    const seeds = [...seedRange(1, 1_700), ...seedRange(TIE_SEEDS, 300)];
    const { counts, coverage, failures } = await runProperties(join, seeds, 12, false);
    console.log(
      'v2 property checks',
      JSON.stringify({ seeds: seeds.length, counts, coverage }),
    );
    expect(failures).toEqual([]);
    for (const property of PROPERTIES)
      expect(counts[property]).toBeGreaterThanOrEqual(20_000);
    // The generator must reach each rule often enough to matter.
    for (const key of [
      'openConflict',
      'returnedEntry',
      'hiddenEntry',
      'tagByReference',
      'droppedItem',
      'lwwTie',
      'bothDeleted',
      'acknowledged',
      'ordered',
      'compactedMeetsValues',
      'extJoined',
    ] as const)
      expect(coverage[key] / coverage.joins).toBeGreaterThan(0.002);
    // Rare by nature (a device away for 180 days with an edit): present at all.
    expect(coverage.revived).toBeGreaterThan(0);
  }, 600_000);
});

/**
 * Negative controls: broken joins the harness must reject. If one of these
 * passes, the generators are too weak to trust the result above.
 */
describe('the property harness catches broken joins', () => {
  const seeds = [...seedRange(5_000, 300), ...seedRange(TIE_SEEDS + 5_000, 100)];

  test('absence treated as deletion (alternative E in the design report)', async () => {
    const absenceDeletes: Join = (left, right) => {
      const result = join(left, right);
      const entries = new Map(result.entries);
      for (const [id, record] of result.entries) {
        const inLeft = left.entries.has(id),
          inRight = right.entries.has(id);
        if (inLeft === inRight) continue;
        const other = inLeft ? right : left;
        if (Object.entries(record.vv).every(([d, h]) => (other.ctx[d] ?? -1) >= h))
          entries.delete(id);
      }
      return {
        ...result,
        entries,
        media: pruneMedia(result.media, entries, result.profile),
      };
    };
    const { failures } = await runProperties(absenceDeletes, seeds, 12, true);
    expect(failures[0]?.property).toBeDefined();
  }, 600_000);

  test('a last-writer-wins tie broken by argument order', async () => {
    const leftBias: Join = (left, right) => {
      const result = join(left, right);
      const entries = new Map(result.entries);
      for (const [id, record] of result.entries) {
        const l = left.entries.get(id),
          r = right.entries.get(id);
        if (l?.mood && r?.mood && l.mood.s[0] === r.mood.s[0])
          entries.set(id, { ...record, mood: l.mood });
        if (l?.date && r?.date && l.date.s[0] === r.date.s[0])
          entries.set(id, { ...entries.get(id)!, date: l.date });
      }
      return { ...result, entries };
    };
    const { failures } = await runProperties(leftBias, seeds, 12, true);
    expect(failures[0]?.property).toBe('commutative');
  }, 600_000);

  test('shared versions dropped from open conflicts', async () => {
    const dropShared: Join = (left, right) => {
      const result = join(left, right);
      const entries = new Map(result.entries);
      for (const [id, record] of result.entries) {
        const l = left.entries.get(id),
          r = right.entries.get(id);
        if (!l || !r || record.text.length < 2) continue;
        const shared = (s: readonly [number, string]) =>
          l.text.some((i) => i.s[0] === s[0] && i.s[1] === s[1]) &&
          r.text.some((i) => i.s[0] === s[0] && i.s[1] === s[1]);
        const text = record.text.filter((item) => !shared(item.s));
        if (text.length > 0) entries.set(id, { ...record, text });
      }
      return { ...result, entries };
    };
    const { failures } = await runProperties(dropShared, seeds, 12, true);
    expect(failures[0]?.property).toBeDefined();
  }, 600_000);

  test('tombstones not joined (the left one wins)', async () => {
    const leftTomb: Join = (left, right) => {
      const result = join(left, right);
      const entries = new Map(result.entries);
      for (const [id, record] of result.entries) {
        const l = left.entries.get(id);
        if (l?.del && right.entries.get(id)?.del)
          entries.set(id, { ...record, del: l.del });
      }
      return { ...result, entries };
    };
    const { failures } = await runProperties(leftTomb, seeds, 12, true);
    expect(failures[0]?.property).toBeDefined();
  }, 600_000);

  test('replaced values kept (a union, which is still a lattice) fail the simulation', async () => {
    // Union is commutative, associative and idempotent, so only the
    // simulation's "a replaced value never comes back" invariant can catch it.
    const unionText: Join = (left, right) => {
      const result = join(left, right);
      const entries = new Map(result.entries);
      for (const [id, record] of result.entries) {
        const l = left.entries.get(id),
          r = right.entries.get(id);
        if (!l || !r) continue;
        const text = [
          ...l.text,
          ...r.text.filter(
            (x) =>
              !l.text.some(
                (y) => y.s === x.s || (y.s[0] === x.s[0] && y.s[1] === x.s[1]),
              ),
          ),
        ].sort(
          (x, y) => x.s[0] - y.s[0] || (x.s[1] < y.s[1] ? -1 : x.s[1] > y.s[1] ? 1 : 0),
        );
        entries.set(id, { ...record, text });
      }
      return { ...result, entries };
    };
    let caught: CaseResult | null = null;
    for (const seed of seeds) {
      const { result } = await runCase(
        (devices) => new V2Adapter(devices, 'pairwise', plainMerge(unionText)),
        configFor(seed),
      );
      if (result.staleValues.length > 0 || caseFailed(result)) {
        caught = result;
        break;
      }
    }
    expect(caught).not.toBeNull();
  }, 600_000);
});
