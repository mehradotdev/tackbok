/**
 * The conflicts card and Home notice, fed from cloud sync v2's versions
 * (`versions.ts`). `conflictIds` name what an action resolves:
 * - `name:<hlc>:<device>` / `photo:<hlc>:<device>`: another version of the
 *   profile name or photo;
 * - `returned:<entryId>`: an entry back after a delete;
 * - `entries`: the entries with other versions (resolved on Other versions).
 * Every choice is a synced write, so it clears on every device.
 */
import { eq } from 'drizzle-orm';

import { db, mediaAssets, userProfile } from '~/db';
import { photoFileExists } from '~/lib/photoUtils';
import { hydrateProfileCache, useSettingsStore } from '~/lib/settings';
import { notifyProductionCloudSyncChanged } from '../runtime/production';
import type { Stamp } from '../v2/types';
import {
  acknowledgeReturnedEntries,
  keepProfileChoice,
  listOtherVersions,
  listProfileVersions,
  listReturnedEntries,
  type ProfileField,
} from './versions';

export { VersionsChangedError } from './versions';

/** An actionable row on the conflicts card, with when this device took it in. */
export type CloudConflictItem = (
  | {
      kind: 'name';
      conflictIds: string[];
      current: string | null;
      other: string | null;
      /** What the card listed: "Use" and "Keep current" refuse if it changed. */
      seen: ProfileField;
    }
  | {
      kind: 'photo';
      conflictIds: string[];
      otherAssetId: string;
      otherUri: string;
      /** What the card listed: "Use" and "Keep current" refuse if it changed. */
      seen: ProfileField;
    }
  | {
      /** Entries with more than one version of their title or text. */
      kind: 'entries';
      conflictIds: string[];
      entryCount: number;
    }
  | {
      /** An entry deleted on one device and edited on another: the edit was kept. */
      kind: 'returnedEntry';
      conflictIds: string[];
      entry: ReturnedEntrySummary;
    }
) & { latestAt: number };

/** Enough of a returned entry for the user to recognize it. */
export interface ReturnedEntrySummary {
  entryId: string;
  createdAt: number;
  title: string | null;
  /** The start of the entry's text. */
  preview: string | null;
}

/** Characters of an entry's text shown to help the user recognize it. */
const PREVIEW_LENGTH = 200;

const stampId = (kind: 'name' | 'photo', stamp: Stamp) =>
  `${kind}:${stamp[0]}:${stamp[1]}`;

function parseStampId(id: string): Stamp {
  const [, hlc, ...device] = id.split(':');
  return [Number(hlc), device.join(':')];
}

/** The choices this device can act on. Read errors are thrown to the caller. */
export async function listCloudConflictItems(): Promise<CloudConflictItem[]> {
  const [versions, profileVersions, returned, [profile]] = await Promise.all([
    listOtherVersions(),
    listProfileVersions(),
    listReturnedEntries(),
    db.select().from(userProfile).limit(1),
  ]);
  const items: CloudConflictItem[] = [];
  for (const other of profileVersions.name.others)
    items.push({
      kind: 'name',
      conflictIds: [stampId('name', other.stamp)],
      current: profile?.display_name ?? null,
      other: other.value,
      seen: profileVersions.name,
      latestAt: profileVersions.receivedAt,
    });
  for (const other of profileVersions.photo.others) {
    // A photo is offered only once its file is on this device.
    if (other.value === null) continue;
    const [row] = await db
      .select({ uri: mediaAssets.local_uri, state: mediaAssets.download_state })
      .from(mediaAssets)
      .where(eq(mediaAssets.asset_id, other.value))
      .limit(1);
    if (!row?.uri || (row.state !== 'n/a' && row.state !== 'verified')) continue;
    if (!photoFileExists(row.uri)) continue;
    items.push({
      kind: 'photo',
      conflictIds: [stampId('photo', other.stamp)],
      otherAssetId: other.value,
      otherUri: row.uri,
      seen: profileVersions.photo,
      latestAt: profileVersions.receivedAt,
    });
  }
  if (versions.size > 0)
    items.push({
      kind: 'entries',
      conflictIds: ['entries'],
      entryCount: versions.size,
      latestAt: Math.max(
        ...[...versions.values()].flatMap((list) =>
          list.map((other) => other.receivedAt),
        ),
      ),
    });
  for (const entry of returned)
    items.push({
      kind: 'returnedEntry',
      conflictIds: [`returned:${entry.entryId}`],
      entry: {
        entryId: entry.entryId,
        createdAt: entry.createdAt,
        title: entry.title,
        preview: entry.text?.slice(0, PREVIEW_LENGTH) ?? null,
      },
      latestAt: entry.receivedAt,
    });
  return items.sort((a, b) => b.latestAt - a.latestAt);
}

/** "Got it": acknowledges returned entries; synced to every device. */
export async function acknowledgeCloudConflicts(conflictIds: string[]): Promise<void> {
  const entryIds = conflictIds
    .filter((id) => id.startsWith('returned:'))
    .map((id) => id.slice('returned:'.length));
  if (entryIds.length > 0) await acknowledgeReturnedEntries(entryIds);
  notifyProductionCloudSyncChanged();
}

/**
 * "Use" keeps the other name, "Keep current" the shown one; either syncs.
 * Throws `VersionsChangedError`, writing nothing, if the names changed since
 * the card listed them.
 */
export async function resolveNameConflict(
  item: Extract<CloudConflictItem, { kind: 'name' }>,
  choice: 'use' | 'keep',
): Promise<void> {
  await keepProfileChoice(
    'name',
    choice === 'use' ? parseStampId(item.conflictIds[0]) : null,
    item.seen,
  );
  const [profile] = await db.select().from(userProfile).limit(1);
  const { profileEmail, profileImageUri } = useSettingsStore.getState();
  hydrateProfileCache({
    profileName: profile?.display_name ?? null,
    profileEmail,
    profileImageUri,
  });
  notifyProductionCloudSyncChanged();
}

/** As `resolveNameConflict`, for the profile photo. */
export async function resolvePhotoConflict(
  item: Extract<CloudConflictItem, { kind: 'photo' }>,
  choice: 'use' | 'keep',
): Promise<void> {
  if (choice === 'use') {
    await keepProfileChoice('photo', parseStampId(item.conflictIds[0]), item.seen);
    const { profileName, profileEmail } = useSettingsStore.getState();
    hydrateProfileCache({ profileName, profileEmail, profileImageUri: item.otherUri });
  } else await keepProfileChoice('photo', null, item.seen);
  notifyProductionCloudSyncChanged();
}
