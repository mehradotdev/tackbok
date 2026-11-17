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
 */
import { canonicalize } from '../snapshot/canonical';
import { compareStamps, covers, joinVectors, maxStamp } from './clock';
import type {
  EntryRecord,
  Item,
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
    ackAt: joinOptional(left.ackAt, right.ackAt, maxStamp),
  };
}

function joinEntry(left: EntryRecord, right: EntryRecord): EntryRecord {
  if (left === right) return left;
  const lv = left.vv,
    rv = right.vv;
  return {
    id: left.id,
    vv: joinVectors(lv, rv),
    del: joinOptional(left.del, right.del, joinTombstones),
    title: joinMultiValue(left.title, lv, right.title, rv),
    text: joinMultiValue(left.text, lv, right.text, rv),
    mood: joinLastWriter(left.mood, right.mood),
    date: joinLastWriter(left.date, right.date),
    tags: joinMembers(left.tags, lv, right.tags, rv),
    attachments: joinMembers(left.attachments, lv, right.attachments, rv),
    order: joinOptional(left.order, right.order, joinLastWriter),
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
  };
}

function joinProfile(left: ProfileRecord, right: ProfileRecord): ProfileRecord {
  if (left === right) return left;
  return {
    vv: joinVectors(left.vv, right.vv),
    name: joinMultiValue(left.name, left.vv, right.name, right.vv),
    photo: joinMultiValue(left.photo, left.vv, right.photo, right.vv),
  };
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
    floor: joinOptional(left.floor, right.floor, joinVectors),
    entries,
    tags: joinMaps(left.tags, right.tags, joinNamed),
    prompts: joinMaps(left.prompts, right.prompts, joinNamed),
    profile,
    media: pruneMedia(joinMaps(left.media, right.media, smaller), entries, profile),
  };
}
