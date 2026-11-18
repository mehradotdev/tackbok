/**
 * Cloud sync v2 (#185): what the conflict screens show and do, read from the
 * versions kept inside each record (`storage/v2State.ts`).
 *
 * shortcut: an interim for P7. The v1 screens (Other versions, the conflicts
 * card, the entry badge and banner, the Home notice) keep their layout and
 * copy and are fed from here. Each other version of a title or text is shown
 * as a copy of the entry with that one field changed; "Keep this one" keeps
 * that value (or the shown ones) as one new write. "Keep both", syncing the
 * Home notice's dismissal and new copy come with P7.
 *
 * shortcut: times for the Home notice are when this device last changed the
 * record (`sync_records.updated_at`), so a local edit of an entry that still
 * has versions can show the hidden notice again. Fixed later in P7.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db, entries, syncFieldValues, syncRecords, userProfile } from '~/db';
import type { Entry } from '~/types';

import { notifyCloudSyncMutationCommitted } from '../runtime/mutationSignal';
import { enqueueMutation } from '../storage/repositories';
import {
  applySyncState,
  captureSyncState,
  type ApplyMediaFiles,
} from '../storage/v2State';
import { compareStamps, vectorIncluded } from '../v2/clock';
import * as ops from '../v2/ops';
import type {
  EntryRecord,
  Stamp,
  SyncState,
  Tombstone,
  VersionVector,
} from '../v2/types';
import { shownItems } from '../v2/view';

type TextField = 'title' | 'text';

/** One value beside the shown one; `stamp` names it for "Keep this one". */
export interface OtherVersion {
  field: TextField;
  stamp: Stamp;
  value: string | null;
  /**
   * When this device last took in a change to the entry (local time). The
   * Home notice compares it with local times, so not the write's stamp.
   */
  receivedAt: number;
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
      receivedAt: syncRecords.updated_at,
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
    list.push({ field, stamp, value, receivedAt: row.receivedAt });
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
  /** Values beside the shown one, newest first. */
  others: { stamp: Stamp; value: string | null }[];
}

/** Profile name and photo, with the values beside the shown ones. */
export async function listProfileVersions(): Promise<{
  name: ProfileField;
  photo: ProfileField;
  /** When this device last took in a change to the profile (local time). */
  receivedAt: number;
}> {
  const [profile] = await db.select().from(userProfile).limit(1);
  const [record] = await db
    .select({ updatedAt: syncRecords.updated_at })
    .from(syncRecords)
    .where(
      and(eq(syncRecords.entity_type, 'profile'), eq(syncRecords.entity_id, 'profile')),
    );
  const rows = await db
    .select()
    .from(syncFieldValues)
    .where(eq(syncFieldValues.entity_type, 'profile'));
  const pick = (field: 'name' | 'photo', shown: string | null): ProfileField => {
    const seen = new Set<string | null>([shown]);
    return {
      shown,
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
    receivedAt: record?.updatedAt ?? 0,
  };
}

/** Shown entries back after a delete that nobody has acknowledged ("Got it"). */
export async function listReturnedEntries(): Promise<
  {
    entryId: string;
    createdAt: number;
    title: string | null;
    text: string | null;
    /** When this device last took in a change to it (local time). */
    receivedAt: number;
  }[]
> {
  const rows = await db
    .select({
      entryId: syncRecords.entity_id,
      del: syncRecords.del_json,
      createdAt: entries.created_at,
      title: entries.text_title,
      text: entries.text_content,
      receivedAt: syncRecords.updated_at,
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
            receivedAt: row.receivedAt,
          },
        ];
  });
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
  target: { type: 'entry' | 'profile'; id: string },
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

/**
 * "Keep this one" on Other versions: `id` is an entry (keep what it shows) or
 * a copy (keep that other version of its field). One new write per field.
 * `seen` is what the screen showed: the entry as shown, and its copies. If
 * the shown title or text changed, or a version arrived or went, nothing is
 * written and `VersionsChangedError` is thrown, so a value the user never
 * saw is never dropped.
 */
export async function keepEntryVersion(
  id: string,
  seen: readonly Pick<Entry, 'note_id' | 'text_title' | 'text_content'>[],
  files?: ApplyMediaFiles,
): Promise<void> {
  const copy = parseVersionCopyId(id);
  const entryId = copy?.entryId ?? id;
  const original = seen.find((member) => member.note_id === entryId);
  const shownToUser = seen
    .map((member) => parseVersionCopyId(member.note_id))
    .flatMap((other) =>
      other ? [`${other.field}#${other.stamp[0]}:${other.stamp[1]}`] : [],
    )
    .sort();
  await writeThroughSync(
    (state, writer) => {
      const entry = state.entries.get(entryId);
      if (
        !entry ||
        !original ||
        shownItems(entry.title)[0]?.v !== original.text_title ||
        shownItems(entry.text)[0]?.v !== original.text_content ||
        otherStamps(entry).join() !== shownToUser.join()
      )
        throw new VersionsChangedError();
      if (copy) return ops.keepValue(state, writer, entryId, copy.field, copy.stamp);
      let next = state;
      for (const field of ['title', 'text'] as const) {
        const shown = shownItems(next.entries.get(entryId)![field]);
        if (shown.length > 1)
          next = ops.keepValue(next, writer, entryId, field, shown[0].s);
      }
      return next;
    },
    { type: 'entry', id: entryId },
    files,
  );
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
    { type: 'entry', id: entryIds[0] ?? '' },
    files,
  );
}

const stampKey = (stamp: Stamp) => `${stamp[0]}:${stamp[1]}`;

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
  await writeThroughSync(
    (state, writer) => {
      const shown = shownItems(state.profile[field]);
      const others = shown.slice(1).map((item) => stampKey(item.s));
      if (
        (shown[0]?.v ?? null) !== seen.shown ||
        others.sort().join() !== seenOthers.join()
      )
        throw new VersionsChangedError();
      if (others.length === 0) return state;
      return ops.keepProfile(state, writer, field, chosen ?? shown[0].s);
    },
    { type: 'profile', id: 'profile' },
    files,
  );
}
