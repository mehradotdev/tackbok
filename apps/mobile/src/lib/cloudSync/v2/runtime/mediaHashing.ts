import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';

import {
  db,
  mediaAssets,
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
 * Protocol v2 owns this production primitive. The retained v1 bridge
 * temporarily re-exports it, so deleting that bridge during V7-5(c2) cannot
 * accidentally remove media hashing from the v2 runtime.
 */
export async function hashPendingProductionMedia(limit = 2): Promise<{
  processed: number;
  failed: number;
}> {
  let processed = 0;
  let failed = 0;
  const live = await db.select().from(mediaAssets).where(and(
    isNotNull(mediaAssets.local_uri),
    or(isNull(mediaAssets.blob_hash), isNull(mediaAssets.byte_size)),
  )).limit(limit);
  let remaining = limit;
  for (const row of live) {
    if (!row.local_uri) continue;
    try {
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
  if (remaining <= 0) return { processed, failed };
  const retained = await db.select().from(syncRetainedMedia).where(and(
    isNull(syncRetainedMedia.blob_hash),
    isNotNull(syncRetainedMedia.original_uri),
  )).limit(remaining);
  for (const row of retained) {
    try {
      const hash = await hashLocalMediaFile(row.staged_uri ?? row.original_uri);
      await db.transaction(async (tx) => {
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
  return { processed, failed };
}
