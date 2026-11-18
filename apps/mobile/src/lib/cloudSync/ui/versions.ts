/**
 * Cloud sync v2 (#185): what the conflict screens show and do, read from the
 * versions kept inside each record (`storage/v2State.ts`).
 *
 * shortcut: an interim for P7. The v1 screens (Other versions, the conflicts
 * card, the entry badge and banner, the Home notice) keep their layout and
 * copy and are fed from here. Each other version of a title or text is shown
 * as a copy of the entry with that one field changed; "Keep this one" keeps
 * that value (or the shown ones) as one new write. "Keep both" and new copy
 * come with P7.
 *
 * Each choice names the stamps of the values in it (`noticeStamps`): the Home
 * notice shows while one of them, written by another device, is not among
 * the stamps the user has seen (`markConflictsSeen`), which sync. This
 * device's own writes are never news, so a local edit keeps it hidden.
 *
 * shortcut: an ordinary edit on another device of a value in an open choice
 * (the shown title of an entry with versions, a returned entry) is a new
 * stamp there, so it shows the notice again on this device. Count only the
 * stamps that opened a choice if that proves noisy.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db, entries, syncDevice, syncFieldValues, syncRecords, userProfile } from '~/db';
import type { Entry } from '~/types';

import { notifyCloudSyncMutationCommitted } from '../runtime/mutationSignal';
import { enqueueMutation } from '../storage/repositories';
import {
  applySyncState,
  captureSyncState,
  type ApplyMediaFiles,
} from '../storage/v2State';
import { canonicalize } from '../snapshot/canonical';
import { compareStamps, vectorIncluded } from '../v2/clock';
import * as ops from '../v2/ops';
import type {
  EntryRecord,
  Json,
  ProfileRecord,
  Stamp,
  SyncState,
  Tombstone,
  VersionVector,
} from '../v2/types';
import { isLive, isReturned, shownItems } from '../v2/view';

type TextField = 'title' | 'text';

export const stampKey = (stamp: Stamp) => `${stamp[0]}:${stamp[1]}`;

/** One value beside the shown one; `stamp` names it for "Keep this one". */
export interface OtherVersion {
  field: TextField;
  stamp: Stamp;
  value: string | null;
  /** The stamp of the field's shown value, which this version differs from. */
  shownStamp: Stamp;
}

/** The ID of a shown copy of an entry with one other version in it. */
export function versionCopyId(entryId: string, version: OtherVersion): string {
  return `${entryId}#${version.field}#${version.stamp[0]}:${version.stamp[1]}`;
}

/** The other version a copy shows, or null for an entry's own ID. */
export function parseVersionCopyId(
  id: string,
): { entryId: string; field: TextField; stamp: Stamp } | null {
  const match = /^(.*)#(title|text)#(\d+):(.+)$/.exec(id);
  if (!match) return null;
  return {
    entryId: match[1],
    field: match[2] as TextField,
    stamp: [Number(match[3]), match[4]],
  };
}

/**
 * Other versions of shown entries, by entry: values beside the shown one
 * that differ from it (equal copies are shown once, as in the model).
 */
export async function listOtherVersions(): Promise<Map<string, OtherVersion[]>> {
  const rows = await db
    .select({
      entryId: syncFieldValues.entity_id,
      field: syncFieldValues.field,
      hlc: syncFieldValues.stamp_hlc,
      device: syncFieldValues.stamp_device,
      value: syncFieldValues.value_json,
      title: entries.text_title,
      text: entries.text_content,
      shownStamps: syncRecords.stamps_json,
    })
    .from(syncFieldValues)
    .innerJoin(entries, eq(entries.note_id, syncFieldValues.entity_id))
    .innerJoin(
      syncRecords,
      and(
        eq(syncRecords.entity_type, 'entry'),
        eq(syncRecords.entity_id, entries.note_id),
      ),
    )
    .where(
      and(
        eq(syncFieldValues.entity_type, 'entry'),
        inArray(syncFieldValues.field, ['title', 'text']),
      ),
    );
  const result = new Map<string, OtherVersion[]>();
  for (const row of rows) {
    const field = row.field as TextField;
    const value = JSON.parse(row.value) as string | null;
    const shown = field === 'title' ? row.title : row.text;
    if (value === shown) continue;
    const list = result.get(row.entryId) ?? [];
    // Equal values once: the newest copy.
    const same = list.find((other) => other.field === field && other.value === value);
    const stamp: Stamp = [row.hlc, row.device];
    if (same) {
      if (compareStamps(stamp, same.stamp) > 0) same.stamp = stamp;
      continue;
    }
    const shownStamp = (JSON.parse(row.shownStamps) as Partial<Record<string, Stamp>>)[
      field
    ];
    if (!shownStamp) throw new Error(`Entry ${row.entryId} has no ${field} stamp`);
    list.push({ field, stamp, value, shownStamp });
    result.set(row.entryId, list);
  }
  for (const list of result.values())
    list.sort((a, b) => compareStamps(b.stamp, a.stamp));
  return result;
}

