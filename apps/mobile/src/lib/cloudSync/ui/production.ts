import { and, count, eq, isNull } from 'drizzle-orm';
import {
  cloudVault,
  customPrompts,
  db,
  entries,
  sqlite,
  syncChangeQueue,
  syncConflicts,
  syncProviderState,
  tags,
} from '~/db';
import { track } from '~/lib/analytics';
import { deleteAllData } from '~/db/queries';
import { generateUUID } from '~/lib/utils';
import { createGoogleAuthorization } from '../auth';
import { canonicalBytes } from '../codec';
import { SQLiteEngineCheckpointStore, SQLiteSyncEngine } from '../engine';
import { GoogleDriveProvider } from '../providers';
import type { RemoteVaultSummary } from '../providers/types';
import {
  getProductionCloudSyncActivity,
  notifyProductionCloudSyncChanged,
  restartProductionSyncRuntime,
  runProductionManualSync,
  stopProductionSyncRuntime,
} from '../runtime/production';
import { setCloudSyncBackgroundTaskEnabled } from '../runtime/backgroundTask';

export type CloudSetupOrigin = 'settings' | 'onboarding';

export interface CloudSyncSnapshot {
  configured: boolean;
  provider: 'google-drive' | null;
  status:
    | 'off'
    | 'paused'
    | 'syncing'
    | 'queued'
    | 'synced'
    | 'warning'
    | 'restoring';
  accountLabel: string | null;
  queuedCount: number;
  conflictCount: number;
  lastSuccessAt: number | null;
  lastVerifiedAt: number | null;
  revocationKind: 'journal-deleted' | 'backup-deleted' | null;
}

export interface PreparedGoogleConnection {
  accountLabel: string;
  availableVaults: RemoteVaultSummary[];
  localHasData: boolean;
}

export interface CloudConflictSummary {
  conflictId: string;
  entityType: 'entry' | 'tag' | 'prompt' | 'profile';
  recoveredCount: number;
  alternateCount: number;
  createdAt: number;
}

let accountLabelInMemory: string | null = null;
let accountLabelAttemptedForVault: string | null = null;
let pendingConnection: {
  provider: GoogleDriveProvider;
  prepared: PreparedGoogleConnection;
} | null = null;

async function localHasData(): Promise<boolean> {
  const [entry, tag, prompt] = await Promise.all([
    db.select({ id: entries.note_id }).from(entries).limit(1),
    db.select({ id: tags.tag_id }).from(tags).limit(1),
    db.select({ id: customPrompts.prompt_id }).from(customPrompts).limit(1),
  ]);
  return entry.length > 0 || tag.length > 0 || prompt.length > 0;
}

export async function loadCloudSyncSnapshot(): Promise<CloudSyncSnapshot> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  const [[queued], [conflicts], [providerState]] = await Promise.all([
    db.select({ value: count() }).from(syncChangeQueue),
    db.select({ value: count() }).from(syncConflicts).where(isNull(syncConflicts.acknowledged_at)),
    db.select().from(syncProviderState)
      .where(eq(syncProviderState.provider_kind, 'google-drive')).limit(1),
  ]);
  const queuedCount = queued?.value ?? 0;
  const conflictCount = conflicts?.value ?? 0;
  const configured = Boolean(
    vault?.remote_root_id && !['disabled', 'revoked'].includes(vault.status),
  );
  if (configured && vault && accountLabelAttemptedForVault !== vault.vault_id) {
    accountLabelAttemptedForVault = vault.vault_id;
    accountLabelInMemory = await createGoogleAuthorization().getAccountLabel()
      .catch(() => null);
  }
  let status: CloudSyncSnapshot['status'] = 'off';
  if (vault?.status === 'revoked') status = 'warning';
  else if (vault?.status === 'paused') status = 'paused';
  else if (getProductionCloudSyncActivity() === 'syncing') status = 'syncing';
  else if (vault?.status === 'restoring') status = 'restoring';
  else if (configured && queuedCount > 0) status = 'queued';
  else if (configured) status = 'synced';

  return {
    configured,
    provider: vault?.provider_kind === 'google-drive' ? 'google-drive' : null,
    status,
    accountLabel: accountLabelInMemory,
    queuedCount,
    conflictCount,
    lastSuccessAt: providerState?.last_success_at ?? null,
    lastVerifiedAt: providerState?.last_verify_at ?? null,
    revocationKind: vault?.revocation_kind ?? null,
  };
}

