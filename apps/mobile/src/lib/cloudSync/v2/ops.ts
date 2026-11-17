/**
 * Local writes. Each takes a state and returns a new one; nothing mutates.
 * Every write gets a fresh stamp from the device's hybrid logical clock and
 * adds it to the record's version vector and the state's context.
 */
import { sanitizePromptTitle, sanitizeTagName } from '~/lib/utils';

import { canonicalize } from '../snapshot/canonical';

import { compareStamps, nextHlc, withStamp } from './clock';
import { namedId, normalizeTitle, splitEntryId, type NamedKind } from './ids';
import { joinTombstones, pruneMedia } from './join';
import type {
  DeviceId,
  EntryRecord,
  Item,
  MediaDescriptor,
  Member,
  Mood,
  MultiValue,
  NamedRecord,
  Stamp,
  SyncState,
  TextField,
} from './types';
import { isLive, isReturned, shownItems } from './view';

export class SyncOpError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncOpError';
  }
}

export interface Writer {
  readonly device: DeviceId;
  readonly wallMs: number;
}

/** Which current values a write replaces: some by stamp, or every one this device has. */
export type Replaces = readonly Stamp[] | 'all';

function tick(state: SyncState, writer: Writer): { state: SyncState; s: Stamp } {
  const hlc = nextHlc(state.ctx, writer.wallMs);
  const s: Stamp = [hlc, writer.device];
  const lastSeen = state.roster[writer.device];
  return {
    s,
    state: {
      ...state,
      ctx: withStamp(state.ctx, s),
      roster:
        lastSeen !== undefined && lastSeen >= hlc
          ? state.roster
          : { ...state.roster, [writer.device]: hlc },
    },
  };
}

function replaceItems<T>(
  items: MultiValue<T>,
  replaces: Replaces,
  next: Item<T>,
): MultiValue<T> {
  const kept =
    replaces === 'all'
      ? []
      : items.filter(
          (item) => !replaces.some((stamp) => compareStamps(stamp, item.s) === 0),
        );
  // A new stamp is higher than every stamp the state has seen.
  return [...kept, next];
}

function addMember(members: readonly Member[], member: Member): readonly Member[] {
  return [...members, member].sort((a, b) =>
    a.id !== b.id ? (a.id < b.id ? -1 : 1) : compareStamps(a.s, b.s),
  );
}

function liveEntry(state: SyncState, entryId: string): EntryRecord {
  const entry = state.entries.get(entryId);
  if (!entry || !isLive(entry))
    throw new SyncOpError('missing-entry', `No entry ${entryId}`);
  return entry;
}

function withEntry(state: SyncState, entry: EntryRecord): SyncState {
  const entries = new Map(state.entries);
  entries.set(entry.id, entry);
  return { ...state, entries };
}

function updateEntry(
  state: SyncState,
  writer: Writer,
  entryId: string,
  change: (entry: EntryRecord, s: Stamp) => Partial<EntryRecord>,
): SyncState {
  const entry = liveEntry(state, entryId);
  const ticked = tick(state, writer);
  return withEntry(ticked.state, {
    ...entry,
    ...change(entry, ticked.s),
    vv: withStamp(entry.vv, ticked.s),
  });
}

export interface NewEntry {
  id: string;
  title: string | null;
  text: string | null;
  mood: Mood | null;
  date: number;
}

export function createEntry(state: SyncState, writer: Writer, init: NewEntry): SyncState {
  if (state.entries.has(init.id))
    throw new SyncOpError('entry-exists', `Entry ${init.id} exists`);
  const { state: next, s } = tick(state, writer);
  return withEntry(next, {
    id: init.id,
    vv: { [s[1]]: s[0] },
    del: null,
    title: [{ s, v: init.title }],
    text: [{ s, v: init.text }],
    mood: { s, v: init.mood },
    date: { s, v: init.date },
    tags: [],
    attachments: [],
    order: null,
    split: null,
  });
}

/**
 * An edit replaces the value it was made from (normally the shown one) and
 * leaves other open versions alone. "Keep this one" passes 'all'.
 */
export function editText(
  state: SyncState,
  writer: Writer,
  entryId: string,
  field: TextField,
  value: string | null,
  replaces: Replaces,
): SyncState {
  return updateEntry(state, writer, entryId, (entry, s) => ({
    [field]: replaceItems(entry[field], replaces, { s, v: value }),
  }));
}

