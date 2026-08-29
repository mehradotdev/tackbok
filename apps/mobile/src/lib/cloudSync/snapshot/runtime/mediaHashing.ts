import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { File, Paths } from 'expo-file-system';

import {
  db,
  mediaAssets,
  runExclusiveDbTransaction,
  syncMediaObligations,
  syncRetainedMedia,
} from '~/db';
import {
  hashLocalMediaFile,
  inspectLocalMediaFile,
} from '../../media/streamingHash';

/**
 * Hashes a bounded amount of pending production media per pass.
 *
 * The snapshot runtime owns this primitive so media hashing has no dependency
 * on superseded sync implementations.
 */
export async function hashPendingProductionMedia(limit = 2): Promise<{
  processed: number;
  failed: number;
  missing: number;
}> {
  let processed = 0;
  let failed = 0;
  let missing = 0;
  const live = await db.select().from(mediaAssets).where(and(
    isNotNull(mediaAssets.local_uri),
    or(isNull(mediaAssets.blob_hash), isNull(mediaAssets.byte_size)),
    ne(mediaAssets.download_state, 'missing'),
  )).limit(limit);
  let remaining = limit;
  for (const row of live) {
    if (!row.local_uri) continue;
    try {
      const file = row.local_uri.startsWith('file:') || row.local_uri.startsWith('/')
        ? new File(row.local_uri)
        : new File(Paths.document, row.local_uri);
      if (!file.exists) {
        await db.update(mediaAssets).set({
          download_state: 'missing',
          updated_at: Date.now(),
        }).where(eq(mediaAssets.asset_id, row.asset_id));
        missing += 1;
        remaining--;
        continue;
      }
      const inspected = await inspectLocalMediaFile(row.local_uri);
      await db.update(mediaAssets).set({
        blob_hash: inspected.sha256,
        byte_size: inspected.byteSize,
        updated_at: Date.now(),
      })
        .where(eq(mediaAssets.asset_id, row.asset_id));
      processed++;
    } catch {
      // The normalized row and original file remain; a later pass retries.
      failed++;
    }
    remaining--;
  }
  if (remaining <= 0) return { processed, failed, missing };
  const retained = await db.select().from(syncRetainedMedia).where(and(
    isNull(syncRetainedMedia.blob_hash),
    isNotNull(syncRetainedMedia.original_uri),
  )).limit(remaining);
  for (const row of retained) {
    try {
      const hash = await hashLocalMediaFile(row.staged_uri ?? row.original_uri);
      await runExclusiveDbTransaction(async (tx) => {
        await tx.update(syncRetainedMedia).set({ blob_hash: hash, updated_at: Date.now() })
          .where(eq(syncRetainedMedia.ledger_id, row.ledger_id));
        await tx.update(syncMediaObligations).set({ blob_hash: hash })
          .where(eq(syncMediaObligations.ledger_id, row.ledger_id));
      });
      processed++;
    } catch {
      // Retained bytes and obligation stay in place for the next bounded pass.
      failed++;
    }
  }
  return { processed, failed, missing };
}
