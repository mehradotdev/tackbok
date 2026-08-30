import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  cloudPendingPublication,
  cloudSyncState,
  cloudVault,
  db,
  mediaAssets,
  runExclusiveDbTransaction,
  syncMediaObligations,
  syncRetainedMedia,
} from '~/db';
import { PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';

type RetainedRow = typeof syncRetainedMedia.$inferSelect;
type DeleteResult = 'deleted' | 'missing';

export interface RetainedMediaReaperOptions {
  deleteFile?: (row: RetainedRow) => Promise<DeleteResult>;
  now?: number;
}

function isSafeRelativeMediaUri(uri: string): boolean {
  return (
    !uri.startsWith('/') &&
    !uri.includes('..') &&
    (uri.startsWith(`${PHOTOS_DIR_NAME}/`) ||
      uri.startsWith(`${VOICE_MEMOS_DIR_NAME}/`))
  );
}

async function deleteRetainedFile(row: RetainedRow): Promise<DeleteResult> {
  if (!isSafeRelativeMediaUri(row.original_uri)) {
    throw new Error('invalid-media-uri');
  }
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.document, row.original_uri);
  if (!file.exists) return 'missing';
  file.delete();
  return 'deleted';
}

/** Deletes retained bytes after their removal is settled, or when sync is detached. */
export async function reapRetainedMedia(
  options: RetainedMediaReaperOptions = {},
): Promise<{ deleted: number; missing: number; failed: number; deferred: number }> {
  const [vault] = await db.select({
    id: cloudVault.vault_id,
    deviceId: cloudVault.device_id,
    status: cloudVault.status,
  }).from(cloudVault).limit(1);
  const candidates = await db
    .select()
    .from(syncRetainedMedia)
    .where(
      inArray(syncRetainedMedia.state, [
        'recorded',
        'staged',
        'uploaded',
        'safe_to_delete',
        'missing',
        'failed',
      ]),
    );
  if (candidates.length === 0) {
    return { deleted: 0, missing: 0, failed: 0, deferred: 0 };
  }

  const now = options.now ?? Date.now();
  let removalsSettled = !vault || vault.status === 'disabled' || vault.status === 'revoked';
  if (vault && !removalsSettled) {
    const [state] = await db.select({
      journal: cloudSyncState.journal_generation,
      settled: cloudSyncState.settled_generation,
    }).from(cloudSyncState).where(and(
      eq(cloudSyncState.vault_id, vault.id),
      eq(cloudSyncState.device_id, vault.deviceId),
    )).limit(1);
    const pending = await db.select({ id: cloudPendingPublication.snapshot_id })
      .from(cloudPendingPublication).where(and(
        eq(cloudPendingPublication.vault_id, vault.id),
        eq(cloudPendingPublication.device_id, vault.deviceId),
      )).limit(1);
    removalsSettled = Boolean(state && state.journal <= state.settled && pending.length === 0);
  }

  if (removalsSettled) {
    await db.update(syncMediaObligations).set({ completed_at: now })
      .where(isNull(syncMediaObligations.completed_at));
  }
  const incomplete = new Set((await db.select({ id: syncMediaObligations.ledger_id })
    .from(syncMediaObligations).where(isNull(syncMediaObligations.completed_at)))
    .map(({ id }) => id));
  const liveUris = new Set((await db.select({ uri: mediaAssets.local_uri }).from(mediaAssets))
    .map(({ uri }) => uri).filter((uri): uri is string => Boolean(uri)));

  let deleted = 0;
  let missing = 0;
  let failed = 0;
  let deferred = 0;
  const deleteFile = options.deleteFile ?? deleteRetainedFile;
  for (const row of candidates) {
    if (incomplete.has(row.ledger_id) || liveUris.has(row.original_uri)) {
      deferred += 1;
      continue;
    }
    try {
      const result = await deleteFile(row);
      if (result === 'deleted') deleted++;
      else missing++;
      await runExclusiveDbTransaction(async (tx) => {
        await tx.delete(syncMediaObligations)
          .where(eq(syncMediaObligations.ledger_id, row.ledger_id));
        await tx.delete(syncRetainedMedia)
          .where(eq(syncRetainedMedia.ledger_id, row.ledger_id));
      });
    } catch (error) {
      failed++;
      await db
        .update(syncRetainedMedia)
        .set({
          state: 'failed',
          attempt_count: row.attempt_count + 1,
          last_error_code: error instanceof Error ? error.message.slice(0, 80) : 'delete-failed',
          updated_at: now,
        })
        .where(eq(syncRetainedMedia.ledger_id, row.ledger_id));
    }
  }
  return { deleted, missing, failed, deferred };
}

export const reapRetainedMediaWithoutVault = reapRetainedMedia;
