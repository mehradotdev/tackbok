/**
 * Install-bound device ID (#185, P13). The device ID lives in the database,
 * which an OS backup restores and a device-to-device transfer copies. A copy
 * that keeps syncing beside the original would publish as the same device.
 *
 * So the database row (`sync_device.install_id`) names an **install marker**
 * kept where backups, restores and transfers don't carry it: a SecureStore
 * item with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
 * - iOS: a `ThisDeviceOnly` keychain item stays out of iCloud backups, is not
 *   moved by Quick Start, and comes back from an encrypted computer backup
 *   only onto the same phone. It survives deleting the app, while the
 *   database does not.
 * - Android: the expo-secure-store config plugin excludes SecureStore from
 *   Auto Backup and device transfer (`configureAndroidBackup`), and its
 *   Keystore key could not decrypt it elsewhere anyway. Uninstalling deletes
 *   it. (The same backup rules include shared preferences only, so the
 *   database isn't backed up on Android today either; the marker keeps this
 *   right if that ever changes.)
 *
 * The decision (`decideInstallBinding`), marker against binding:
 * - **Equal:** this database belongs to this install. Nothing to do.
 * - **No binding:** a database from before this check existed (the upgrade),
 *   or a new one. It adopts the marker, or a new one, and keeps its ID. The
 *   signal is the binding itself: from this version on every database gets
 *   one at its first check, so a copied database always carries one.
 *   An iPhone reinstall lands here too (the old keychain marker, a new
 *   database), and keeps the new database's ID.
 * - **A binding but no marker, or another one:** the database came from
 *   another install (a restore, a transfer, a backup restored onto an install
 *   that already had its own). It takes a new device ID before any pass, the
 *   way "Continue as a new device" does (`continueAsNewDevice`, #216): every
 *   write under the old ID moves, HLCs kept, and the old head is left to the
 *   install that still has it. An Android reinstall that got its database
 *   back would land here: a new ID it didn't need. That costs one full
 *   capture and rewrite at the next launch, and the old ID stays on rosters
 *   (holding back compaction) until it expires. It is not retired early
 *   (`retireDevice`): the install it came from may still use it.
 *
 * shortcut: a copy of a database backed up before this upgrade first ran has
 * no binding, so it reads as the upgrade and keeps the ID; the
 * "another install uses this ID" pause still catches it if both sync.
 * Restoring an older encrypted backup onto the same iPhone brings the marker
 * back with the database, so the ID stays although local state went back;
 * the same pause catches that when the phone finds its own newer head on
 * Drive. Revisit if either shows up in practice.
 *
 * Metadata never bound to a vault keeps its ID: nothing under it leaves the
 * install, and binding to a vault rebuilds it under a new ID
 * (`rebuildSyncMetadataInTransaction`).
 */
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { cloudSyncState, cloudVault, runExclusiveDbTransaction, syncDevice } from '~/db';

import { continueAsNewDevice } from '../snapshot/sync/newDevice';
import type { ApplyMediaFiles } from './v2State';

/** Where this install's marker lives; reads throw while it can't be read. */
export interface InstallMarkerStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export type InstallBindingDecision =
  | { kind: 'bound' }
  /** Keep the device ID; bind the database to `installId`. */
  | { kind: 'bind'; installId: string; writeMarker: boolean }
  /** The database came from another install: a new device ID. */
  | { kind: 'new-device'; installId: string; writeMarker: boolean };

export function decideInstallBinding(
  marker: string | null,
  binding: string | null,
  newInstallId: () => string,
): InstallBindingDecision {
  if (binding !== null && binding === marker) return { kind: 'bound' };
  const installId = marker ?? newInstallId();
  const writeMarker = marker === null;
  return binding === null
    ? { kind: 'bind', installId, writeMarker }
    : { kind: 'new-device', installId, writeMarker };
}

export type InstallBindingResult =
  | InstallBindingDecision['kind']
  | 'unbound-copy'
  /** No row to bind yet; check again later. */
  | 'no-device';

/**
 * Checks this database against this install's marker and acts on the
 * decision. The marker is written before the database, so an interruption
 * between the two repeats the same decision at the next check.
 */
export async function ensureInstallBinding(options: {
  marker: InstallMarkerStore;
  files: ApplyMediaFiles;
  now: number;
  newInstallId?: () => string;
  newDeviceId?: () => string;
}): Promise<InstallBindingResult> {
  const marker = await options.marker.read();
  const [device] = await runExclusiveDbTransaction((tx) =>
    tx
      .select({ installId: syncDevice.install_id, vaultId: syncDevice.vault_id })
      .from(syncDevice)
      .where(eq(syncDevice.id, 'self')),
  );
  // The 0008 migration creates the row; a missing one is created, unbound,
  // at the first write (`tickInTransaction`) and bound at the next check.
  if (!device) return 'no-device';
  const decision = decideInstallBinding(
    marker,
    device.installId,
    options.newInstallId ?? randomUUID,
  );
  if (decision.kind === 'bound') return 'bound';
  if (decision.writeMarker) await options.marker.write(decision.installId);
  if (decision.kind === 'bind' || device.vaultId === null) {
    await runExclusiveDbTransaction((tx) =>
      tx
        .update(syncDevice)
        .set({ install_id: decision.installId })
        .where(eq(syncDevice.id, 'self')),
    );
    return decision.kind === 'bind' ? 'bind' : 'unbound-copy';
  }
  const vaultId = device.vaultId;
  const { installId } = decision;
  await continueAsNewDevice({
    vaultId,
    reason: 'another-install',
    files: options.files,
    now: options.now,
    newDeviceId: options.newDeviceId,
    // With the move, so an interruption can't leave any of it behind.
    alsoInTransaction: async (tx) => {
      await tx
        .update(syncDevice)
        .set({ install_id: installId })
        .where(eq(syncDevice.id, 'self'));
      // A copy made while the original was paused for another install using
      // its ID brings that pause along; the new ID has answered it.
      await tx
        .update(cloudSyncState)
        .set({ pause_reason: null, pause_context_json: null, updated_at: options.now })
        .where(
          and(
            eq(cloudSyncState.vault_id, vaultId),
            eq(cloudSyncState.pause_reason, 'ambiguous-device-head'),
          ),
        );
      // Publish under the new ID at the next pass.
      await tx
        .update(cloudVault)
        .set({ status: 'dirty', updated_at: options.now })
        .where(and(eq(cloudVault.vault_id, vaultId), eq(cloudVault.status, 'idle')));
    },
  });
  return 'new-device';
}
