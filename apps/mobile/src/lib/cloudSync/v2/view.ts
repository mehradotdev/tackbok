/** Reading a v2 state the way the app would show it. */
import { canonicalize } from '../snapshot/canonical';
import { compareStamps, vectorIncluded } from './clock';
import { normalizeTitle, type NamedKind } from './ids';
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

/** In ID order: a map's insertion order depends on the join order. */
const byId = <T extends { id: string }>(values: Iterable<T>): T[] =>
  [...values].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function liveEntries(state: SyncState): EntryRecord[] {
  return byId(state.entries.values()).filter(isLive);
}

/** Tags shown: live, or still on a live entry because someone added it concurrently. */
export function liveTags(state: SyncState): NamedRecord[] {
  const used = new Set<string>();
  for (const entry of liveEntries(state))
    for (const member of entry.tags) used.add(member.id);
  return byId(state.tags.values()).filter((tag) => isLive(tag) || used.has(tag.id));
}

export function livePrompts(state: SyncState): NamedRecord[] {
  return byId(state.prompts.values()).filter(isLive);
}

/** Tags or prompts with one normalised title, shown as one. */
export interface ShownNamed {
  /** The ID new memberships use: the record whose title was written last. */
  readonly id: string;
  /** Every record shown as this one, in ID order. */
  readonly ids: readonly string[];
  readonly title: string;
}

/**
 * Display-level merge (Phase 0 report, section 6). Title-derived IDs give two
 * devices creating one title offline the same record, but a rename onto a
 * title another device creates offline still leaves two records with one
 * normalised title. The app shows them as one tag or prompt:
 * - the shown title and the ID for new memberships are those of the record
 *   whose title was written last (highest title stamp);
 * - an entry has the tag if it has any of `ids`; filtering by the tag
 *   matches any of them;
 * - removing the tag from an entry removes every one of `ids` from it;
 * - renaming or deleting the tag renames or deletes every record in `ids`.
 * The records stay separate in the state: merging them in the join would
 * need a rule for which ID wins that every device applies identically,
 * and the records' memberships would have to move.
 */
export function shownNamed(state: SyncState, kind: NamedKind): ShownNamed[] {
  const records = kind === 'tag' ? liveTags(state) : livePrompts(state);
  const groups = new Map<string, NamedRecord[]>();
  for (const record of records) {
    const key = normalizeTitle(kind, record.title.v);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }
  const shown: ShownNamed[] = [];
  for (const group of groups.values()) {
    const latest = group.reduce((best, record) =>
      compareStamps(record.title.s, best.title.s) > 0 ? record : best,
    );
    shown.push({
      id: latest.id,
      ids: group.map((record) => record.id),
      title: latest.title.v,
    });
  }
  return shown.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The shown tags of an entry: one ID per shown tag (see `shownNamed`). */
export function shownTagIds(entry: EntryRecord, tags: readonly ShownNamed[]): string[] {
  const has = new Set(entry.tags.map((member) => member.id));
  return tags.filter((tag) => tag.ids.some((id) => has.has(id))).map((tag) => tag.id);
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