/** "Keep this one": one new write of the chosen value replaces every value seen. */
export function keepValue(
  state: SyncState,
  writer: Writer,
  entryId: string,
  field: TextField,
  chosen: Stamp,
): SyncState {
  const item = liveEntry(state, entryId)[field].find(
    (value) => compareStamps(value.s, chosen) === 0,
  );
  if (!item) throw new SyncOpError('missing-version', 'The chosen version is gone');
  return editText(state, writer, entryId, field, item.v, 'all');
}

/**
 * "Keep both": the kept value is written again (as "Keep this one") and the
 * other value moves to a new entry whose ID derives from the moved value's
 * stamp, so two devices doing this at once make one entry, not two. The new
 * entry copies the shown title or text, mood, date and tags; attachments stay
 * with the original (a blob belongs to one entry).
 */
export function keepBoth(
  state: SyncState,
  writer: Writer,
  entryId: string,
  field: TextField,
  keep: Stamp,
  move: Stamp,
): { state: SyncState; newEntryId: string } {
  const entry = liveEntry(state, entryId);
  const moved = entry[field].find((value) => compareStamps(value.s, move) === 0);
  if (!moved || compareStamps(keep, move) === 0)
    throw new SyncOpError('missing-version', 'The version to move is gone');
  const newEntryId = splitEntryId(entryId, field, move);
  const kept = entry[field].find((value) => compareStamps(value.s, keep) === 0);
  if (!kept) throw new SyncOpError('missing-version', 'The version to keep is gone');
  // Only the two versions involved: a third open version stays open.
  let next = editText(state, writer, entryId, field, kept.v, [keep, move]);
  const existing = next.entries.get(newEntryId);
  if (existing && !isLive(existing)) {
    // Made here or elsewhere, then deleted: write the moved value again so it
    // comes back rather than being lost with the original's version.
    const ticked = tick(next, writer);
    next = withEntry(ticked.state, {
      ...existing,
      [field]: [...existing[field], { s: ticked.s, v: moved.v }],
      vv: withStamp(existing.vv, ticked.s),
    });
  } else if (!existing) {
    const other: TextField = field === 'title' ? 'text' : 'title';
    const otherValue = shownItems(entry[other])[0]?.v ?? null;
    next = createEntry(next, writer, {
      id: newEntryId,
      title: field === 'title' ? moved.v : otherValue,
      text: field === 'text' ? moved.v : otherValue,
      mood: entry.mood.v,
      date: entry.date.v,
    });
    const created = next.entries.get(newEntryId)!;
    const tagIds = [...new Set(entry.tags.map((member) => member.id))];
    const s = created.title[0].s;
    next = withEntry(next, {
      ...created,
      tags: tagIds.map((id) => ({ id, s })),
      split: { from: entryId, field, s: move },
    });
  }
  return { state: next, newEntryId };
}

export function setMood(
  state: SyncState,
  writer: Writer,
  entryId: string,
  mood: Mood | null,
): SyncState {
  return updateEntry(state, writer, entryId, (_entry, s) => ({ mood: { s, v: mood } }));
}

export function setDate(
  state: SyncState,
  writer: Writer,
  entryId: string,
  date: number,
): SyncState {
  return updateEntry(state, writer, entryId, (_entry, s) => ({ date: { s, v: date } }));
}

export function deleteEntry(
  state: SyncState,
  writer: Writer,
  entryId: string,
): SyncState {
  const entry = liveEntry(state, entryId);
  const { state: next, s } = tick(state, writer);
  const vv = withStamp(entry.vv, s);
  const del = { at: s, seen: vv, ackSeen: null };
  return withEntry(next, {
    ...entry,
    vv,
    del: entry.del ? joinTombstones(entry.del, del) : del,
  });
}

/** "Got it" on a returned entry. Not an edit: it never brings an entry back. */
export function acknowledgeReturn(
  state: SyncState,
  writer: Writer,
  entryId: string,
): SyncState {
  const entry = state.entries.get(entryId);
  if (!entry || !isReturned(entry) || !entry.del)
    throw new SyncOpError('not-returned', `Entry ${entryId} was not returned`);
  // Records who acknowledged; adds no stamp to the entry.
  const { state: next } = tick(state, writer);
  return withEntry(next, { ...entry, del: { ...entry.del, ackSeen: entry.del.seen } });
}

export function addTag(
  state: SyncState,
  writer: Writer,
  entryId: string,
  tagId: string,
): SyncState {
  if (!state.tags.has(tagId)) throw new SyncOpError('missing-tag', `No tag ${tagId}`);
  if (liveEntry(state, entryId).tags.some((member) => member.id === tagId)) return state;
  return updateEntry(state, writer, entryId, (entry, s) => ({
    tags: addMember(entry.tags, { id: tagId, s }),
  }));
}

