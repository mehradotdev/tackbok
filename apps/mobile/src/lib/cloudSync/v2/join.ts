/**
 * The v2 merge: a join of two states with no base.
 *
 * Each record is a product of small lattices (registers, sets, its version
 * vector and its tombstone), and a collection is a map whose missing key is
 * the bottom element. So the join is commutative, associative and idempotent
 * by construction; `scripts/cloud-sync/v2-properties.test.ts` checks the code.
 *
 * Rules:
 * - Multi-value and set items: keep an item both sides have, or one side has
 *   and the other side's record has not seen (by the record's version vector).
 *   Otherwise the other side replaced or removed it.
 * - Last-writer-wins: the higher stamp.
 * - A record only one side has is kept as it is: absence is never deletion.
 * - Tombstones join field by field (newest delete, union of what was seen,
 *   newest acknowledgement). Whether a record is shown is decided by reading,
 *   not by the join: see `isLive` in `view.ts`.
 * - `ext` items join like multi-value items, against the record's vector
 *   (a tombstone's against its `seen`), whether or not this build knows the
 *   feature.
 * - An entry's values are judged against what it holds values for (`known`,
 *   normally its vector): a compacted copy (`known` empty) removes nothing,
 *   so an entry an unseen edit brings back keeps every value another copy
 *   still has (`compact.ts`).
 */
import { canonicalize } from '../snapshot/canonical';
import { compareStamps, covers, joinVectors, maxStamp, vectorIncluded } from './clock';
import type {
  EntryRecord,
  Ext,
  Item,
  Json,
  LastWriter,
  MediaDescriptor,
  Member,
  MultiValue,
  NamedRecord,
  ProfileRecord,
  SyncState,
  Tombstone,
  VersionVector,
} from './types';

export class SyncJoinError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncJoinError';
  }
}

/** Deterministic pick between two values a valid state never has: same stamp, different value. */
function smaller<T>(left: T, right: T): T {
  if (left === right) return left;
  return canonicalize(left) <= canonicalize(right) ? left : right;
}

export function joinMultiValue<T>(
  left: MultiValue<T>,
  leftVv: VersionVector,
  right: MultiValue<T>,
  rightVv: VersionVector,
): MultiValue<T> {
  if (left === right) return left;
  const result: Item<T>[] = [];
  let i = 0,
    j = 0;
  while (i < left.length || j < right.length) {
    const order =
      i >= left.length
        ? 1
        : j >= right.length
          ? -1
          : compareStamps(left[i].s, right[j].s);
    if (order === 0) {
      result.push(
        left[i].v === right[j].v
          ? left[i]
          : { s: left[i].s, v: smaller(left[i].v, right[j].v) },
      );
      i++;
      j++;
    } else if (order < 0) {
      if (!covers(rightVv, left[i].s)) result.push(left[i]);
      i++;
    } else {
      if (!covers(leftVv, right[j].s)) result.push(right[j]);
      j++;
    }
  }
  return result;
}

function compareMembers(left: Member, right: Member): number {
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  return compareStamps(left.s, right.s);
}

export function joinMembers(
  left: readonly Member[],
  leftVv: VersionVector,
  right: readonly Member[],
  rightVv: VersionVector,
): readonly Member[] {
  if (left === right) return left;
  const result: Member[] = [];
  let i = 0,
    j = 0;
  while (i < left.length || j < right.length) {
    const order =
      i >= left.length ? 1 : j >= right.length ? -1 : compareMembers(left[i], right[j]);
    if (order === 0) {
      result.push(left[i]);
      i++;
      j++;
    } else if (order < 0) {
      if (!covers(rightVv, left[i].s)) result.push(left[i]);
      i++;
    } else {
      if (!covers(leftVv, right[j].s)) result.push(right[j]);
      j++;
    }
  }
  return result;
}

export function joinLastWriter<T>(
  left: LastWriter<T>,
  right: LastWriter<T>,
): LastWriter<T> {
  if (left === right) return left;
  const order = compareStamps(left.s, right.s);
  if (order !== 0) return order > 0 ? left : right;
  return left.v === right.v ? left : { s: left.s, v: smaller(left.v, right.v) };
}

/** Feature by feature; a feature whose items all went is dropped. */
export function joinExt(
  left: Ext,
  leftVv: VersionVector,
  right: Ext,
  rightVv: VersionVector,
): Ext {
  if (left === right) return left;
  const result: Record<string, MultiValue<Json>> = {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const items = joinMultiValue(left[key] ?? [], leftVv, right[key] ?? [], rightVv);
    if (items.length > 0) result[key] = items;
  }
  return result;
}

function joinOptional<T>(
  left: T | null,
  right: T | null,
  both: (left: T, right: T) => T,
): T | null {
  if (left === null) return right;
  if (right === null) return left;
  return both(left, right);
}

export function joinTombstones(left: Tombstone, right: Tombstone): Tombstone {
  if (left === right) return left;
  return {
    at: maxStamp(left.at, right.at),
    seen: joinVectors(left.seen, right.seen),
    ackSeen: joinOptional(left.ackSeen, right.ackSeen, joinVectors),
    ext: joinExt(left.ext, left.seen, right.ext, right.seen),
  };
}

/** The writes an entry holds values for. */
export const knownOf = (entry: EntryRecord): VersionVector => entry.known ?? entry.vv;

/** `known`, or null when it is the whole vector (the canonical form). */
export function normalKnown(
  known: VersionVector,
  vv: VersionVector,
): VersionVector | null {
  return vectorIncluded(vv, known) ? null : known;
}