/**
 * Entries with other versions, each as the entry (`original`) and one copy
 * per other version (`versions`, newest first), newest entry first.
 */
export async function listVersionGroups(): Promise<
  { original: Entry; versions: Entry[] }[]
> {
  const versions = await listOtherVersions();
  if (versions.size === 0) return [];
  const ids = [...versions.keys()];
  const rows: Entry[] = [];
  // In batches: one bound variable per entry, under SQLite's limit.
  for (let offset = 0; offset < ids.length; offset += 400)
    rows.push(
      ...(await db
        .select()
        .from(entries)
        .where(inArray(entries.note_id, ids.slice(offset, offset + 400)))),
    );
  return rows
    .sort((a, b) => b.created_at - a.created_at || (a.note_id < b.note_id ? -1 : 1))
    .map((row) => ({
      original: row,
      versions: versions.get(row.note_id)!.map((version) => ({
        ...row,
        note_id: versionCopyId(row.note_id, version),
        ...(version.field === 'title'
          ? { text_title: version.value }
          : { text_content: version.value }),
        // Attachments belong to the entry, not to a version of its text.
        assets: [],
      })),
    }));
}

/** A profile name or photo as the conflicts card shows it. */
export interface ProfileField {
  /** The shown value. */
  shown: string | null;
  /** Its stamp; null when never written. */
  shownStamp: Stamp | null;
  /** Values beside the shown one, newest first. */
  others: { stamp: Stamp; value: string | null }[];
}

/** Profile name and photo, with the values beside the shown ones. */
export async function listProfileVersions(): Promise<{
  name: ProfileField;
  photo: ProfileField;
}> {
  const [profile] = await db.select().from(userProfile).limit(1);
  const [record] = await db
    .select({ stamps: syncRecords.stamps_json })
    .from(syncRecords)
    .where(
      and(eq(syncRecords.entity_type, 'profile'), eq(syncRecords.entity_id, 'profile')),
    );
  const rows = await db
    .select()
    .from(syncFieldValues)
    .where(eq(syncFieldValues.entity_type, 'profile'));
  const stamps = record
    ? (JSON.parse(record.stamps) as Partial<Record<string, Stamp>>)
    : {};
  const pick = (field: 'name' | 'photo', shown: string | null): ProfileField => {
    const seen = new Set<string | null>([shown]);
    return {
      shown,
      shownStamp: stamps[field] ?? null,
      others: rows
        .filter((row) => row.field === field)
        .map((row) => ({
          stamp: [row.stamp_hlc, row.stamp_device] as Stamp,
          value: JSON.parse(row.value_json) as string | null,
        }))
        .sort((a, b) => compareStamps(b.stamp, a.stamp))
        .filter((item) => !seen.has(item.value) && Boolean(seen.add(item.value))),
    };
  };
  return {
    name: pick('name', profile?.display_name ?? null),
    photo: pick('photo', profile?.photo_asset_id ?? null),
  };
}

/** Shown entries back after a delete that nobody has acknowledged ("Got it"). */
export async function listReturnedEntries(): Promise<
  {
    entryId: string;
    createdAt: number;
    title: string | null;
    text: string | null;
    /** The delete, and the writes it had not seen that brought the entry back. */
    noticeStamps: Stamp[];
  }[]