export function removeTag(
  state: SyncState,
  writer: Writer,
  entryId: string,
  tagId: string,
): SyncState {
  return updateEntry(state, writer, entryId, (entry) => ({
    tags: entry.tags.filter((member) => member.id !== tagId),
  }));
}

/**
 * Engine rule (not enforced here): an attachment is stamped only when it is
 * first published, so a stamped attachment always has its blob on Drive.
 */
export function attach(
  state: SyncState,
  writer: Writer,
  entryId: string,
  descriptor: MediaDescriptor,
): SyncState {
  if (descriptor.ownerType !== 'entry' || descriptor.ownerId !== entryId)
    throw new SyncOpError('invalid-media', 'Attachment must belong to its entry');
  if (state.media.has(descriptor.assetId))
    throw new SyncOpError('asset-exists', `Asset ${descriptor.assetId} exists`);
  const next = updateEntry(state, writer, entryId, (entry, s) => ({
    attachments: addMember(entry.attachments, { id: descriptor.assetId, s }),
  }));
  const media = new Map(next.media);
  media.set(descriptor.assetId, descriptor);
  return { ...next, media };
}

export function detach(
  state: SyncState,
  writer: Writer,
  entryId: string,
  assetId: string,
): SyncState {
  const next = updateEntry(state, writer, entryId, (entry) => ({
    attachments: entry.attachments.filter((member) => member.id !== assetId),
  }));
  return { ...next, media: pruneMedia(next.media, next.entries, next.profile) };
}

export function setAttachmentOrder(
  state: SyncState,
  writer: Writer,
  entryId: string,
  order: readonly string[],
): SyncState {
  return updateEntry(state, writer, entryId, (_entry, s) => ({
    order: { s, v: [...new Set(order)] },
  }));
}

function namedMap(state: SyncState, kind: NamedKind) {
  return kind === 'tag' ? state.tags : state.prompts;
}

function withNamed(state: SyncState, kind: NamedKind, record: NamedRecord): SyncState {
  const map = new Map(namedMap(state, kind));
  map.set(record.id, record);
  return kind === 'tag' ? { ...state, tags: map } : { ...state, prompts: map };
}

function cleanTitle(kind: NamedKind, title: string): string {
  const clean = kind === 'tag' ? sanitizeTagName(title) : sanitizePromptTitle(title);
  if (!clean) throw new SyncOpError('invalid-title', 'Title is empty');
  return clean;
}

/** The app refuses a title another live tag or prompt already has. */
function assertTitleFree(
  state: SyncState,
  kind: NamedKind,
  title: string,
  except?: string,
) {
  const wanted = normalizeTitle(kind, title);
  for (const record of namedMap(state, kind).values()) {
    if (
      record.id !== except &&
      isLive(record) &&
      normalizeTitle(kind, record.title.v) === wanted
    )
      throw new SyncOpError('duplicate-title', `${kind} title exists`);
  }
}

export function createNamed(
  state: SyncState,
  writer: Writer,
  kind: NamedKind,
  title: string,
): { state: SyncState; id: string } {
  const clean = cleanTitle(kind, title);
  assertTitleFree(state, kind, clean);
  // A live record on the derived ID was renamed away from this title: never
  // rename it back; take the next derived ID. Devices that agree on which
  // records are live pick the same one.
  let attempt = 0;
  let id = namedId(kind, state.vaultId, clean);
  // A deleted holder is revived only if it still has this title: another
  // device may have renamed it before this device saw the delete.
  const wanted = normalizeTitle(kind, clean);
  for (;;) {
    const holder = namedMap(state, kind).get(id);
    if (!holder) break;
    if (!isLive(holder) && normalizeTitle(kind, holder.title.v) === wanted) break;
    id = namedId(kind, state.vaultId, clean, ++attempt);
  }
  const existing = namedMap(state, kind).get(id);
  const { state: next, s } = tick(state, writer);
  // A deleted tag with this ID comes back: the new write is one its delete never saw.
  const record: NamedRecord = existing
    ? { ...existing, vv: withStamp(existing.vv, s), title: { s, v: clean } }
    : { id, vv: { [s[1]]: s[0] }, del: null, title: { s, v: clean } };
  return { state: withNamed(next, kind, record), id };
}

