import { eq } from 'drizzle-orm';
import { cloudVault, db, type DbTransaction } from '~/db';
import { useSettingsStore } from '~/lib/settings';

/**
 * True from choosing a backup to restore until Home sees the restore finish.
 * Pass the transaction that writes local content: the restore commits its
 * connection in an exclusive transaction too, so the answer cannot go stale
 * before those writes commit.
 */
export async function isCloudRestoreInProgress(
  executor: typeof db | DbTransaction = db,
): Promise<boolean> {
  if (useSettingsStore.getState().cloudRestore) return true;
  // The connection commit writes `restoring` before the marker is recorded.
  const [restoring] = await executor
    .select({ vaultId: cloudVault.vault_id })
    .from(cloudVault)
    .where(eq(cloudVault.status, 'restoring'))
    .limit(1);
  return restoring !== undefined;
}
