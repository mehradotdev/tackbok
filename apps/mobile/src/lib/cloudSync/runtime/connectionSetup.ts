import { and, eq, inArray } from 'drizzle-orm';
import { cloudVault, db } from '~/db';
import { createGoogleAuthorization } from '../auth';
import {
  captureGoogleCredentials,
  clearGoogleSetupGuard,
  readGoogleSetupGuard,
  restoreGoogleCredentials,
  writeGoogleSetupGuard,
  type GoogleSetupGuard,
} from '../auth/secureTokenStore';
import { cloudConnectionLifecycle } from './connectionLifecycle';

type VaultStatus = (typeof cloudVault.$inferSelect)['status'];
const ACTIVE_STATUSES: VaultStatus[] = ['dirty', 'idle', 'restoring'];

/** What a cancelled setup puts back: the current backup and its credentials. */
export interface ConnectionRollback extends GoogleSetupGuard {
  vaults: { vaultId: string; status: VaultStatus }[];
}

let setupOwnedByThisProcess = false;

/**
 * Starts a connection setup. Call it under the connection barrier, before
 * authorization replaces the current credentials. The guard is durable first,
 * then the current backup is disabled, so no pass can open it with another
 * account's credentials until the setup commits or is put back.
 */
export async function beginConnectionSetup(): Promise<ConnectionRollback> {
  // A setup left by a process that died is put back before a new one starts.
  await reconcileAbandonedSetup();
  const rollback: ConnectionRollback = {
    credentials: await captureGoogleCredentials(),
    vaults: await db
      .select({ vaultId: cloudVault.vault_id, status: cloudVault.status })
      .from(cloudVault)
      .where(inArray(cloudVault.status, ACTIVE_STATUSES)),
  };
  setupOwnedByThisProcess = true;
  await writeGoogleSetupGuard(rollback);
  await db
    .update(cloudVault)
    .set({ status: 'disabled', updated_at: Date.now() })
    .where(inArray(cloudVault.status, ACTIVE_STATUSES));
  return rollback;
}

/**
 * Ends the setup without putting anything back: it committed, or Disconnect,
 * reset or deletion replaced it. Destructive changes call this before their
 * own writes, so a crash midway cannot revive the old connection.
 */
export async function endConnectionSetup(): Promise<void> {
  await clearGoogleSetupGuard();
  setupOwnedByThisProcess = false;
}

/** Puts back the captured credentials, then the backups setup disabled. */
export async function rollBackConnectionSetup(
  rollback: ConnectionRollback,
  signOut: () => Promise<void>,
): Promise<void> {
  await restoreGoogleCredentials(rollback.credentials, signOut);
  for (const vault of rollback.vaults) {
    await db
      .update(cloudVault)
      .set({ status: vault.status, updated_at: Date.now() })
      .where(
        and(eq(cloudVault.vault_id, vault.vaultId), eq(cloudVault.status, 'disabled')),
      );
  }
  await endConnectionSetup();
}

async function reconcileAbandonedSetup(): Promise<boolean> {
  if (setupOwnedByThisProcess) return false;
  const guard = await readGoogleSetupGuard();
  if (!guard) return false;
  // Setup disables every active backup before authorizing, and only a commit
  // makes one active again. An active backup means it committed (or the
  // process died before anything changed), so its credentials stay.
  const [active] = await db
    .select({ vaultId: cloudVault.vault_id })
    .from(cloudVault)
    .where(inArray(cloudVault.status, ACTIVE_STATUSES))
    .limit(1);
  if (active) {
    await endConnectionSetup();
    return false;
  }
  await rollBackConnectionSetup(guard as ConnectionRollback, () =>
    createGoogleAuthorization().signOut(),
  );
  return true;
}

/**
 * Puts back a setup that a dead process left unfinished. Engine creation calls
 * this before opening any backup; it throws while the guard is unreadable, so
 * sync stays blocked rather than using credentials it cannot vouch for.
 */
export async function reconcileAbandonedConnectionSetup(): Promise<boolean> {
  if (setupOwnedByThisProcess || !(await readGoogleSetupGuard())) return false;
  return cloudConnectionLifecycle.change(reconcileAbandonedSetup);
}