> {
  const rows = await db
    .select({
      entryId: syncRecords.entity_id,
      del: syncRecords.del_json,
      createdAt: entries.created_at,
      title: entries.text_title,
      text: entries.text_content,
      vv: syncRecords.vv_json,
    })
    .from(syncRecords)
    .innerJoin(entries, eq(entries.note_id, syncRecords.entity_id))
    .where(and(eq(syncRecords.entity_type, 'entry'), isNotNull(syncRecords.del_json)));
  return rows.flatMap((row) => {
    const del = JSON.parse(row.del!) as Tombstone;
    const acknowledged =
      del.ackSeen !== null && vectorIncluded(del.seen, del.ackSeen as VersionVector);
    return acknowledged
      ? []
      : [
          {
            entryId: row.entryId,
            createdAt: row.createdAt,
            title: row.title,
            text: row.text,
            noticeStamps: [
              del.at,
              ...Object.entries(JSON.parse(row.vv) as VersionVector).flatMap(
                ([device, hlc]): Stamp[] =>
                  hlc > (del.seen[device] ?? -1) ? [[hlc, device]] : [],
              ),
            ],
          },
        ];
  });
}

/**
 * Profile `ext` feature (vault-wide, see `ProfileRecord`): stamps of conflict
 * values the user has seen on the Home notice or Other versions, as a list
 * of `[hlc, device]`. Concurrent writes from two devices are read as one set.
 */
export const NOTICE_SEEN_FEATURE = 'conflict-notice-seen';

export function seenStampsOf(state: Pick<SyncState, 'profile'>): Stamp[] {
  return (state.profile.ext[NOTICE_SEEN_FEATURE] ?? []).flatMap((item) =>
    Array.isArray(item.v)
      ? item.v.filter(
          (stamp): stamp is [number, string] =>
            Array.isArray(stamp) &&
            typeof stamp[0] === 'number' &&
            typeof stamp[1] === 'string',
        )
      : [],
  );
}

/**
 * What the Home notice compares with: the stamps seen (synced), and this
 * device's ID, since its own writes are never news here.
 */
export async function readNoticeSeen(): Promise<{
  deviceId: string | null;
  seen: Set<string>;
}> {
  const [device] = await db
    .select({ id: syncDevice.device_id })
    .from(syncDevice)
    .where(eq(syncDevice.id, 'self'));
  const [record] = await db
    .select({ ext: syncRecords.ext_json })
    .from(syncRecords)
    .where(
      and(eq(syncRecords.entity_type, 'profile'), eq(syncRecords.entity_id, 'profile')),
    );
  const ext = record ? (JSON.parse(record.ext) as ProfileRecord['ext']) : {};
  return {
    deviceId: device?.id ?? null,
    seen: new Set(seenStampsOf({ profile: { ext } as ProfileRecord }).map(stampKey)),
  };
}

/** Whether a choice is news for the Home notice: a value from another device not seen. */
export function isNewChoice(
  noticeStamps: readonly Stamp[],
  { deviceId, seen }: { deviceId: string | null; seen: ReadonlySet<string> },
): boolean {
  return noticeStamps.some(
    (stamp) => stamp[1] !== deviceId && !seen.has(stampKey(stamp)),
  );
}

/**
 * Every stamp of a value in an open choice, read from the state itself: a
 * choice this device does not list (a photo still downloading) still counts.
 */
function openChoiceStamps(state: SyncState): Set<string> {
  const keys = new Set<string>();
  const addField = (items: readonly { s: Stamp; v: unknown }[]) => {
    if (shownItems(items).length > 1)
      for (const item of items) keys.add(stampKey(item.s));
  };
  for (const entry of state.entries.values()) {
    if (isReturned(entry)) {
      keys.add(stampKey(entry.del!.at));
      for (const [device, hlc] of Object.entries(entry.vv))
        if (hlc > (entry.del!.seen[device] ?? -1)) keys.add(stampKey([hlc, device]));
    }
    if (!isLive(entry)) continue;
    addField(entry.title);
    addField(entry.text);
  }
  addField(state.profile.name);
  addField(state.profile.photo);
  return keys;
}

