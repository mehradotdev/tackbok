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
 *   again. Devices never leave the roster itself: stamps and vectors name
 *   them (the codec caps it at 1,024). What `compact` drops is an expired
 *   device's acknowledgement: every ack is a vector over the roster, so
 *   keeping them all would grow the header with the square of the devices a
 *   vault ever had (past its 256 KiB cap at 115 to 160). Only the active
 *   devices' acks are read, and a returning device sets its own again when
 *   it publishes. The engine prunes an expired device's head from Drive.
 * - **Retired devices.** A device that knows one of its old IDs is dead
 *   records it (`retireDevice`, under `RETIRED_DEVICES` on the profile), so
 *   that ID stops counting as active without waiting 180 days.
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
 * **Where deleted text can still be on Drive after compaction** (#185 P11).
 * The engine publishes as soon as a pass compacts values, retrying until it
 * succeeds, so active devices' heads drop them. What remains:
 * - snapshots replaced since, until 30-day retention removes them (P9's
 *   history keeps one a day for the same window);
 * - the head of a device that acknowledged the delete and then went quiet,
 *   until it syncs again, expires (180 days) or is retired and its head is
 *   pruned; a head no device could take in (unreadable, clock far ahead)
 *   stays until the user removes it;
 * - deleted tag and prompt titles (below), and media blobs (P12).
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
import { writeExt, type Writer } from './ops';
import type {
  DeviceId,
  EntryRecord,
  ProfileRecord,
  SyncState,
  VersionVector,
} from './types';
import { isLive } from './view';

/**
 * Optional feature on the profile record (vault-wide data): device IDs that
 * a device knows are dead, each with the last-seen time it was retired at.
 * One item's value is `{ [deviceId]: lastSeenUpTo }`; concurrent items are
 * read together. Builds that do not know the feature keep and join it, and
 * only stop compaction from going ahead as early.
 */
export const RETIRED_DEVICES = 'retired-devices';

type RosterAndProfile = Pick<SyncState, 'roster'> & {
  readonly profile: Pick<ProfileRecord, 'ext'>;
};

/**
 * Device -> the last-seen time up to which it is retired, from every item
 * of `RETIRED_DEVICES`. Another device wrote them, so a malformed value is
 * ignored rather than refused.
 */
export function retiredDevices(state: {
  readonly profile: Pick<ProfileRecord, 'ext'>;
}): Record<DeviceId, number> {
  const result: Record<DeviceId, number> = {};
  for (const item of state.profile.ext[RETIRED_DEVICES] ?? []) {
    const value = item.v;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [device, upTo] of Object.entries(value))
      if (typeof upTo === 'number' && Number.isSafeInteger(upTo) && upTo >= 0)
        result[device] = Math.max(result[device] ?? upTo, upTo);
  }
  return result;
}

/** Whether the device wrote or published within `ROSTER_EXPIRY_MS` of the newest one. */
function recentlySeen(roster: SyncState['roster'], newest: number, device: DeviceId) {
  // A clock up to the bound ahead must not expire anyone early.
  return newest - roster[device] <= ROSTER_EXPIRY_MS + MAX_CONTEXT_AHEAD_MS;
}

/**
 * Devices whose last-seen time is within `ROSTER_EXPIRY_MS` of the newest
 * one and that are not retired: a retired device is active again only once
 * it is seen after the time it was retired at.
 */
export function activeDevices(state: RosterAndProfile): DeviceId[] {
  const newest = highestHlc(state.roster);
  const retired = retiredDevices(state);
  return Object.keys(state.roster)
    .filter(
      (device) =>
        recentlySeen(state.roster, newest, device) &&
        !(retired[device] !== undefined && state.roster[device] <= retired[device]),
    )
    .sort();
}

/**
 * Records that `device`, as of last-seen time `upTo`, will never write or
 * publish again: its local state is gone ("Delete all", a new vault binding)
 * or every write it had moved to another ID (`continueAsNewDevice` after a
 * clock far ahead). Its acknowledgement then stops holding back compaction
 * at once, instead of after 180 days, and its head is pruned. Never for an
 * ID another install may still use (a cloned or restored copy): retiring a
 * device that can still publish edits it made before seeing a delete would
 * let compaction drop values those edits need, which only the 180-day rule
 * accepts. If a retired ID does publish again (an old backup restored onto
 * the same phone), its last-seen time passes `upTo` and it is active again;
 * until then it is treated like a device back after 180 days.
 *
 * Entries for devices expired anyway (or not on the roster) are dropped as
 * the record is written, so it stays small. An ID never on the roster is
 * not recorded. A copy of a retired ID that has not published since it was
 * retired pauses instead of syncing (the engine treats it as another
 * install using this ID).
 */
export function retireDevice(
  state: SyncState,
  writer: Writer,
  device: DeviceId,
  upTo: number,
): SyncState {
  // Never seen in this vault: nothing to stop counting.
  if (!(device in state.roster)) return state;
  const newest = highestHlc(state.roster);
  const current = retiredDevices(state);
  const value: Record<DeviceId, number> = {};
  for (const [id, at] of Object.entries(current))
    if (id in state.roster && recentlySeen(state.roster, newest, id)) value[id] = at;
  value[device] = Math.max(value[device] ?? 0, Math.max(0, Math.floor(upTo)));
  return writeExt(state, writer, { kind: 'profile' }, RETIRED_DEVICES, value, 'all');
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

/** The acknowledgements of active devices only: the same object if none is dropped. */
function activeAcks(state: SyncState): SyncState['acks'] {
  const active = new Set(activeDevices(state));
  const devices = Object.keys(state.acks);
  if (devices.every((device) => active.has(device))) return state.acks;
  return Object.fromEntries(
    devices.filter((device) => active.has(device)).map((d) => [d, state.acks[d]]),
  );
}

/**
 * Drops expired devices' acknowledgements, then the values of every deleted
 * entry all active devices have seen deleted.
 */
export function compact(input: SyncState): SyncState {
  const acks = activeAcks(input);
  const state = acks === input.acks ? input : { ...input, acks };
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
   * Entries this join brought back: one side held a deleted copy that had
   * been compacted (or only part of the values since), and an unseen edit
   * on the other side made the entry shown again, with that side's values.
   * An entry already shown on both sides is not listed again.
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
  // A deleted copy that was compacted, or holds only part of the values
  // since an earlier return.
  const hidden = (entry: EntryRecord) => entry.known !== null && !isLive(entry);
  for (const [id, mine] of local.entries) {
    const theirs = remote.entries.get(id);
    if (theirs && (hidden(mine) || hidden(theirs)) && isLive(state.entries.get(id)!))
      revived.push(id);
  }
  return { state, revived: revived.sort() };
}
