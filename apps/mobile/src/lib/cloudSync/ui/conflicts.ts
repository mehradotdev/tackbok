import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  cloudConflicts,
  cloudVault,
  db,
  entries,
  mediaAssets,
  runExclusiveDbTransaction,
  userProfile,
} from '~/db';
import { photoFileExists } from '~/lib/photoUtils';
import { hydrateProfileCache, useSettingsStore } from '~/lib/settings';
import { notifyProductionCloudSyncChanged } from '../runtime/production';
import { writeBatches } from '../snapshot/storage/writeBatches';
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

/** Characters of an entry's text loaded to help the user recognize it. */
const PREVIEW_LENGTH = 200;

/**
 * Lists the conflicts this device can act on. See `deriveConflictItems`.
 * Lookups avoid ID lists, which can exceed SQLite's variable limit on a large
 * journal. Read errors are thrown to the caller.
 */
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
    parseConflictRecord(
      row.conflict_id,
      row.conflict_json,
      row.created_at,
      row.archived_at !== null,
    ),
  );

  const [profile] = await db.select().from(userProfile).limit(1);
  // Profile photos are few: the current one plus kept alternates.
  const photoRows = records.some((record) => record.field === 'photoAssetId')
    ? await db
        .select({
          assetId: mediaAssets.asset_id,
          uri: mediaAssets.local_uri,
          blobHash: mediaAssets.blob_hash,
          downloadState: mediaAssets.download_state,
        })
        .from(mediaAssets)
        .where(eq(mediaAssets.kind, 'profile-photo'))
    : [];
  const localPhotos = new Map<string, { uri: string; blobHash: string | null }>();
  for (const row of photoRows) {
    if (row.downloadState !== 'n/a' && row.downloadState !== 'verified') continue;
    if (!row.uri || !photoFileExists(row.uri)) continue;
    localPhotos.set(row.assetId, { uri: row.uri, blobHash: row.blobHash });
  }
  const currentPhotoBlobHash =
    photoRows.find((row) => row.assetId === profile?.photo_asset_id)?.blobHash ?? null;

  // Recovered entries carry the ID of the entry they were copied from.
  const entryRows = records.some((record) => record.recoveredEntityIds.length > 0)
    ? await db
        .select({ id: entries.note_id })
        .from(entries)
        .where(isNotNull(entries.conflict_origin_id))
    : [];

  // Entries kept after a delete/edit race, matched in SQL rather than by an ID list.
  const returnedRows = records.some(
    (record) => record.entityType === 'entry' && record.field === 'deleteEdit',
  )
    ? await db
        .select({
          entryId: entries.note_id,
          createdAt: entries.created_at,
          title: entries.text_title,
          preview: sql<
            string | null
          >`substr(${entries.text_content}, 1, ${PREVIEW_LENGTH})`,
        })
        .from(entries)
        .where(
          inArray(
            entries.note_id,
            db
              .select({
                id: sql<string>`json_extract(${cloudConflicts.conflict_json}, '$.entityId')`,
              })
              .from(cloudConflicts)
              .where(
                and(
                  eq(cloudConflicts.vault_id, vault.vault_id),
                  isNull(cloudConflicts.acknowledged_at),
                  sql`json_extract(${cloudConflicts.conflict_json}, '$.entityType') = 'entry'`,
                  sql`json_extract(${cloudConflicts.conflict_json}, '$.field') = 'deleteEdit'`,
                ),
              ),
          ),
        )
    : [];

  return deriveConflictItems(records, {
    joinedAt: vault.created_at,
    currentName: profile?.display_name ?? null,
    currentPhotoAssetId: profile?.photo_asset_id ?? null,
    currentPhotoBlobHash,
    localPhotos,
    existingEntryIds: new Set(entryRows.map((row) => row.id)),
    returnedEntries: new Map(returnedRows.map((row) => [row.entryId, row])),
  });
}

/** Dismisses conflict rows on this device only. */
export async function acknowledgeCloudConflicts(conflictIds: string[]): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault || conflictIds.length === 0) return;
  const acknowledgedAt = Date.now();
  await runExclusiveDbTransaction((tx) =>
    writeBatches(conflictIds, (batch) =>
      tx
        .update(cloudConflicts)
        .set({ acknowledged_at: acknowledgedAt })
        .where(
          and(
            eq(cloudConflicts.vault_id, vault.vault_id),
            inArray(cloudConflicts.conflict_id, batch),
            isNull(cloudConflicts.acknowledged_at),
          ),
        ),
    ),
  );
  notifyProductionCloudSyncChanged();
}

/**
 * Dismisses the entry conflicts about any of `entryIds`, after the user chose
 * which version of those entries to keep.
 */
export async function acknowledgeEntryConflicts(entryIds: string[]): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault || entryIds.length === 0) return;
  const ids = new Set(entryIds);
  const rows = await db
    .select()
    .from(cloudConflicts)
    .where(
      and(
        eq(cloudConflicts.vault_id, vault.vault_id),
        isNull(cloudConflicts.acknowledged_at),
      ),
    );
  const conflictIds = rows
    .map((row) => parseConflictRecord(row.conflict_id, row.conflict_json, row.created_at))
    .filter(
      (record) =>
        record.entityType === 'entry' &&
        (ids.has(record.entityId) || record.recoveredEntityIds.some((id) => ids.has(id))),
    )
    .map((record) => record.conflictId);
  await acknowledgeCloudConflicts(conflictIds);
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
