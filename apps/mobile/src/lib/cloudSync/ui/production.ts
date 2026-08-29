import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { Directory, Paths } from 'expo-file-system';
import {
  cloudVault,
  cloudBaseShadow,
  cloudConflicts,
  cloudDriveObjects,
  cloudDriveState,
  cloudDriveUploadSessions,
  cloudPendingPublication,
  cloudShadowReaper,
  cloudSyncState,
  cloudTombstones,
  customPrompts,
  db,
  entries,
  mediaAssets,
  runExclusiveDbTransaction,
  sqlite,
  syncMediaObligations,
  syncProviderState,
  syncRetainedMedia,
  tags,
} from '~/db';
import { track } from '~/lib/analytics';
import { deleteAllDataInTransaction } from '~/db/queries';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { deleteAllVoiceMemos } from '~/lib/voiceMemoUtils';
import { createGoogleAuthorization } from '../auth';
import { readOrCreateGoogleConnectionId } from '../auth/secureTokenStore';
import {
  GoogleDriveSnapshotProvider,
  SQLiteDriveProviderStateStore,
  type AvailableDriveVault,
} from '../snapshot/drive';
import {
  deletionAttentionReason,
  SQLiteSyncStateStore,
  ATTENTION_RECOVERY_ACTION,
  type SyncAttentionReason,
  type SyncRecoveryAction,
} from '../snapshot/sync';
import {
  getProductionCloudSyncActivity,
  getProductionCloudSyncFailureCategory,
  notifyProductionCloudSyncChanged,
  restartProductionSyncRuntime,
  runProductionManualSync,
  stopProductionSyncRuntime,
} from '../runtime/production';
import type { SyncPassPhase } from '../runtime/SyncRuntime';
import { setCloudSyncBackgroundTaskEnabled } from '../runtime/backgroundTask';
import {
  assertCloudSyncNetworkAllowed,
  getCloudSyncRolloutPolicy,
} from '../runtime/rolloutPolicy';
import {
  runInCloudSyncTransaction,
  type CloudSyncTransaction,
} from '../storage/repositories';

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
  activityPhase: SyncPassPhase | null;
  initialRestore: boolean;
  queuedCount: number;
  conflictCount: number;
  lastSuccessAt: number | null;
  lastVerifiedAt: number | null;
  revocationKind: 'journal-deleted' | 'backup-deleted' | null;
  attentionReason: SyncAttentionReason | null;
  recoveryAction: SyncRecoveryAction | null;
}

export interface PreparedCloudVault {
  vaultId: string;
  createdAt: number | null;
}

export interface PreparedGoogleConnection {
  accountLabel: string;
  availableVaults: PreparedCloudVault[];
  localHasData: boolean;
}

export interface CloudConflictSummary {
  conflictId: string;
  entityType: 'entry' | 'tag' | 'prompt' | 'profile';
  recoveredCount: number;
  alternateCount: number;
  createdAt: number;
}

export type CloudSyncActionFailureCategory =
  | 'auth'
  | 'quota'
  | 'rate-limit'
  | 'offline'
  | 'wifi-only-media'
  | 'corrupt'
  | 'transient'
  | 'unknown';

export class CloudSyncActionError extends Error {
  constructor(readonly category: CloudSyncActionFailureCategory) {
    super(`Cloud sync action failed: ${category}`);
    this.name = 'CloudSyncActionError';
  }
}