function joinEntry(left: EntryRecord, right: EntryRecord): EntryRecord {
  if (left === right) return left;
  const lv = knownOf(left),
    rv = knownOf(right);
  const vv = joinVectors(left.vv, right.vv);
  return {
    id: left.id,
    vv,
    known:
      left.known === null && right.known === null
        ? null
        : normalKnown(joinVectors(lv, rv), vv),
    del: joinOptional(left.del, right.del, joinTombstones),
    title: joinMultiValue(left.title, lv, right.title, rv),
    text: joinMultiValue(left.text, lv, right.text, rv),
    mood: joinOptional(left.mood, right.mood, joinLastWriter),
    date: joinOptional(left.date, right.date, joinLastWriter),
    tags: joinMembers(left.tags, lv, right.tags, rv),
    attachments: joinMembers(left.attachments, lv, right.attachments, rv),
    order: joinOptional(left.order, right.order, joinLastWriter),
    ext: joinExt(left.ext, lv, right.ext, rv),
    // Derived from the same keep-both write on every device that has it.
    split: joinOptional(left.split, right.split, (a, b) =>
      compareStamps(a.s, b.s) === 0 && a.from === b.from && a.field === b.field
        ? a
        : smaller(a, b),
    ),
  };
}

function joinNamed(left: NamedRecord, right: NamedRecord): NamedRecord {
  if (left === right) return left;
  return {
    id: left.id,
    vv: joinVectors(left.vv, right.vv),
    del: joinOptional(left.del, right.del, joinTombstones),
    title: joinLastWriter(left.title, right.title),
    ext: joinExt(left.ext, left.vv, right.ext, right.vv),
  };
}

function joinProfile(left: ProfileRecord, right: ProfileRecord): ProfileRecord {
  if (left === right) return left;
  return {
    vv: joinVectors(left.vv, right.vv),
    name: joinMultiValue(left.name, left.vv, right.name, right.vv),
    photo: joinMultiValue(left.photo, left.vv, right.photo, right.vv),
    ext: joinExt(left.ext, left.vv, right.ext, right.vv),
  };
}

/**
 * A media descriptor is immutable: two different ones under one asset ID are
 * a bug. Picking one would not be associative once pruning removes the other
 * in between, so the join refuses, as v1 does (`asset-id-collision`). Whether
 * the refusal happens can still depend on join order (one descriptor may be
 * pruned first); that is only reachable after such a bug, and the engine must
 * keep asset IDs unique per owner (Phase 0 report, requirement 5).
 */
function sameMedia(left: MediaDescriptor, right: MediaDescriptor): MediaDescriptor {
  if (left !== right && canonicalize(left) !== canonicalize(right))
    throw new SyncJoinError('asset-id-collision', `Asset ${left.assetId} differs`);
  return left;
}

function joinMaps<T>(
  left: ReadonlyMap<string, T>,
  right: ReadonlyMap<string, T>,
  both: (left: T, right: T) => T,
): Map<string, T> {
  const result = new Map(left);
  for (const [key, value] of right) {
    const existing = result.get(key);
    result.set(key, existing === undefined ? value : both(existing, value));
  }
  return result;
}

function joinRoster(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): Record<string, number> {
  return joinVectors(left, right) as Record<string, number>;
}

function joinAcks(
  left: Readonly<Record<string, VersionVector>>,
  right: Readonly<Record<string, VersionVector>>,
): Record<string, VersionVector> {
  if (left === right) return left as Record<string, VersionVector>;
  const result: Record<string, VersionVector> = { ...left };
  for (const [device, ack] of Object.entries(right))
    result[device] = result[device] ? joinVectors(result[device], ack) : ack;
  return result;
}

/** Asset IDs referenced by any record, shown or deleted (a delete can be undone). */
export function referencedAssets(
  entries: ReadonlyMap<string, EntryRecord>,
  profile: ProfileRecord,
): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries.values())
    for (const member of entry.attachments) ids.add(member.id);
  for (const item of profile.photo) if (item.v !== null) ids.add(item.v);
  return ids;
}

/** Media descriptors still referenced. A state always has the descriptors it references. */
export function pruneMedia(
  media: ReadonlyMap<string, MediaDescriptor>,
  entries: ReadonlyMap<string, EntryRecord>,
  profile: ProfileRecord,
): Map<string, MediaDescriptor> {
  const referenced = referencedAssets(entries, profile);
  const result = new Map<string, MediaDescriptor>();
  for (const [assetId, descriptor] of media)
    if (referenced.has(assetId)) result.set(assetId, descriptor);
  return result;
}

export function join(left: SyncState, right: SyncState): SyncState {
  if (left.vaultId !== right.vaultId)
    throw new SyncJoinError('vault-mismatch', 'Cannot join states of different vaults');
  if (left === right) return left;
  const entries = joinMaps(left.entries, right.entries, joinEntry);
  const profile = joinProfile(left.profile, right.profile);
  return {
    vaultId: left.vaultId,
    ctx: joinVectors(left.ctx, right.ctx),
    roster: joinRoster(left.roster, right.roster),
    acks: joinAcks(left.acks, right.acks),
    floor: joinOptional(left.floor, right.floor, joinVectors),
    entries,
    tags: joinMaps(left.tags, right.tags, joinNamed),
    prompts: joinMaps(left.prompts, right.prompts, joinNamed),
    profile,
    media: pruneMedia(joinMaps(left.media, right.media, sameMedia), entries, profile),
  };
}
