/**
 * The conflicts card and Home notice, fed from cloud sync v2's versions
 * (`versions.ts`). Item shapes are those of v1's card (`conflictSummary.ts`);
 * `conflictIds` name what an action resolves:
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
import type { CloudConflictItem } from './conflictSummary';
import {
  acknowledgeReturnedEntries,
  keepProfileVersion,
  keepShownProfileValue,
  listOtherVersions,
  listProfileVersions,
  listReturnedEntries,
} from './versions';

export type { CloudConflictItem } from './conflictSummary';

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
  for (const other of profileVersions.name)
    items.push({
      kind: 'name',
      conflictIds: [stampId('name', other.stamp)],
      current: profile?.display_name ?? null,
      other: other.value,
      archived: false,
      latestAt: other.stamp[0],
    });
  for (const other of profileVersions.photo) {
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
      latestAt: other.stamp[0],
    });
  }
  if (versions.size > 0)
    items.push({
      kind: 'entries',
      conflictIds: ['entries'],
      entryCount: versions.size,
      latestAt: Math.max(
        ...[...versions.values()].flatMap((list) => list.map((other) => other.stamp[0])),
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
      // v2 brings an entry back only for an edit its deleter had not seen.
      edited: true,
      latestAt: entry.at,
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

/** Entry versions are resolved by "Keep this one" itself: nothing else to record. */
export async function acknowledgeEntryConflicts(_entryIds: string[]): Promise<void> {}

/** "Use" keeps the other name, "Keep current" the shown one; either syncs. */
export async function resolveNameConflict(
  item: Extract<CloudConflictItem, { kind: 'name' }>,
  choice: 'use' | 'keep',
): Promise<void> {
  if (choice === 'use')
    await keepProfileVersion('name', parseStampId(item.conflictIds[0]));
  else await keepShownProfileValue('name');
  const [profile] = await db.select().from(userProfile).limit(1);
  const { profileEmail, profileImageUri } = useSettingsStore.getState();
  hydrateProfileCache({
    profileName: profile?.display_name ?? null,
    profileEmail,
    profileImageUri,
  });
  notifyProductionCloudSyncChanged();
}

/** "Use" keeps the other photo, "Keep current" the shown one; either syncs. */
export async function resolvePhotoConflict(
  item: Extract<CloudConflictItem, { kind: 'photo' }>,
  choice: 'use' | 'keep',
): Promise<void> {
  if (choice === 'use') {
    await keepProfileVersion('photo', parseStampId(item.conflictIds[0]));
    const { profileName, profileEmail } = useSettingsStore.getState();
    hydrateProfileCache({ profileName, profileEmail, profileImageUri: item.otherUri });
  } else await keepShownProfileValue('photo');
  notifyProductionCloudSyncChanged();
}
