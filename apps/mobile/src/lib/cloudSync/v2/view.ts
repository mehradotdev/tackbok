/** Reading a v2 state the way the app would show it. */
import { canonicalize } from '../snapshot/canonical';
import { compareStamps, vectorIncluded } from './clock';
import type {
  EntryRecord,
  Item,
  MultiValue,
  NamedRecord,
  SyncState,
  Tombstone,
  VersionVector,
} from './types';

/**
 * Shown unless deleted by someone who had seen every write to it. An edit the
 * deleter had not seen brings the whole record back.
 */
export function isLive(record: { vv: VersionVector; del: Tombstone | null }): boolean {
  return record.del === null || !vectorIncluded(record.vv, record.del.seen);
}

/** A record back after a delete, until someone taps "Got it". */
export function isReturned(record: {
  vv: VersionVector;
  del: Tombstone | null;
}): boolean {
  const del = record.del;
  return (
    del !== null &&
    isLive(record) &&
    (del.ackSeen === null || !vectorIncluded(del.seen, del.ackSeen))
  );
}

/**
 * Newest first, equal values once (the newest copy). More than one item is
 * an open conflict; the first is shown, the rest are on Other versions.
 */
export function shownItems<T>(values: MultiValue<T>): Item<T>[] {
  const seen = new Set<string>();
  const result: Item<T>[] = [];
  for (const item of [...values].sort((a, b) => compareStamps(b.s, a.s))) {
    const key = canonicalize(item.v);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function liveEntries(state: SyncState): EntryRecord[] {
  return [...state.entries.values()].filter(isLive);
}

/** Tags shown: live, or still on a live entry because someone added it concurrently. */
export function liveTags(state: SyncState): NamedRecord[] {
  const used = new Set<string>();
  for (const entry of liveEntries(state))
    for (const member of entry.tags) used.add(member.id);
  return [...state.tags.values()].filter((tag) => isLive(tag) || used.has(tag.id));
}

export function livePrompts(state: SyncState): NamedRecord[] {
  return [...state.prompts.values()].filter(isLive);
}

/** Distinct IDs in a set, in ID order. */
export function memberIds(members: readonly { id: string }[]): string[] {
  return [...new Set(members.map((member) => member.id))];
}

/** Attachment order: the chosen order, then any others by ID. */
export function attachmentIds(entry: EntryRecord): string[] {
  const live = memberIds(entry.attachments);
  const remaining = new Set(live);
  const result: string[] = [];
  for (const id of entry.order?.v ?? []) if (remaining.delete(id)) result.push(id);
  return [...result, ...live.filter((id) => remaining.has(id))];
}