/**
 * Records `stamps` as seen, on every device once it syncs. Seen stamps no
 * longer in an open choice are dropped, so the list stays small. This
 * device's own stamps stay: they are news on the other devices. Writes
 * nothing when nothing changes.
 */
export async function markConflictsSeen(
  stamps: readonly Stamp[],
  files?: ApplyMediaFiles,
): Promise<void> {
  await writeThroughSync((state, writer) => {
    const open = openChoiceStamps(state);
    const before = seenStampsOf(state);
    const kept = new Map<string, Stamp>();
    for (const stamp of [...before, ...stamps])
      if (open.has(stampKey(stamp))) kept.set(stampKey(stamp), stamp);
    const value: Json = [...kept.values()]
      .sort(compareStamps)
      .map((stamp) => [stamp[0], stamp[1]]);
    const items = state.profile.ext[NOTICE_SEEN_FEATURE] ?? [];
    const unchanged =
      items.length === 0
        ? value.length === 0
        : items.length === 1 && canonicalize(items[0].v) === canonicalize(value);
    if (unchanged) return state;
    return ops.writeExt(
      state,
      writer,
      { kind: 'profile' },
      NOTICE_SEEN_FEATURE,
      value,
      'all',
    );
  }, files);
}

/** How many choices the conflict screens offer: the Home notice's count. */
export async function countSyncChoices(): Promise<number> {
  const [versions, profile, returned] = await Promise.all([
    listOtherVersions(),
    listProfileVersions(),
    listReturnedEntries(),
  ]);
  return (
    versions.size +
    (profile.name.others.length > 0 ? 1 : 0) +
    (profile.photo.others.length > 0 ? 1 : 0) +
    returned.length
  );
}

/**
 * A sync write the user makes from these screens, as the model makes it:
 * capture, the model's write, apply. A local edit between capture and apply
 * makes the apply refuse; it is tried again on the new state.
 */
async function writeThroughSync(
  write: (state: SyncState, writer: ops.Writer) => SyncState,
  files?: ApplyMediaFiles,
): Promise<void> {
  // Loaded only when needed: the media store reads the file system.
  const applyFiles =
    files ?? (await import('../snapshot/storage')).productionApplyFiles();
  for (let attempt = 0; attempt < 3; attempt++) {
    const captured = await captureSyncState();
    const next = write(captured.state, { device: captured.deviceId, wallMs: Date.now() });
    if (next === captured.state) return;
    // A local change like an edit: counted as waiting to sync (the vault
    // shows as dirty) in the same transaction, and a sync is scheduled.
    const applied = await applySyncState(captured, next, applyFiles, (tx) =>
      enqueueMutation(tx),
    );
    if (applied) {
      notifyCloudSyncMutationCommitted();
      return;
    }
  }
  throw new Error('The journal kept changing; try again');
}

/** The versions on screen are no longer the entry's: nothing was written. */
export class VersionsChangedError extends Error {
  constructor() {
    super('The versions changed while the choice was open');
    this.name = 'VersionsChangedError';
  }
}

/** Stamps of the values beside the shown one, by field, as the screen lists them. */
function otherStamps(entry: EntryRecord) {
  const result: string[] = [];
  for (const field of ['title', 'text'] as const)
    for (const item of shownItems(entry[field]).slice(1))
      result.push(`${field}#${item.s[0]}:${item.s[1]}`);
  return result.sort();
}

type SeenEntry = Pick<Entry, 'note_id' | 'text_title' | 'text_content'>;

/**
 * The entry a choice on Other versions acts on, if it still is what the
 * screen showed (`seen`: the entry as shown, and its copies). If the shown
 * title or text changed, or a version arrived or went, throws
 * `VersionsChangedError`, so a value the user never saw is never dropped.
 */
