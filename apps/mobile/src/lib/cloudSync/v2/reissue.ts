/**
 * Moves one device's newest writes to a new device ID (#185, P8): the way
 * out when a device ID can no longer be trusted past some point.
 *
 * - **Another install uses this ID** (an OS restore or a copied phone): the
 *   writes this install made after the last snapshot it published may share
 *   stamps with the other install's. They move to a new ID with their HLCs
 *   unchanged, so causal order against every other device is kept.
 * - **This device's clock was far ahead**: its writes since then carry HLCs
 *   other devices refuse. They move to a new ID with HLCs just above
 *   everything else the state holds, in their original order.
 *
 * Every vector forgets the old ID's writes past `keepUpTo` and covers their
 * new stamps instead, exactly where it covered the old ones. The old ID's
 * writes up to `keepUpTo` stay as they are: other devices hold them too.
 * The result is a valid state with the same shown values.
 *
 * shortcut: a "Keep both" split keeps its original stamp, since the split
 * entry's ID is derived from it; nothing reads that stamp as a write. And
 * two writes on the same HLC are ordered by device ID, so a moved write tied
 * with another device's (same millisecond) may swap which one is shown
 * first; both stay. Fine while ties are this rare; revisit if HLCs coarsen.
 */
import { compareStamps } from './clock';
import type {
  DeviceId,
  EntryRecord,
  Ext,
  Item,
  Known,
  Member,
  NamedRecord,
  ProfileRecord,
  Stamp,
  SyncState,
  Tombstone,
  VersionVector,
} from './types';

export interface ReissueOptions {
  from: DeviceId;
  to: DeviceId;
  /** `from`'s writes up to this HLC stay; later ones move. -1 moves all. */
  keepUpTo: number;
  /** `same`: HLCs kept (another install). `after`: renumbered above the rest (clock). */
  hlcs: 'same' | 'after';
}

/**
 * Every write the state names: its stamps, and the newest write per device
 * of each vector. A vector can cover a write no value holds any more (one
 * since replaced); it still counts, for liveness among other things.
 */
function* writesOf(state: SyncState): Generator<Stamp> {
  const ofVector = function* (vv: VersionVector | null) {
    if (vv) for (const [device, hlc] of Object.entries(vv)) yield [hlc, device] as Stamp;
  };
  yield* ofVector(state.ctx);
  yield* ofVector(state.floor);
  for (const ack of Object.values(state.acks)) yield* ofVector(ack);
  for (const record of [
    ...state.entries.values(),
    ...state.tags.values(),
    ...state.prompts.values(),
  ]) {
    yield* ofVector(record.vv);
    yield* ofVector(record.del?.seen ?? null);
    yield* ofVector(record.del?.ackSeen ?? null);
  }
  for (const entry of state.entries.values()) yield* ofVector(entry.known?.vv ?? null);
  yield* ofVector(state.profile.vv);
  const ofExt = function* (ext: Ext) {
    for (const items of Object.values(ext)) for (const item of items) yield item.s;
  };
  const ofDel = function* (del: Tombstone | null) {
    if (!del) return;
    yield del.at;
    yield* ofExt(del.ext);
  };
  for (const entry of state.entries.values()) {
    for (const item of [...entry.title, ...entry.text]) yield item.s;
    if (entry.mood) yield entry.mood.s;
    if (entry.date) yield entry.date.s;
    if (entry.order) yield entry.order.s;
    for (const member of [...entry.tags, ...entry.attachments]) yield member.s;
    if (entry.known) yield* entry.known.extra;
    yield* ofExt(entry.ext);
    yield* ofDel(entry.del);
  }
  for (const record of [...state.tags.values(), ...state.prompts.values()]) {
    yield record.title.s;
    yield* ofExt(record.ext);
    yield* ofDel(record.del);
  }
  for (const item of [...state.profile.name, ...state.profile.photo]) yield item.s;
  yield* ofExt(state.profile.ext);
}

