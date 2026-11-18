import {
  cloudDriveObjects,
  cloudDriveState,
  cloudDriveUploadSessions,
  cloudSyncState,
  cloudVault,
  mediaAssets,
  syncMediaObligations,
  syncProviderState,
  syncRetainedMedia,
} from '~/db';
import { deleteAllDataInTransaction } from '~/db/queries';
import { clearMediaHashes } from '../snapshot/storage';
import type { CloudSyncTransaction } from './repositories';

/**
 * Deletes the journal and this device's cloud replica in the caller's
 * transaction. The caller deletes every photo and voice file afterwards, so
 * no `media_assets` row may survive: a row whose file is gone stops the next
 * backup. Deleting the profile photo only removes its current row, and rows
 * kept for photo conflicts would otherwise stay behind (#178).
 */
export async function wipeLocalJournalInTransaction(
  tx: CloudSyncTransaction,
): Promise<void> {
  await deleteAllDataInTransaction(tx);
  await tx.delete(mediaAssets);
  // The routed hard delete creates queue and retained-media rows. Clearing
  // those rows in this same transaction closes the crash window where a
  // later reconnect could otherwise publish the device wipe to Drive.
  await tx.delete(cloudDriveUploadSessions);
  await tx.delete(cloudDriveObjects);
  await tx.delete(cloudDriveState);
  await tx.delete(cloudSyncState);
  await tx.delete(syncMediaObligations);
  await tx.delete(syncRetainedMedia);
  await tx.delete(syncProviderState);
  await tx.delete(cloudVault);
  await clearMediaHashes(tx);
}
