import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  cloudSyncMigration,
  cloudSyncMigrationItems,
  customPrompts,
  db,
  entries,
  mediaAssets,
  tags,
  userProfile,
} from '~/db';
import {
  hydrateProfileCache,
  markLegacyProfileMigrationComplete,
} from '~/lib/settings/store';
import {
  NORMALIZED_MODEL_MIGRATION_ID,
  PROFILE_ENTITY_ID,
  PROFILE_ROW_ID,
  normalizeLegacyEntryInTransaction,
  updateProfileInTransaction,
} from './repositories';

const DEFAULT_BATCH_SIZE = 50;

export interface LegacyProfileSnapshot {
  profileName: string | null;
  profileEmail: string | null;
  profileImageUri: string | null;
}

export interface BackfillOptions {
  batchSize?: number;
  /** Test-only crash injection after this many committed entry batches. */
  stopAfterCommittedBatches?: number;
}

export interface BackfillResult {
  status: 'complete' | 'interrupted';
  committedBatches: number;
  normalizedEntries: number;
  repairedEntries: number;
}

async function writeCheckpoint(
  phase: string,
  cursor: string | null,
  status: 'running' | 'complete',
  completedAt: number | null = null,
): Promise<void> {
  const now = Date.now();
  await db
    .insert(cloudSyncMigration)
    .values({
      migration_id: NORMALIZED_MODEL_MIGRATION_ID,
      phase,
      cursor,
      status,
      updated_at: now,
      completed_at: completedAt,
    })
    .onConflictDoUpdate({
      target: cloudSyncMigration.migration_id,
      set: { phase, cursor, status, updated_at: now, completed_at: completedAt },
    });
}

async function loadProfileCache(): Promise<void> {
  const [profile] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.profile_id, PROFILE_ROW_ID))
    .limit(1);
  const [photo] = profile?.photo_asset_id
    ? await db
        .select({ uri: mediaAssets.local_uri })
        .from(mediaAssets)
        .where(eq(mediaAssets.asset_id, profile.photo_asset_id))
        .limit(1)
    : [];
  hydrateProfileCache({
    profileName: profile?.display_name ?? null,
    profileEmail: profile?.email ?? null,
    profileImageUri: photo?.uri ?? null,
  });
}

/**
 * Resumable application migration. Every batch commits assigned stable IDs and
 * its cursor together; the reconciliation pass is mandatory before completion.
 */
export async function runNormalizedModelBackfill(
  legacyProfile: LegacyProfileSnapshot,
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const [existingMigration] = await db
    .select()
    .from(cloudSyncMigration)
    .where(eq(cloudSyncMigration.migration_id, NORMALIZED_MODEL_MIGRATION_ID))
    .limit(1);

  if (existingMigration?.status === 'complete') {
    markLegacyProfileMigrationComplete();
    await loadProfileCache();
    return {
      status: 'complete',
      committedBatches: 0,
      normalizedEntries: 0,
      repairedEntries: 0,
    };
  }

  // The legacy Zustand profile must become durable before any long-running
  // entry work. Until completion, the store deliberately keeps its old copy.
  await db.transaction(async (tx) => {
    const now = Date.now();
    const [profileItem] = await tx
      .select()
      .from(cloudSyncMigrationItems)
      .where(
        and(
          eq(cloudSyncMigrationItems.entity_type, 'profile'),
          eq(cloudSyncMigrationItems.entity_id, PROFILE_ENTITY_ID),
        ),
      )
      .limit(1);
    if (!profileItem) {
      await updateProfileInTransaction(
        tx,
        {
          displayName: legacyProfile.profileName,
          email: legacyProfile.profileEmail,
          photoUri: legacyProfile.profileImageUri,
        },
        { origin: 'migration', now },
      );
    }
  });

  let cursor = existingMigration?.phase === 'entries' ? existingMigration.cursor : null;
  let committedBatches = 0;
  let normalizedEntries = 0;
  await writeCheckpoint('entries', cursor, 'running');

  while (true) {
    const batch = await db.transaction(async (tx) => {
      const currentBatch = await tx
        .select()
        .from(entries)
        .where(cursor ? gt(entries.note_id, cursor) : undefined)
        .orderBy(asc(entries.note_id))
        .limit(batchSize);
      if (currentBatch.length === 0) return [];
      const done = await tx
        .select({ id: cloudSyncMigrationItems.entity_id })
        .from(cloudSyncMigrationItems)
        .where(
          and(
            eq(cloudSyncMigrationItems.entity_type, 'entry'),
            inArray(
              cloudSyncMigrationItems.entity_id,
              currentBatch.map((entry) => entry.note_id),
            ),
          ),
        );
      const doneIds = new Set(done.map(({ id }) => id));
      for (const entry of currentBatch) {
        if (doneIds.has(entry.note_id)) continue;
        await normalizeLegacyEntryInTransaction(tx, entry);
        normalizedEntries++;
      }
      cursor = currentBatch.at(-1)!.note_id;
      const now = Date.now();
      await tx
        .insert(cloudSyncMigration)
        .values({
          migration_id: NORMALIZED_MODEL_MIGRATION_ID,
          phase: 'entries',
          cursor,
          status: 'running',
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: cloudSyncMigration.migration_id,
          set: { phase: 'entries', cursor, status: 'running', updated_at: now },
        });
      return currentBatch;
    });
    if (batch.length === 0) break;
    committedBatches++;
    if (committedBatches === options.stopAfterCommittedBatches) {
      return { status: 'interrupted', committedBatches, normalizedEntries, repairedEntries: 0 };
    }
  }

  await db.transaction(async (tx) => {
    const now = Date.now();
    for (const table of [tags, customPrompts] as const) {
      const rows = await tx.select().from(table);
      const entityType = table === tags ? 'tag' : 'prompt';
      const values = rows.map((row) => ({
        entity_type: entityType,
        entity_id: 'tag_id' in row ? row.tag_id : row.prompt_id,
        normalized_at: now,
      }));
      if (values.length > 0) {
        await tx.insert(cloudSyncMigrationItems).values(values).onConflictDoNothing();
      }
    }
  });

  await writeCheckpoint('reconciling', null, 'running');
  let repairedEntries = 0;
  let reconcileCursor: string | null = null;
  while (true) {
    const batch = await db.transaction(async (tx) => {
      const currentBatch = await tx
        .select()
        .from(entries)
        .where(reconcileCursor ? gt(entries.note_id, reconcileCursor) : undefined)
        .orderBy(asc(entries.note_id))
        .limit(batchSize);
      for (const entry of currentBatch) {
        // Rewriting from the authoritative legacy read model is idempotent and
        // repairs interrupted or concurrent normalization without touching it.
        await normalizeLegacyEntryInTransaction(tx, entry);
        repairedEntries++;
      }
      return currentBatch;
    });
    if (batch.length === 0) break;
    reconcileCursor = batch.at(-1)!.note_id;
  }

  const now = Date.now();
  await writeCheckpoint('complete', null, 'complete', now);
  markLegacyProfileMigrationComplete();
  await loadProfileCache();
  return { status: 'complete', committedBatches, normalizedEntries, repairedEntries };
}

export async function isNormalizedModelReady(): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cloudSyncMigration)
    .where(
      and(
        eq(cloudSyncMigration.migration_id, NORMALIZED_MODEL_MIGRATION_ID),
        eq(cloudSyncMigration.status, 'complete'),
      ),
    );
  return (row?.count ?? 0) === 1;
}