function seenEntry(state: SyncState, entryId: string, seen: readonly SeenEntry[]) {
  const original = seen.find((member) => member.note_id === entryId);
  const shownToUser = seen
    .map((member) => parseVersionCopyId(member.note_id))
    .flatMap((other) =>
      other ? [`${other.field}#${other.stamp[0]}:${other.stamp[1]}`] : [],
    )
    .sort();
  const entry = state.entries.get(entryId);
  if (
    !entry ||
    // Deleted meanwhile: its values are kept until compaction, but it is gone.
    !isLive(entry) ||
    !original ||
    shownItems(entry.title)[0]?.v !== original.text_title ||
    shownItems(entry.text)[0]?.v !== original.text_content ||
    otherStamps(entry).join() !== shownToUser.join()
  )
    throw new VersionsChangedError();
  return entry;
}

/**
 * "Keep this one" on Other versions: `id` is an entry (keep what it shows) or
 * a copy (keep that other version of its field). One new write per field.
 * Refuses as `seenEntry` does.
 */
export async function keepEntryVersion(
  id: string,
  seen: readonly SeenEntry[],
  files?: ApplyMediaFiles,
): Promise<void> {
  const copy = parseVersionCopyId(id);
  const entryId = copy?.entryId ?? id;
  await writeThroughSync((state, writer) => {
    seenEntry(state, entryId, seen);
    if (copy) return ops.keepValue(state, writer, entryId, copy.field, copy.stamp);
    let next = state;
    for (const field of ['title', 'text'] as const) {
      const shown = shownItems(next.entries.get(entryId)![field]);
      if (shown.length > 1)
        next = ops.keepValue(next, writer, entryId, field, shown[0].s);
    }
    return next;
  }, files);
}

/**
 * "Keep both" on a copy (`copyId`): the entry keeps its shown value of that
 * field, and the copy's value becomes a new entry with the same date, mood
 * and tags (`ops.keepBoth`). Its ID comes from the moved version, so two
 * devices doing this at once make one entry. Other open versions stay.
 * Refuses as `seenEntry` does. Returns the new entry's ID.
 */
export async function keepBothVersions(
  copyId: string,
  seen: readonly SeenEntry[],
  files?: ApplyMediaFiles,
): Promise<string> {
  const copy = parseVersionCopyId(copyId);
  if (!copy) throw new Error('"Keep both" needs another version');
  let newEntryId = '';
  await writeThroughSync((state, writer) => {
    const entry = seenEntry(state, copy.entryId, seen);
    const result = ops.keepBoth(
      state,
      writer,
      copy.entryId,
      copy.field,
      shownItems(entry[copy.field])[0].s,
      copy.stamp,
    );
    newEntryId = result.newEntryId;
    return result.state;
  }, files);
  return newEntryId;
}

/** "Got it" on returned entries. Syncs: every device stops showing the notice. */
export async function acknowledgeReturnedEntries(
  entryIds: readonly string[],
  files?: ApplyMediaFiles,
): Promise<void> {
  await writeThroughSync(
    (state, writer) =>
      entryIds.reduce((next, id) => {
        try {
          return ops.acknowledgeReturn(next, writer, id);
        } catch (error) {
          // Acknowledged elsewhere meanwhile, or no longer back.
          if (error instanceof ops.SyncOpError) return next;
          throw error;
        }
      }, state),
    files,
  );
}

/**
 * "Use" (`chosen`, another version's stamp) or "Keep current" (`chosen`
 * null) for the profile name or photo: one write of that value. `seen` is
 * what the conflicts card listed. If the shown value changed, or a version
 * arrived or went, nothing is written and `VersionsChangedError` is thrown,
 * as for entries.
 */
export async function keepProfileChoice(
  field: 'name' | 'photo',
  chosen: Stamp | null,
  seen: ProfileField,
  files?: ApplyMediaFiles,
): Promise<void> {
  const seenOthers = seen.others.map((other) => stampKey(other.stamp)).sort();
  await writeThroughSync((state, writer) => {
    const shown = shownItems(state.profile[field]);
    const others = shown.slice(1).map((item) => stampKey(item.s));
    // No other version left: the choice was made elsewhere meanwhile.
    if (
      others.length === 0 ||
      (shown[0]?.v ?? null) !== seen.shown ||
      others.sort().join() !== seenOthers.join()
    )
      throw new VersionsChangedError();
    return ops.keepProfile(state, writer, field, chosen ?? shown[0].s);
  }, files);
}