export async function prepareGoogleDriveConnection(): Promise<PreparedGoogleConnection> {
  await cancelPreparedGoogleDriveConnection();
  const provider = new GoogleDriveProvider({ auth: createGoogleAuthorization() });
  try {
    const connection = await provider.connect();
    const prepared = {
      accountLabel: connection.accountLabel ?? 'Google Drive',
      availableVaults: (await provider.listVaults()).filter((vault) => !vault.revoked),
      localHasData: await localHasData(),
    };
    pendingConnection = { provider, prepared };
    accountLabelInMemory = prepared.accountLabel;
    notifyProductionCloudSyncChanged();
    return prepared;
  } catch (error) {
    await provider.disconnect().catch(() => undefined);
    throw error;
  }
}

export async function cancelPreparedGoogleDriveConnection(): Promise<void> {
  const pending = pendingConnection;
  pendingConnection = null;
  if (pending) await pending.provider.disconnect().catch(() => undefined);
}

export async function completeGoogleDriveConnection(options: {
  origin: CloudSetupOrigin;
  vaultId?: string;
  createNew?: boolean;
}): Promise<void> {
  const pending = pendingConnection;
  if (!pending) throw new Error('Google Drive connection is no longer active');

  let selected = options.vaultId
    ? pending.prepared.availableVaults.find((vault) => vault.vaultId === options.vaultId)
    : undefined;
  if (!selected && !options.createNew) {
    if (options.origin === 'onboarding') {
      throw new Error('No Tackbok backup found in this Google account');
    }
    if (pending.prepared.availableVaults.length === 1) {
      selected = pending.prepared.availableVaults[0];
    }
  }

  if (!selected && !options.createNew) {
    throw new Error('Choose a cloud backup or create a new one');
  }

  if (!selected) {
    const vaultId = generateUUID();
    const marker = await pending.provider.createVaultMarker(
      vaultId,
      canonicalBytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId }),
    );
    selected = { ...marker.vault, revoked: false };
  }

  stopProductionSyncRuntime();
  const [prior] = await db.select({ deviceId: cloudVault.device_id }).from(cloudVault).limit(1);
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.delete(cloudVault);
    await tx.insert(cloudVault).values({
      vault_id: selected!.vaultId,
      provider_kind: 'google-drive',
      remote_root_id: selected!.remoteRootId,
      account_label: null,
      device_id: prior?.deviceId ?? generateUUID(),
      status: options.createNew ? 'dirty' : 'restoring',
      created_at: now,
      updated_at: now,
      last_connected_at: now,
    });
    await tx.insert(syncProviderState).values({
      provider_kind: 'google-drive',
      updated_at: now,
    }).onConflictDoUpdate({
      target: syncProviderState.provider_kind,
      set: { error_code: null, pause_code: null, updated_at: now },
    });
  });
  pendingConnection = null;
  accountLabelAttemptedForVault = selected.vaultId;
  await setCloudSyncBackgroundTaskEnabled(true);
  await restartProductionSyncRuntime();
  notifyProductionCloudSyncChanged();
}

export async function reconnectGoogleDrive(): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault?.remote_root_id) throw new Error('No cloud backup is configured');
  const provider = new GoogleDriveProvider({ auth: createGoogleAuthorization() });
  const connection = await provider.connect();
  const available = await provider.listVaults();
  if (!available.some((remote) => remote.vaultId === vault.vault_id && !remote.revoked)) {
    await provider.disconnect();
    throw new Error('The configured Tackbok backup was not found in this Google account');
  }
  accountLabelInMemory = connection.accountLabel ?? 'Google Drive';
  accountLabelAttemptedForVault = vault.vault_id;
  const [queued] = await db.select({ value: count() }).from(syncChangeQueue);
  await db.update(cloudVault).set({
    status: (queued?.value ?? 0) > 0 ? 'dirty' : 'idle',
    last_connected_at: Date.now(),
    updated_at: Date.now(),
  }).where(eq(cloudVault.vault_id, vault.vault_id));
  await setCloudSyncBackgroundTaskEnabled(true);
  await restartProductionSyncRuntime();
}

export async function disconnectGoogleDrive(): Promise<void> {
  stopProductionSyncRuntime();
  // Per-device Disconnect is intentionally local. This abstraction clears
  // SecureStore and native session state without calling Google's revoke API.
  await createGoogleAuthorization().signOut();
  await db.update(cloudVault).set({ status: 'disabled', updated_at: Date.now() });
  accountLabelInMemory = null;
  accountLabelAttemptedForVault = null;
  await setCloudSyncBackgroundTaskEnabled(false);
  notifyProductionCloudSyncChanged();
}

