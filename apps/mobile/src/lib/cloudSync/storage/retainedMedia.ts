import { eq, inArray } from 'drizzle-orm';
import {
  cloudVault,
  db,
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

/**
 * Deletes retained bytes immediately while cloud sync has never been configured.
 * Once a vault exists, the upload/version obligations own lifecycle decisions.
 */
export async function reapRetainedMediaWithoutVault(
  options: RetainedMediaReaperOptions = {},
): Promise<{ deleted: number; missing: number; failed: number; deferred: number }> {
  const [vault] = await db.select({ id: cloudVault.vault_id }).from(cloudVault).limit(1);
  const candidates = await db
    .select()
    .from(syncRetainedMedia)
    .where(
      inArray(syncRetainedMedia.state, [
        'recorded',
        'staged',
        'uploaded',
        'failed',
      ]),
    );
  if (vault) {
    return { deleted: 0, missing: 0, failed: 0, deferred: candidates.length };
  }

  const now = options.now ?? Date.now();
  let deleted = 0;
  let missing = 0;
  let failed = 0;
  const deleteFile = options.deleteFile ?? deleteRetainedFile;
  for (const row of candidates) {
    try {
      const result = await deleteFile(row);
      if (result === 'deleted') deleted++;
      else missing++;
      await db.transaction(async (tx) => {
        await tx
          .update(syncMediaObligations)
          .set({ completed_at: now })
          .where(eq(syncMediaObligations.ledger_id, row.ledger_id));
        await tx
          .update(syncRetainedMedia)
          .set({
            state: result === 'deleted' ? 'safe_to_delete' : 'missing',
            last_error_code: null,
            updated_at: now,
          })
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
  return { deleted, missing, failed, deferred: 0 };
}
