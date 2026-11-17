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
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db, entries, syncFieldValues, syncRecords, userProfile } from '~/db';
import type { Entry } from '~/types';

import { productionApplyFiles } from '../snapshot/storage';
import { applySyncState, captureSyncState } from '../storage/v2State';
import { compareStamps, vectorIncluded } from '../v2/clock';
import * as ops from '../v2/ops';
import type { Stamp, SyncState, Tombstone, VersionVector } from '../v2/types';
import { shownItems } from '../v2/view';

type TextField = 'title' | 'text';

/** One value beside the shown one; `stamp` names it for "Keep this one". */
export interface OtherVersion {
  field: TextField;
  stamp: Stamp;
  value: string | null;
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
    })
    .from(syncFieldValues)
    .innerJoin(entries, eq(entries.note_id, syncFieldValues.entity_id))
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
    list.push({ field, stamp, value });
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
  const rows = await db
    .select()
    .from(entries)
    .where(inArray(entries.note_id, [...versions.keys()]));
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

/** Profile name or photo values beside the shown one, newest first. */
export async function listProfileVersions(): Promise<{
  name: { stamp: Stamp; value: string | null }[];
  photo: { stamp: Stamp; value: string | null }[];
}> {
  const [profile] = await db.select().from(userProfile).limit(1);
  const rows = await db
    .select()
    .from(syncFieldValues)
    .where(eq(syncFieldValues.entity_type, 'profile'));
  const pick = (field: 'name' | 'photo', shown: string | null) => {
    const seen = new Set<string | null>([shown]);
    return rows
      .filter((row) => row.field === field)
      .map((row) => ({
        stamp: [row.stamp_hlc, row.stamp_device] as Stamp,
        value: JSON.parse(row.value_json) as string | null,
      }))
      .sort((a, b) => compareStamps(b.stamp, a.stamp))
      .filter((item) => !seen.has(item.value) && Boolean(seen.add(item.value)));
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
    at: number;
  }[]
> {
  const rows = await db
    .select({
      entryId: syncRecords.entity_id,
      del: syncRecords.del_json,
      createdAt: entries.created_at,
      title: entries.text_title,
      text: entries.text_content,
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
            at: del.at[0],
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
    (profile.name.length > 0 ? 1 : 0) +
    (profile.photo.length > 0 ? 1 : 0) +
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
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const captured = await captureSyncState();
    const next = write(captured.state, { device: captured.deviceId, wallMs: Date.now() });
    if (next === captured.state) return;
    if (await applySyncState(captured, next, productionApplyFiles())) return;
  }
  throw new Error('The journal kept changing; try again');
}

/**
 * "Keep this one" on Other versions: `id` is an entry (keep what it shows) or
 * a copy (keep that other version of its field). One new write per field.
 */
export async function keepEntryVersion(id: string): Promise<void> {
  const copy = parseVersionCopyId(id);
  await writeThroughSync((state, writer) => {
    if (copy) {
      const entry = state.entries.get(copy.entryId);
      if (!entry?.[copy.field].some((item) => compareStamps(item.s, copy.stamp) === 0))
        return state;
      return ops.keepValue(state, writer, copy.entryId, copy.field, copy.stamp);
    }
    let next = state;
    for (const field of ['title', 'text'] as const) {
      const entry = next.entries.get(id);
      const shown = entry ? shownItems(entry[field]) : [];
      if (shown.length > 1) next = ops.keepValue(next, writer, id, field, shown[0].s);
    }
    return next;
  });
}

/** "Got it" on returned entries. Syncs: every device stops showing the notice. */
export async function acknowledgeReturnedEntries(
  entryIds: readonly string[],
): Promise<void> {
  await writeThroughSync((state, writer) =>
    entryIds.reduce((next, id) => {
      try {
        return ops.acknowledgeReturn(next, writer, id);
      } catch (error) {
        // Acknowledged elsewhere meanwhile, or no longer back.
        if (error instanceof ops.SyncOpError) return next;
        throw error;
      }
    }, state),
  );
}

/** Use or keep a profile name or photo version: one write of the chosen value. */
export async function keepProfileVersion(
  field: 'name' | 'photo',
  stamp: Stamp,
): Promise<void> {
  await writeThroughSync((state, writer) =>
    state.profile[field].some((item) => compareStamps(item.s, stamp) === 0)
      ? ops.keepProfile(state, writer, field, stamp)
      : state,
  );
}

/** "Keep current": the shown value, so the others go. */
export async function keepShownProfileValue(field: 'name' | 'photo'): Promise<void> {
  await writeThroughSync((state, writer) => {
    const shown = shownItems(state.profile[field]);
    return shown.length > 1 ? ops.keepProfile(state, writer, field, shown[0].s) : state;
  });
}
