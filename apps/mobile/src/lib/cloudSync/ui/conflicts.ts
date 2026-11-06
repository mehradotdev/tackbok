import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { cloudConflicts, cloudVault, db, entries, mediaAssets, userProfile } from '~/db';
import { photoFileExists } from '~/lib/photoUtils';
import { hydrateProfileCache, useSettingsStore } from '~/lib/settings';
import { notifyProductionCloudSyncChanged } from '../runtime/production';
import {
  runInCloudSyncTransaction,
  updateProfileInTransaction,
} from '../storage/repositories';
import {
  deriveConflictItems,
  parseConflictRecord,
  type CloudConflictItem,
} from './conflictSummary';

export type { CloudConflictItem } from './conflictSummary';

/** Lists the conflicts this device can act on. See `deriveConflictItems`. */
export async function listCloudConflictItems(): Promise<CloudConflictItem[]> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault) return [];
  const rows = await db
    .select()
    .from(cloudConflicts)
    .where(
      and(
        eq(cloudConflicts.vault_id, vault.vault_id),
        isNull(cloudConflicts.acknowledged_at),
      ),
    );
  if (rows.length === 0) return [];
  const records = rows.map((row) =>
    parseConflictRecord(row.conflict_id, row.conflict_json, row.created_at),
  );

  const [profile] = await db.select().from(userProfile).limit(1);
  const photoIds = records
    .filter((record) => record.field === 'photoAssetId' && record.alternateValue)
    .map((record) => record.alternateValue!);
  const photoRows =
    photoIds.length > 0
      ? await db
          .select({ assetId: mediaAssets.asset_id, uri: mediaAssets.local_uri })
          .from(mediaAssets)
          .where(
            and(
              inArray(mediaAssets.asset_id, photoIds),
              eq(mediaAssets.kind, 'profile-photo'),
              isNotNull(mediaAssets.local_uri),
              inArray(mediaAssets.download_state, ['n/a', 'verified']),
            ),
          )
      : [];
  const localPhotoUris = new Map(
    photoRows
      .filter((row) => row.uri && photoFileExists(row.uri))
      .map((row) => [row.assetId, row.uri!]),
  );

  const recoveredIds = [
    ...new Set(records.flatMap((record) => record.recoveredEntityIds)),
  ];
  const entryRows =
    recoveredIds.length > 0
      ? await db
          .select({ id: entries.note_id })
          .from(entries)
          .where(inArray(entries.note_id, recoveredIds))
      : [];

  return deriveConflictItems(records, {
    joinedAt: vault.created_at,
    currentName: profile?.display_name ?? null,
    currentPhotoAssetId: profile?.photo_asset_id ?? null,
    localPhotoUris,
    existingEntryIds: new Set(entryRows.map((row) => row.id)),
  });
}

/** Dismisses conflict rows on this device only. */
export async function acknowledgeCloudConflicts(conflictIds: string[]): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault || conflictIds.length === 0) return;
  await db
    .update(cloudConflicts)
    .set({ acknowledged_at: Date.now() })
    .where(
      and(
        eq(cloudConflicts.vault_id, vault.vault_id),
        inArray(cloudConflicts.conflict_id, conflictIds),
        isNull(cloudConflicts.acknowledged_at),
      ),
    );
  notifyProductionCloudSyncChanged();
}

/** "Use" saves the other name as a normal profile edit, so it syncs. */
export async function resolveNameConflict(
  item: Extract<CloudConflictItem, { kind: 'name' }>,
  choice: 'use' | 'keep',
): Promise<void> {
  if (choice === 'use') await useSettingsStore.getState().setProfileName(item.other);
  await acknowledgeCloudConflicts(item.conflictIds);
}

/** "Use" points the profile at the other photo's existing asset, so it syncs. */
export async function resolvePhotoConflict(
  item: Extract<CloudConflictItem, { kind: 'photo' }>,
  choice: 'use' | 'keep',
): Promise<void> {
  if (choice === 'use') {
    await runInCloudSyncTransaction((tx) =>
      updateProfileInTransaction(tx, {
        photoAssetId: item.otherAssetId,
        photoUri: item.otherUri,
      }),
    );
    const { profileName, profileEmail } = useSettingsStore.getState();
    hydrateProfileCache({ profileName, profileEmail, profileImageUri: item.otherUri });
  }
  await acknowledgeCloudConflicts(item.conflictIds);
}