export function renameNamed(
  state: SyncState,
  writer: Writer,
  kind: NamedKind,
  id: string,
  title: string,
): SyncState {
  const record = namedMap(state, kind).get(id);
  if (!record || !isLive(record))
    throw new SyncOpError('missing-named', `No ${kind} ${id}`);
  const clean = cleanTitle(kind, title);
  assertTitleFree(state, kind, clean, id);
  const { state: next, s } = tick(state, writer);
  return withNamed(next, kind, {
    ...record,
    vv: withStamp(record.vv, s),
    title: { s, v: clean },
  });
}

/**
 * Deleting a tag also removes it from every entry this device has. That is a
 * side effect, not an edit of those entries, so it adds no stamp to them and
 * never brings back an entry another device deleted.
 */
export function deleteNamed(
  state: SyncState,
  writer: Writer,
  kind: NamedKind,
  id: string,
): SyncState {
  const record = namedMap(state, kind).get(id);
  if (!record) throw new SyncOpError('missing-named', `No ${kind} ${id}`);
  const { state: ticked, s } = tick(state, writer);
  let next = ticked;
  if (kind === 'tag') {
    const entries = new Map(next.entries);
    for (const entry of next.entries.values()) {
      if (entry.tags.some((member) => member.id === id))
        entries.set(entry.id, {
          ...entry,
          tags: entry.tags.filter((member) => member.id !== id),
        });
    }
    next = { ...next, entries };
  }
  const vv = withStamp(record.vv, s);
  const del = { at: s, seen: vv, ackSeen: null };
  return withNamed(next, kind, {
    ...record,
    vv,
    del: record.del ? joinTombstones(record.del, del) : del,
  });
}

export function setProfileName(
  state: SyncState,
  writer: Writer,
  value: string | null,
  replaces: Replaces,
): SyncState {
  const { state: next, s } = tick(state, writer);
  return {
    ...next,
    profile: {
      ...next.profile,
      vv: withStamp(next.profile.vv, s),
      name: replaceItems(next.profile.name, replaces, { s, v: value }),
    },
  };
}

export function setProfilePhoto(
  state: SyncState,
  writer: Writer,
  descriptor: MediaDescriptor | null,
  replaces: Replaces,
): SyncState {
  if (
    descriptor &&
    (descriptor.ownerType !== 'profile' ||
      descriptor.ownerId !== 'profile' ||
      descriptor.kind !== 'profile-photo')
  )
    throw new SyncOpError('invalid-media', 'Profile photo must be a profile-photo');
  const { state: ticked, s } = tick(state, writer);
  const profile = {
    ...ticked.profile,
    vv: withStamp(ticked.profile.vv, s),
    photo: replaceItems(ticked.profile.photo, replaces, {
      s,
      v: descriptor?.assetId ?? null,
    }),
  };
  const existing = descriptor ? state.media.get(descriptor.assetId) : undefined;
  if (existing && canonicalize(existing) !== canonicalize(descriptor))
    throw new SyncOpError('asset-exists', `Asset ${descriptor!.assetId} exists`);
  const media = new Map(ticked.media);
  if (descriptor) media.set(descriptor.assetId, descriptor);
  return { ...ticked, profile, media: pruneMedia(media, ticked.entries, profile) };
}

/** "Keep this one" for the profile name or photo. */
export function keepProfile(
  state: SyncState,
  writer: Writer,
  field: 'name' | 'photo',
  chosen: Stamp,
): SyncState {
  const item = state.profile[field].find((value) => compareStamps(value.s, chosen) === 0);
  if (!item) throw new SyncOpError('missing-version', 'The chosen version is gone');
  if (field === 'name') return setProfileName(state, writer, item.v, 'all');
  const descriptor = item.v === null ? null : (state.media.get(item.v) ?? null);
  const { state: ticked, s } = tick(state, writer);
  const profile = {
    ...ticked.profile,
    vv: withStamp(ticked.profile.vv, s),
    photo: [{ s, v: descriptor?.assetId ?? null }],
  };
  return { ...ticked, profile, media: pruneMedia(ticked.media, ticked.entries, profile) };
}

/**
 * Puts the device on the roster (or moves its last-seen time forward) without
 * a write. A device publishes under its own name, so it calls this first.
 */
export function markSeen(state: SyncState, writer: Writer): SyncState {
  const hlc = nextHlc(state.ctx, writer.wallMs);
  const lastSeen = state.roster[writer.device];
  if (lastSeen !== undefined && lastSeen >= hlc) return state;
  return { ...state, roster: { ...state.roster, [writer.device]: hlc } };
}
