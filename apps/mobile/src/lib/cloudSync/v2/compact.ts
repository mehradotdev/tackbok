/**
 * Compaction of deleted records (Phase 0 report, section 9), and the way the
 * engine takes in another device's state (`absorb`).
 *
 * A deleted entry keeps its values so that an edit its deleter had not seen
 * can bring it back whole. Once every active device has seen the delete,
 * none can make such an edit any more, so the values can go:
 *
 * - **Roster.** A device is active while its last-seen time (`roster`) is
 *   within `ROSTER_EXPIRY_MS` (180 days) of the newest one in the state.
 *   Measured against the state, not a wall clock, so every device holding
 *   the same state agrees. An expired device that publishes again is active
 *   again. Devices never leave the roster itself: stamps name them.
 * - **Floor.** The meet (per-device minimum) of the active devices'
 *   acknowledgements (`acks`, set by `markSeen` before a publish). A device
 *   missing from any active acknowledgement is missing from the floor. No
 *   floor while an active device has never published. The state keeps the
 *   highest floor used (`floor`, joined by maximum) as a record of how far
 *   compaction may have gone; the rule reads the current meet.
 * - **Compaction.** A deleted entry whose version vector is inside the floor
 *   loses its values: title, text, mood, date, tags, attachments, order and
 *   `ext` become empty and `known` becomes `{}`. Its version vector and
 *   tombstone stay (liveness and the context need them); so does `split`,
 *   which its ID is derived from. Media only it referenced is pruned.
 * - **Tags and prompts are not compacted.** Their only value is the title,
 *   which the title-derived IDs need to tell a re-created title from a
 *   rename (`createNamed`); a deleted tag also stays shown while a live entry
 *   uses it. shortcut: deleted tag and prompt titles stay in snapshots;
 *   revisit if the owner wants them gone (needs a title-free rule in
 *   `createNamed`).
 *
 * The join is unchanged in kind: a compacted entry is the bottom element for
 * values (`known` is empty, so it removes nothing) and keeps its vector and
 * tombstone, so the join stays commutative, associative and idempotent.
 * Compaction never touches a vector or tombstone, so it never changes which
 * records are shown. Joining a stale copy brings the values back into the
 * deleted record (still hidden); the next `compact` drops them again.
 *
 * Why it is safe: only `d` sets `acks[d]`, to its context, so `d` had seen
 * every write in it (it may since have compacted some values, but it saw
 * them). If every active device's acknowledgement covers a deleted record's
 * vector, each saw the tombstone and every write the compacting device
 * knows of, so none can edit the record unless an edit it had not seen
 * brings it back first; such an edit would already be in the compacting
 * device's vector. Only a device that is not active can hold one: one away
 * for 180 days, an old head, or a device that never published. Engine rule:
 * a device publishes (`markSeen`) as soon as it has joined the vault, before
 * its first local write, so the last case is only a device that has never
 * reached Drive.
 *
 * **A device that returns after compaction.** Its unseen edit still brings
 * the entry back, with every value it has, under their original stamps: the
 * compacted copies hold no values and remove none. Values written before the
 * delete that the returning device never saw are gone where every copy was
 * compacted, so the entry can come back older than the version that was
 * deleted. Nothing the returning device had is lost, and entries it had not
 * edited stay deleted.
 */
import {
  MAX_CONTEXT_AHEAD_MS,
  ROSTER_EXPIRY_MS,
  assertNotAhead,
  highestHlc,
  joinVectors,
  vectorIncluded,
} from './clock';
import { join, pruneMedia } from './join';
import type { Writer } from './ops';
import type { DeviceId, EntryRecord, SyncState, VersionVector } from './types';
import { isLive } from './view';

/** Devices whose last-seen time is within `ROSTER_EXPIRY_MS` of the newest one. */
export function activeDevices(state: SyncState): DeviceId[] {
  const newest = highestHlc(state.roster);
  return (
    Object.keys(state.roster)
      // A clock up to the bound ahead must not expire anyone early.
      .filter(
        (device) =>
          newest - state.roster[device] <= ROSTER_EXPIRY_MS + MAX_CONTEXT_AHEAD_MS,
      )
      .sort()
  );
}

/** The meet of the active devices' acknowledgements, or null while one has none. */
export function compactionFloor(state: SyncState): VersionVector | null {
  const active = activeDevices(state);
  if (active.length === 0) return null;
  let floor: Record<string, number> | null = null;
  for (const device of active) {
    const ack = state.acks[device];
    if (!ack) return null;
    if (floor === null) {
      floor = { ...ack };
      continue;
    }
    for (const key of Object.keys(floor)) {
      const other = ack[key];
      if (other === undefined) delete floor[key];
      else if (other < floor[key]) floor[key] = other;
    }
  }
  return floor;
}

/** A compacted entry holds no values: `known` is empty. */
export function isCompacted(entry: EntryRecord): boolean {
  return (
    entry.known !== null &&
    Object.keys(entry.known.vv).length === 0 &&
    entry.known.extra.length === 0
  );
}

/** The entry with its values dropped; vector, tombstone and split stay. */
export function scrubEntry(entry: EntryRecord): EntryRecord {
  return {
    ...entry,
    known: { vv: {}, extra: [] },
    title: [],
    text: [],
    mood: null,
    date: null,
    tags: [],
    attachments: [],
    order: null,
    ext: {},
  };
}

/** Drops the values of every deleted entry all active devices have seen deleted. */
export function compact(state: SyncState): SyncState {
  const floor = compactionFloor(state);
  if (!floor) return state;
  let entries: Map<string, EntryRecord> | null = null;
  for (const entry of state.entries.values()) {
    if (isLive(entry) || isCompacted(entry) || !vectorIncluded(entry.vv, floor)) continue;
    entries ??= new Map(state.entries);
    entries.set(entry.id, scrubEntry(entry));
  }
  const nextFloor = state.floor ? joinVectors(state.floor, floor) : floor;
  if (!entries && state.floor && vectorIncluded(nextFloor, state.floor)) return state;
  const result = entries ?? state.entries;
  return {
    ...state,
    floor: nextFloor,
    entries: result,
    media: entries ? pruneMedia(state.media, result, state.profile) : state.media,
  };
}

export interface Absorbed {
  readonly state: SyncState;
  /**
   * Entries shown after the join that one side had compacted: an unseen
   * edit brought them back with the values the other side had.
   */
  readonly revived: readonly string[];
}

/**
 * How the engine takes in another device's state: refuses one whose clock
 * is too far ahead (`assertNotAhead`), then joins. Callers then `markSeen`
 * (when `needsAck`) and `compact` before publishing.
 */
export function absorb(local: SyncState, remote: SyncState, writer: Writer): Absorbed {
  assertNotAhead(remote, writer.wallMs);
  const state = join(local, remote);
  const revived: string[] = [];
  // A side compacted, or holding only part of the values since it was.
  const touched = (entry: EntryRecord) => entry.known !== null;
  for (const [id, mine] of local.entries) {
    const theirs = remote.entries.get(id);
    if (theirs && (touched(mine) || touched(theirs)) && isLive(state.entries.get(id)!))
      revived.push(id);
  }
  return { state, revived: revived.sort() };
}