export function reissueWrites(state: SyncState, options: ReissueOptions): SyncState {
  const { from, to, keepUpTo } = options;
  if (from === to) throw new Error('A device cannot be moved to its own ID');
  const moved = [
    ...new Set(
      [...writesOf(state)]
        .filter(([hlc, device]) => device === from && hlc > keepUpTo)
        .map(([hlc]) => hlc),
    ),
  ].sort((a, b) => a - b);
  let base = keepUpTo;
  for (const [device, hlc] of Object.entries(state.ctx))
    if (device !== from && hlc > base) base = hlc;
  const newHlc = new Map(
    moved.map((hlc, index) => [hlc, options.hlcs === 'same' ? hlc : base + index + 1]),
  );

  const stamp = (s: Stamp): Stamp =>
    s[1] === from && s[0] > keepUpTo ? [newHlc.get(s[0])!, to] : s;
  const vector = (vv: VersionVector): VersionVector => {
    const seen = vv[from];
    if (seen === undefined || seen <= keepUpTo) return vv;
    const result: Record<string, number> = { ...vv };
    if (keepUpTo >= 0) result[from] = keepUpTo;
    else delete result[from];
    // The newest moved write this vector covered.
    let covered: number | undefined;
    for (const hlc of moved) {
      if (hlc > seen) break;
      covered = hlc;
    }
    if (covered !== undefined)
      result[to] = Math.max(result[to] ?? -1, newHlc.get(covered)!);
    return result;
  };
  const items = <T>(list: readonly Item<T>[]): Item<T>[] =>
    list
      .map((item) => ({ s: stamp(item.s), v: item.v }))
      .sort((a, b) => compareStamps(a.s, b.s));
  const item = <T>(value: Item<T>): Item<T> => ({ s: stamp(value.s), v: value.v });
  const members = (list: readonly Member[]): Member[] =>
    list
      .map((member) => ({ id: member.id, s: stamp(member.s) }))
      .sort((a, b) => (a.id !== b.id ? (a.id < b.id ? -1 : 1) : compareStamps(a.s, b.s)));
  const ext = (value: Ext): Ext =>
    Object.fromEntries(Object.entries(value).map(([key, list]) => [key, items(list)]));
  const del = (value: Tombstone | null): Tombstone | null =>
    value && {
      at: stamp(value.at),
      seen: vector(value.seen),
      ackSeen: value.ackSeen && vector(value.ackSeen),
      ext: ext(value.ext),
    };
  const known = (value: Known | null, vv: VersionVector): Known | null => {
    if (!value) return null;
    const result = {
      vv: vector(value.vv),
      extra: value.extra.map(stamp).sort(compareStamps),
    };
    // Moving can make it equal to the record's vector: then it says nothing.
    const same =
      result.extra.length === 0 &&
      Object.keys(vv).length === Object.keys(result.vv).length &&
      Object.entries(vv).every(([device, hlc]) => result.vv[device] === hlc);
    return same ? null : result;
  };
  const entry = (record: EntryRecord): EntryRecord => {
    const vv = vector(record.vv);
    return {
      ...record,
      vv,
      known: known(record.known, vv),
      del: del(record.del),
      ext: ext(record.ext),
      title: items(record.title),
      text: items(record.text),
      mood: record.mood && item(record.mood),
      date: record.date && item(record.date),
      tags: members(record.tags),
      attachments: members(record.attachments),
      order: record.order && item(record.order),
    };
  };
  const named = (record: NamedRecord): NamedRecord => ({
    ...record,
    vv: vector(record.vv),
    del: del(record.del),
    ext: ext(record.ext),
    title: item(record.title),
  });
  const profile: ProfileRecord = {
    vv: vector(state.profile.vv),
    ext: ext(state.profile.ext),
    name: items(state.profile.name),
    photo: items(state.profile.photo),
  };
  const map = <T>(records: ReadonlyMap<string, T>, change: (record: T) => T) =>
    new Map([...records].map(([id, record]) => [id, change(record)]));

  const roster: Record<string, number> = { ...state.roster };
  if (from in roster) roster[from] = Math.min(roster[from], Math.max(keepUpTo, 0));
  if (moved.length > 0)
    roster[to] = Math.max(roster[to] ?? 0, newHlc.get(moved[moved.length - 1])!);
  // Only a device itself speaks for what it has seen; this one is no longer `from`.
  const acks = Object.fromEntries(
    Object.entries(state.acks)
      .filter(([device]) => device !== from)
      .map(([device, ack]) => [device, vector(ack)]),
  );
  return {
    ...state,
    ctx: vector(state.ctx),
    roster,
    acks,
    floor: state.floor && vector(state.floor),
    entries: map(state.entries, entry),
    tags: map(state.tags, named),
    prompts: map(state.prompts, named),
    profile,
  };
}