let accountLabelInMemory: string | null = null;
let accountLabelAttemptedForVault: string | null = null;
let pendingConnection: {
  provider: GoogleDriveSnapshotProvider;
  auth: ReturnType<typeof createGoogleAuthorization>;
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
  const [[queued], [syncState], [conflicts], [providerState], [pendingMedia]] = await Promise.all([
    vault
      ? db.select({
          value: cloudSyncState.journal_generation,
          settled: cloudSyncState.settled_generation,
        }).from(cloudSyncState).where(and(
          eq(cloudSyncState.vault_id, vault.vault_id),
          eq(cloudSyncState.device_id, vault.device_id),
        )).limit(1)
      : Promise.resolve([{ value: 0, settled: 0 }]),
    vault
      ? db.select().from(cloudSyncState).where(and(
          eq(cloudSyncState.vault_id, vault.vault_id),
          eq(cloudSyncState.device_id, vault.device_id),
        )).limit(1)
      : Promise.resolve([]),
    vault
      ? db.select({ value: count() }).from(cloudConflicts).where(and(
          eq(cloudConflicts.vault_id, vault.vault_id),
          isNull(cloudConflicts.acknowledged_at),
        ))
      : Promise.resolve([{ value: 0 }]),
    db.select().from(syncProviderState)
      .where(eq(syncProviderState.provider_kind, 'google-drive')).limit(1),
    vault
      ? db.select({ value: count() }).from(mediaAssets).where(inArray(
        mediaAssets.download_state,
        ['pending', 'downloading'],
      ))
      : Promise.resolve([]),
  ]);
  const queuedCount = vault
    ? Math.max(0, (queued?.value ?? 0) - (queued?.settled ?? 0)) +
      (pendingMedia?.value ?? 0)
    : 0;
  const conflictCount = conflicts?.value ?? 0;
  const configured = Boolean(
    vault?.remote_root_id && !['disabled', 'revoked'].includes(vault.status),
  );
  if (configured && vault && getCloudSyncRolloutPolicy().networkAllowed &&
      accountLabelAttemptedForVault !== vault.vault_id) {
    accountLabelAttemptedForVault = vault.vault_id;
    accountLabelInMemory = await createGoogleAuthorization().getAccountLabel()
      .catch(() => null);
  }
  const activity = getProductionCloudSyncActivity();
  let status: CloudSyncSnapshot['status'] = 'off';
  const attentionReason = vault
    ? deletionAttentionReason({
        status: vault.status,
        revocationKind: vault.revocation_kind,
        revocationAcknowledgedAt: vault.revocation_acknowledged_at,
        pauseReason:
          (syncState?.pause_reason as SyncAttentionReason | null | undefined) ?? null,
      })
    : null;
  if (vault?.status === 'revoked' || attentionReason) status = 'warning';
  else if (vault?.status === 'paused') status = 'paused';
  else if (activity !== 'idle') status = 'syncing';
  else if (vault?.status === 'restoring') status = 'restoring';
  else if (configured && queuedCount > 0) status = 'queued';
  else if (configured) status = 'synced';

  return {
    configured,
    provider: vault?.provider_kind === 'google-drive' ? 'google-drive' : null,
    status,
    accountLabel: vault ? accountLabelInMemory : null,
    activityPhase: activity === 'idle' ? null : activity,
    initialRestore: vault?.status === 'restoring',
    queuedCount,
    conflictCount,
    lastSuccessAt: providerState?.last_success_at ?? null,
    lastVerifiedAt: providerState?.last_verify_at ?? null,
    revocationKind: vault?.revocation_kind ?? null,
    attentionReason,
    recoveryAction: attentionReason ? ATTENTION_RECOVERY_ACTION[attentionReason] : null,
  };
}

export async function prepareGoogleDriveConnection(): Promise<PreparedGoogleConnection> {
  // Fail before interactive consent or Drive traffic when cloud sync is paused.
  assertCloudSyncNetworkAllowed();
  await cancelPreparedGoogleDriveConnection();
  const auth = createGoogleAuthorization();
  try {
    await auth.authorize();
    const connectionId = await readOrCreateGoogleConnectionId();
    const provider = new GoogleDriveSnapshotProvider({
      auth,
      state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
    });
    const vaults = await provider.listAvailableVaults();
    const prepared = {
      accountLabel: await auth.getAccountLabel(),
      availableVaults: vaults
        .filter((vault) => !vault.vaultId.includes('probe-'))
        .map((vault: AvailableDriveVault) => ({
          vaultId: vault.vaultId,
          createdAt: vault.updatedAt || null,
        })),
      localHasData: await localHasData(),
    };
    pendingConnection = { provider, auth, prepared };
    accountLabelInMemory = prepared.accountLabel;
    notifyProductionCloudSyncChanged();
    return prepared;
  } catch (error) {
    await auth.signOut().catch(() => undefined);
    throw error;
  }
}