export async function setCloudSyncPaused(paused: boolean): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault || vault.status === 'revoked' || vault.status === 'disabled') return;
  if (paused) {
    stopProductionSyncRuntime();
    await db.update(cloudVault).set({ status: 'paused', updated_at: Date.now() })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    await setCloudSyncBackgroundTaskEnabled(false);
  } else {
    const [queued] = await db.select({ value: count() }).from(syncChangeQueue);
    await db.update(cloudVault).set({
      status: (queued?.value ?? 0) > 0 ? 'dirty' : 'idle',
      updated_at: Date.now(),
    }).where(eq(cloudVault.vault_id, vault.vault_id));
    await setCloudSyncBackgroundTaskEnabled(true);
    await restartProductionSyncRuntime();
  }
  notifyProductionCloudSyncChanged();
}

export async function syncNow(): Promise<boolean> {
  return runProductionManualSync();
}

export async function verifyCloudBackup(): Promise<boolean> {
  const passed = await runProductionManualSync();
  if (!passed) return false;
  const now = Date.now();
  await db.insert(syncProviderState).values({
    provider_kind: 'google-drive',
    last_verify_at: now,
    updated_at: now,
  }).onConflictDoUpdate({
    target: syncProviderState.provider_kind,
    set: { last_verify_at: now, updated_at: now },
  });
  track('cloud_sync_repair_result', { result: 'not-needed' });
  notifyProductionCloudSyncChanged();
  return true;
}

export async function revokeCloudVault(
  kind: 'backup-deleted' | 'journal-deleted',
): Promise<void> {
  const [vault] = await db.select().from(cloudVault).where(and(
    eq(cloudVault.provider_kind, 'google-drive'),
  )).limit(1);
  if (!vault?.remote_root_id) throw new Error('No cloud backup is configured');
  stopProductionSyncRuntime();
  const provider = new GoogleDriveProvider({ auth: createGoogleAuthorization() });
  const engine = new SQLiteSyncEngine(
    vault.device_id,
    { vaultId: vault.vault_id, remoteRootId: vault.remote_root_id },
    provider,
    new SQLiteEngineCheckpointStore(sqlite),
  );
  const revocationId = generateUUID();
  await engine.revoke(kind, revocationId, Date.now());
  await db.update(cloudVault).set({
    status: 'revoked',
    revocation_kind: kind,
    revocation_id: revocationId,
    updated_at: Date.now(),
  }).where(eq(cloudVault.vault_id, vault.vault_id));
  accountLabelInMemory = null;
  accountLabelAttemptedForVault = null;
  await setCloudSyncBackgroundTaskEnabled(false);
  notifyProductionCloudSyncChanged();
}

async function clearLocalCloudReplica(): Promise<void> {
  // Explicit local teardown used only after Disconnect or a completed
  // journal-deleted revocation. It cannot publish because credentials and the
  // runtime are already stopped before this transaction begins.
  try {
    await sqlite.execAsync(`
      BEGIN IMMEDIATE;
      DELETE FROM sync_media_obligations;
      DELETE FROM sync_retained_media;
      DELETE FROM sync_remote_objects;
      DELETE FROM sync_conflicts;
      DELETE FROM sync_change_queue;
      DELETE FROM sync_entity_state;
      DELETE FROM sync_versions;
      DELETE FROM sync_provider_state;
      DELETE FROM sync_engine_local_blobs;
      DELETE FROM sync_engine_local_domain;
      DELETE FROM sync_engine_entity_metadata;
      DELETE FROM sync_engine_checkpoints;
      DELETE FROM cloud_vault;
      COMMIT;
    `);
  } catch (error) {
    await sqlite.execAsync('ROLLBACK;').catch(() => undefined);
    throw error;
  }
}

export async function resetThisDeviceOnly(): Promise<void> {
  await disconnectGoogleDrive();
  await deleteAllData();
  await clearLocalCloudReplica();
  notifyProductionCloudSyncChanged();
}

export async function deleteJournalEverywhere(): Promise<void> {
  await revokeCloudVault('journal-deleted');
  await deleteAllData();
  await clearLocalCloudReplica();
  notifyProductionCloudSyncChanged();
}

export async function listUnacknowledgedCloudConflicts(): Promise<CloudConflictSummary[]> {
  const rows = await db.select().from(syncConflicts)
    .where(isNull(syncConflicts.acknowledged_at));
  return rows.map((row) => ({
    conflictId: row.conflict_id,
    entityType: row.entity_type as CloudConflictSummary['entityType'],
    recoveredCount: row.recovered_entities.length,
    alternateCount: row.alternate_scalars.length,
    createdAt: row.created_at,
  }));
}

export async function acknowledgeCloudConflicts(): Promise<void> {
  await db.update(syncConflicts).set({ acknowledged_at: Date.now() })
    .where(isNull(syncConflicts.acknowledged_at));
  notifyProductionCloudSyncChanged();
}