export async function cancelPreparedGoogleDriveConnection(): Promise<void> {
  const pending = pendingConnection;
  pendingConnection = null;
  if (pending) await pending.auth.signOut().catch(() => undefined);
}

export async function completeGoogleDriveConnection(options: {
  origin: CloudSetupOrigin;
  vaultId?: string;
  createNew?: boolean;
}): Promise<void> {
  assertCloudSyncNetworkAllowed();
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
    selected = { vaultId: randomUUID(), createdAt: Date.now() };
  }

  stopProductionSyncRuntime();
  const [prior] = await db.select({ deviceId: cloudVault.device_id }).from(cloudVault).limit(1);
  const now = Date.now();
  const deviceId = prior?.deviceId ?? randomUUID();
  const shouldPublishLocal = options.createNew || pending.prepared.localHasData;
  await runExclusiveDbTransaction(async (tx) => {
    await tx.delete(cloudVault);
    await tx.insert(cloudVault).values({
      vault_id: selected!.vaultId,
      provider_kind: 'google-drive',
      remote_root_id: 'appDataFolder',
      device_id: deviceId,
      status: options.createNew ? 'dirty' : 'restoring',
      created_at: now,
      updated_at: now,
      last_connected_at: now,
    });
    await tx.insert(cloudSyncState).values({
      vault_id: selected!.vaultId,
      device_id: deviceId,
      journal_generation: shouldPublishLocal ? 1 : 0,
      settled_generation: 0,
      next_device_sequence: 1,
      updated_at: now,
    }).onConflictDoUpdate({
      target: [cloudSyncState.vault_id, cloudSyncState.device_id],
      set: {
        journal_generation: shouldPublishLocal
          ? sql`${cloudSyncState.journal_generation} + 1`
          : cloudSyncState.journal_generation,
        pause_reason: null,
        pause_context_json: null,
        last_error_class: null,
        updated_at: now,
      },
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
  if (!vault?.remote_root_id) {
    throw new Error('No cloud backup is configured');
  }
  assertCloudSyncNetworkAllowed();
  const auth = createGoogleAuthorization();
  await auth.authorize();
  const connectionId = await readOrCreateGoogleConnectionId();
  const provider = new GoogleDriveSnapshotProvider({
    auth,
    state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
  });
  const available = await provider.listAvailableVaults();
  if (!available.some((remote) => remote.vaultId === vault.vault_id)) {
    await auth.signOut();
    throw new Error('The configured Tackbok backup was not found in this Google account');
  }
  accountLabelInMemory = await auth.getAccountLabel();
  accountLabelAttemptedForVault = vault.vault_id;
  const state = new SQLiteSyncStateStore(sqlite).loadState(vault.vault_id, vault.device_id);
  await db.update(cloudVault).set({
    status: state.journalGeneration > state.settledGeneration ? 'dirty' : 'idle',
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
  if (!vault) throw new Error('Cloud sync is not configured');
  if (vault.status === 'revoked' || vault.status === 'disabled') {
    throw new Error('Cloud sync cannot be paused in its current state');
  }
  if (paused) {
    stopProductionSyncRuntime();
    await db.update(cloudVault).set({ status: 'paused', updated_at: Date.now() })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    await setCloudSyncBackgroundTaskEnabled(false);
  } else {
    const [queued] = await db.select({
      value: sql<number>`MAX(0, ${cloudSyncState.journal_generation} - ${cloudSyncState.settled_generation})`,
    }).from(cloudSyncState).where(and(
      eq(cloudSyncState.vault_id, vault.vault_id),
      eq(cloudSyncState.device_id, vault.device_id),
    )).limit(1);
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
  const passed = await runProductionManualSync();
  if (!passed) {
    throw new CloudSyncActionError(
      getProductionCloudSyncFailureCategory() ?? 'unknown',
    );
  }
  return true;
}

export async function verifyCloudBackup(): Promise<boolean> {
  await syncNow();
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
  if (!vault?.remote_root_id) {
    throw new Error('No cloud backup is configured');
  }
  assertCloudSyncNetworkAllowed();
  stopProductionSyncRuntime();
  const state = new SQLiteSyncStateStore(sqlite);
  let remoteDeletionCompleted = false;
  try {
      // This is the durable point of no ordinary-sync return. If the process
      // dies anywhere below, startup keeps the runtime disabled and exposes a
      // Resume deletion action instead of silently returning to normal sync.
      await db.update(cloudVault).set({
        status: 'paused',
        revocation_kind: kind,
        revocation_acknowledged_at: null,
        updated_at: Date.now(),
      }).where(eq(cloudVault.vault_id, vault.vault_id));
      await setCloudSyncBackgroundTaskEnabled(false);
      notifyProductionCloudSyncChanged();
      const connectionId = await readOrCreateGoogleConnectionId();
      const provider = new GoogleDriveSnapshotProvider({
        auth: createGoogleAuthorization(),
        state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
      });
      await provider.publishRevocation(vault.vault_id, kind);
      const purge = await provider.purgeRevokedVault(vault.vault_id);
      if (purge.remaining !== 0) throw new Error('Cloud backup purge is incomplete');
      // Checkpoint remote completion before signing out. A force-close after
      // this write can finish journal deletion without Drive authorization;
      // backup deletion exposes local credential cleanup instead of retrying
      // the already-complete purge with credentials that may have been cleared.
      const revocationId = randomUUID();
      await db.update(cloudVault).set({
        status: 'revoked',
        revocation_kind: kind,
        revocation_id: revocationId,
        revocation_acknowledged_at: null,
        updated_at: Date.now(),
      }).where(eq(cloudVault.vault_id, vault.vault_id));
      remoteDeletionCompleted = true;
      state.clearPause(vault.vault_id, vault.device_id);
      await createGoogleAuthorization().signOut();
      await db.update(cloudVault).set({
        revocation_acknowledged_at: Date.now(),
        updated_at: Date.now(),
      }).where(eq(cloudVault.vault_id, vault.vault_id));
      accountLabelInMemory = null;
      accountLabelAttemptedForVault = null;
      await setCloudSyncBackgroundTaskEnabled(false);
      notifyProductionCloudSyncChanged();
    return;
  } catch (error) {
    if (remoteDeletionCompleted) {
      state.clearPause(vault.vault_id, vault.device_id);
    } else {
      state.setPause(
        vault.vault_id,
        vault.device_id,
        'purge-incomplete',
        'cloud-backup-purge-incomplete',
      );
    }
    notifyProductionCloudSyncChanged();
    throw error;
  }
}

async function clearLocalCloudReplicaInTransaction(
  tx: CloudSyncTransaction,
): Promise<void> {
  await tx.delete(cloudDriveUploadSessions);
  await tx.delete(cloudDriveObjects);
  await tx.delete(cloudDriveState);
  await tx.delete(cloudPendingPublication);
  await tx.delete(cloudBaseShadow);
  await tx.delete(cloudShadowReaper);
  await tx.delete(cloudConflicts);
  await tx.delete(cloudTombstones);
  await tx.delete(cloudSyncState);
  await tx.delete(syncMediaObligations);
  await tx.delete(syncRetainedMedia);
  await tx.delete(syncProviderState);
  await tx.delete(cloudVault);
}

async function wipeJournalAndLocalCloudReplica(): Promise<void> {
  // Shadow and staging files contain journal-derived bytes outside SQLite.
  // Remove them as part of the explicit destructive operation; clearing only
  // their database pointers would leave recoverable private data behind.
  for (const directoryName of ['cloud-sync-base', 'cloud-sync-media']) {
    const directory = new Directory(Paths.document, directoryName);
    if (directory.exists) directory.delete();
  }
  await runInCloudSyncTransaction(async (tx) => {
    await deleteAllDataInTransaction(tx);
    // The routed hard delete creates queue and retained-media rows. Clearing
    // those rows in this same transaction closes the crash window where a
    // later reconnect could otherwise publish the device wipe to Drive.
    await clearLocalCloudReplicaInTransaction(tx);
  });
  deleteAllPhotos();
  deleteAllVoiceMemos();
}

export async function resetThisDeviceOnly(): Promise<void> {
  const [vault] = await db.select({ id: cloudVault.vault_id }).from(cloudVault).limit(1);
  stopProductionSyncRuntime();
  if (vault) {
    // Sign out before deleting local state. A crash before the atomic wipe
    // leaves the journal intact; a crash after it cannot leave queued deletes.
    await createGoogleAuthorization().signOut();
    await setCloudSyncBackgroundTaskEnabled(false);
  }
  accountLabelInMemory = null;
  accountLabelAttemptedForVault = null;
  await wipeJournalAndLocalCloudReplica();
  notifyProductionCloudSyncChanged();
}

export async function deleteJournalEverywhere(): Promise<void> {
  const [vault] = await db.select({
    status: cloudVault.status,
    revocationKind: cloudVault.revocation_kind,
  }).from(cloudVault).limit(1);
  const remoteDeletionAlreadyCompleted =
    vault?.status === 'revoked' && vault.revocationKind === 'journal-deleted';
  if (!remoteDeletionAlreadyCompleted) {
    await revokeCloudVault('journal-deleted');
  } else {
    // A prior run may have died after the remote-complete checkpoint and
    // before clearing credentials/local data. Both operations are idempotent.
    await createGoogleAuthorization().signOut();
    await setCloudSyncBackgroundTaskEnabled(false);
  }
  await wipeJournalAndLocalCloudReplica();
  notifyProductionCloudSyncChanged();
}

export async function listUnacknowledgedCloudConflicts(): Promise<CloudConflictSummary[]> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault) return [];
  const rows = await db.select().from(cloudConflicts).where(and(
    eq(cloudConflicts.vault_id, vault.vault_id),
    isNull(cloudConflicts.acknowledged_at),
  ));
  return rows.map((row) => {
    const conflict = JSON.parse(row.conflict_json) as {
      entityType: CloudConflictSummary['entityType'];
      recoveredEntityIds?: unknown[];
      alternates?: unknown[];
    };
    return {
      conflictId: row.conflict_id,
      entityType: conflict.entityType,
      recoveredCount: conflict.recoveredEntityIds?.length ?? 0,
      alternateCount: conflict.alternates?.length ?? 0,
      createdAt: row.created_at,
    };
  });
}

export async function acknowledgeCloudConflicts(): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault) return;
  await db.update(cloudConflicts).set({ acknowledged_at: Date.now() }).where(and(
    eq(cloudConflicts.vault_id, vault.vault_id),
    isNull(cloudConflicts.acknowledged_at),
  ));
  notifyProductionCloudSyncChanged();
}

export async function retrySyncAttentionReason(reason: SyncAttentionReason): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault) throw new Error('No cloud backup');
  const state = new SQLiteSyncStateStore(sqlite);
  state.clearPause(vault.vault_id, vault.device_id, reason);
  // Clearing the protocol pause without clearing the presentation-level vault
  // status leaves Sync now disabled even when the attachment has become
  // readable. A retry is actionable work, so always mark this vault dirty
  // before reconstructing the runtime.
  await db.update(cloudVault).set({ status: 'dirty', updated_at: Date.now() })
    .where(eq(cloudVault.vault_id, vault.vault_id));
  await restartProductionSyncRuntime();
  await syncNow();
}
