import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { Directory, Paths } from 'expo-file-system';
import {
  cloudVault,
  cloudV2BaseShadow,
  cloudV2Conflicts,
  cloudV2DriveObjects,
  cloudV2DriveState,
  cloudV2DriveUploadSessions,
  cloudV2PendingPublication,
  cloudV2ShadowReaper,
  cloudV2SyncState,
  cloudV2Tombstones,
  customPrompts,
  db,
  entries,
  mediaAssets,
  sqlite,
  syncChangeQueue,
  syncConflicts,
  syncEngineCheckpoints,
  syncEngineEntityMetadata,
  syncEngineLocalBlobs,
  syncEngineLocalDomain,
  syncEntityState,
  syncMediaObligations,
  syncProviderState,
  syncRemoteObjects,
  syncRetainedMedia,
  syncVersions,
  tags,
} from '~/db';
import { track } from '~/lib/analytics';
import { deleteAllDataInTransaction } from '~/db/queries';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { deleteAllVoiceMemos } from '~/lib/voiceMemoUtils';
import { createGoogleAuthorization } from '../auth';
import { SQLiteEngineCheckpointStore, SQLiteSyncEngine } from '../engine';
import { GoogleDriveProvider } from '../providers';
import { readOrCreateGoogleConnectionId } from '../auth/secureTokenStore';
import {
  GoogleDriveSnapshotV2Provider,
  SQLiteDriveV2ProviderStateStore,
  type AvailableDriveV2Vault,
} from '../v2/drive';
import {
  deletionAttentionReason,
  SQLiteV2SyncStateStore,
  V2_ATTENTION_RECOVERY_ACTION,
  type V2AttentionReason,
  type V2RecoveryAction,
} from '../v2/sync';
import {
  getProductionCloudSyncActivity,
  getProductionCloudSyncFailureCategory,
  notifyProductionCloudSyncChanged,
  restartProductionSyncRuntime,
  runProductionManualSync,
  stopProductionSyncRuntime,
} from '../runtime/production';
import type { SyncPassPhase } from '../engine';
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
  attentionReason: V2AttentionReason | null;
  recoveryAction: V2RecoveryAction | null;
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
  provider: GoogleDriveSnapshotV2Provider;
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
  const isV2 = vault?.protocol_version === 2;
  const [[queued], [v2State], [conflicts], [providerState], [pendingMedia]] = await Promise.all([
    isV2 && vault
      ? db.select({
          value: cloudV2SyncState.journal_generation,
          settled: cloudV2SyncState.settled_generation,
        }).from(cloudV2SyncState).where(and(
          eq(cloudV2SyncState.vault_id, vault.vault_id),
          eq(cloudV2SyncState.device_id, vault.device_id),
        )).limit(1)
      : db.select({ value: count(), settled: count() }).from(syncChangeQueue),
    isV2 && vault
      ? db.select().from(cloudV2SyncState).where(and(
          eq(cloudV2SyncState.vault_id, vault.vault_id),
          eq(cloudV2SyncState.device_id, vault.device_id),
        )).limit(1)
      : Promise.resolve([]),
    isV2 && vault
      ? db.select({ value: count() }).from(cloudV2Conflicts).where(and(
          eq(cloudV2Conflicts.vault_id, vault.vault_id),
          isNull(cloudV2Conflicts.acknowledged_at),
        ))
      : db.select({ value: count() }).from(syncConflicts)
        .where(isNull(syncConflicts.acknowledged_at)),
    db.select().from(syncProviderState)
      .where(eq(syncProviderState.provider_kind, 'google-drive')).limit(1),
    isV2
      ? db.select({ value: count() }).from(mediaAssets).where(inArray(
        mediaAssets.download_state,
        ['pending', 'downloading'],
      ))
      : Promise.resolve([]),
  ]);
  const queuedCount = isV2
    ? Math.max(0, (queued?.value ?? 0) - (queued?.settled ?? 0)) +
      (pendingMedia?.value ?? 0)
    : queued?.value ?? 0;
  const conflictCount = conflicts?.value ?? 0;
  const configured = Boolean(
    vault?.remote_root_id && !['disabled', 'revoked'].includes(vault.status),
  );
  if (configured && vault &&
      (vault.protocol_version === 2
        ? getCloudSyncRolloutPolicy().allows(2)
        : getCloudSyncRolloutPolicy().allows(1)) &&
      accountLabelAttemptedForVault !== vault.vault_id) {
    accountLabelAttemptedForVault = vault.vault_id;
    accountLabelInMemory = await createGoogleAuthorization().getAccountLabel()
      .catch(() => null);
  }
  const activity = getProductionCloudSyncActivity();
  let status: CloudSyncSnapshot['status'] = 'off';
  const attentionReason = isV2 && vault
    ? deletionAttentionReason({
        status: vault.status,
        revocationKind: vault.revocation_kind,
        revocationAcknowledgedAt: vault.revocation_acknowledged_at,
        pauseReason:
          (v2State?.pause_reason as V2AttentionReason | null | undefined) ?? null,
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
    accountLabel: accountLabelInMemory,
    activityPhase: activity === 'idle' ? null : activity,
    initialRestore: vault?.status === 'restoring',
    queuedCount,
    conflictCount,
    lastSuccessAt: providerState?.last_success_at ?? null,
    lastVerifiedAt: providerState?.last_verify_at ?? null,
    revocationKind: vault?.revocation_kind ?? null,
    attentionReason,
    recoveryAction: attentionReason ? V2_ATTENTION_RECOVERY_ACTION[attentionReason] : null,
  };
}

export async function prepareGoogleDriveConnection(): Promise<PreparedGoogleConnection> {
  // New/restored connections are protocol v2. Fail before interactive consent
  // or any Drive request when the rollout channel has v2 paused.
  assertCloudSyncNetworkAllowed(2);
  await cancelPreparedGoogleDriveConnection();
  const auth = createGoogleAuthorization();
  try {
    await auth.authorize();
    const connectionId = await readOrCreateGoogleConnectionId();
    const provider = new GoogleDriveSnapshotV2Provider({
      auth,
      state: new SQLiteDriveV2ProviderStateStore(sqlite, connectionId),
    });
    const vaults = await provider.listAvailableVaults();
    const prepared = {
      accountLabel: await auth.getAccountLabel(),
      availableVaults: vaults
        .filter((vault) => !vault.vaultId.startsWith('probe-') &&
          !vault.vaultId.startsWith('v7-probe-'))
        .map((vault: AvailableDriveV2Vault) => ({
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
  assertCloudSyncNetworkAllowed(2);
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
  await db.transaction(async (tx) => {
    await tx.delete(cloudVault);
    await tx.insert(cloudVault).values({
      vault_id: selected!.vaultId,
      provider_kind: 'google-drive',
      remote_root_id: 'appDataFolder',
      account_label: null,
      device_id: deviceId,
      status: options.createNew ? 'dirty' : 'restoring',
      created_at: now,
      updated_at: now,
      last_connected_at: now,
      format_version: 2,
      protocol_version: 2,
    });
    await tx.insert(cloudV2SyncState).values({
      vault_id: selected!.vaultId,
      device_id: deviceId,
      journal_generation: shouldPublishLocal ? 1 : 0,
      settled_generation: 0,
      next_device_sequence: 1,
      updated_at: now,
    }).onConflictDoUpdate({
      target: [cloudV2SyncState.vault_id, cloudV2SyncState.device_id],
      set: {
        journal_generation: shouldPublishLocal
          ? sql`${cloudV2SyncState.journal_generation} + 1`
          : cloudV2SyncState.journal_generation,
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
  if (!vault?.remote_root_id) throw new Error('No cloud backup is configured');
  assertCloudSyncNetworkAllowed(vault.protocol_version === 2 ? 2 : 1);
  if (vault.protocol_version === 2) {
    const auth = createGoogleAuthorization();
    await auth.authorize();
    const connectionId = await readOrCreateGoogleConnectionId();
    const provider = new GoogleDriveSnapshotV2Provider({
      auth,
      state: new SQLiteDriveV2ProviderStateStore(sqlite, connectionId),
    });
    const available = await provider.listAvailableVaults();
    if (!available.some((remote) => remote.vaultId === vault.vault_id)) {
      await auth.signOut();
      throw new Error('The configured Tackbok backup was not found in this Google account');
    }
    accountLabelInMemory = await auth.getAccountLabel();
    accountLabelAttemptedForVault = vault.vault_id;
    const state = new SQLiteV2SyncStateStore(sqlite).loadState(vault.vault_id, vault.device_id);
    await db.update(cloudVault).set({
      status: state.journalGeneration > state.settledGeneration ? 'dirty' : 'idle',
      last_connected_at: Date.now(),
      updated_at: Date.now(),
    }).where(eq(cloudVault.vault_id, vault.vault_id));
    await setCloudSyncBackgroundTaskEnabled(true);
    await restartProductionSyncRuntime();
    return;
  }
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
    const [queued] = vault.protocol_version === 2
      ? await db.select({
        value: sql<number>`MAX(0, ${cloudV2SyncState.journal_generation} - ${cloudV2SyncState.settled_generation})`,
      }).from(cloudV2SyncState).where(and(
        eq(cloudV2SyncState.vault_id, vault.vault_id),
        eq(cloudV2SyncState.device_id, vault.device_id),
      )).limit(1)
      : await db.select({ value: count() }).from(syncChangeQueue);
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
  if (!vault?.remote_root_id) throw new Error('No cloud backup is configured');
  assertCloudSyncNetworkAllowed(vault.protocol_version === 2 ? 2 : 1);
  stopProductionSyncRuntime();
  if (vault.protocol_version === 2) {
    const state = new SQLiteV2SyncStateStore(sqlite);
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
      const provider = new GoogleDriveSnapshotV2Provider({
        auth: createGoogleAuthorization(),
        state: new SQLiteDriveV2ProviderStateStore(sqlite, connectionId),
      });
      await provider.publishRevocation(vault.vault_id, kind);
      const purge = await provider.purgeRevokedVault(vault.vault_id);
      if (purge.remaining !== 0) throw new Error('Protocol-v2 purge is incomplete');
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
          'protocol-v2-purge-incomplete',
        );
      }
      notifyProductionCloudSyncChanged();
      throw error;
    }
  }
  const provider = new GoogleDriveProvider({ auth: createGoogleAuthorization() });
  const engine = new SQLiteSyncEngine(
    vault.device_id,
    { vaultId: vault.vault_id, remoteRootId: vault.remote_root_id },
    provider,
    new SQLiteEngineCheckpointStore(sqlite),
  );
  const revocationId = randomUUID();
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

async function clearLocalCloudReplicaInTransaction(
  tx: CloudSyncTransaction,
): Promise<void> {
  await tx.delete(cloudV2DriveUploadSessions);
  await tx.delete(cloudV2DriveObjects);
  await tx.delete(cloudV2DriveState);
  await tx.delete(cloudV2PendingPublication);
  await tx.delete(cloudV2BaseShadow);
  await tx.delete(cloudV2ShadowReaper);
  await tx.delete(cloudV2Conflicts);
  await tx.delete(cloudV2Tombstones);
  await tx.delete(cloudV2SyncState);
  await tx.delete(syncMediaObligations);
  await tx.delete(syncRetainedMedia);
  await tx.delete(syncRemoteObjects);
  await tx.delete(syncConflicts);
  await tx.delete(syncChangeQueue);
  await tx.delete(syncEntityState);
  await tx.delete(syncVersions);
  await tx.delete(syncProviderState);
  await tx.delete(syncEngineLocalBlobs);
  await tx.delete(syncEngineLocalDomain);
  await tx.delete(syncEngineEntityMetadata);
  await tx.delete(syncEngineCheckpoints);
  await tx.delete(cloudVault);
}

async function wipeJournalAndLocalCloudReplica(): Promise<void> {
  // Shadow and staging files contain journal-derived bytes outside SQLite.
  // Remove them as part of the explicit destructive operation; clearing only
  // their database pointers would leave recoverable private data behind.
  for (const directoryName of ['cloud-sync-v2-base', 'cloud-sync-v2-media']) {
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
  if (vault?.protocol_version === 2) {
    const rows = await db.select().from(cloudV2Conflicts).where(and(
      eq(cloudV2Conflicts.vault_id, vault.vault_id),
      isNull(cloudV2Conflicts.acknowledged_at),
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
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (vault?.protocol_version === 2) {
    await db.update(cloudV2Conflicts).set({ acknowledged_at: Date.now() }).where(and(
      eq(cloudV2Conflicts.vault_id, vault.vault_id),
      isNull(cloudV2Conflicts.acknowledged_at),
    ));
    notifyProductionCloudSyncChanged();
    return;
  }
  await db.update(syncConflicts).set({ acknowledged_at: Date.now() })
    .where(isNull(syncConflicts.acknowledged_at));
  notifyProductionCloudSyncChanged();
}

export async function retryV2AttentionReason(reason: V2AttentionReason): Promise<void> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault || vault.protocol_version !== 2) throw new Error('No protocol-v2 backup');
  const state = new SQLiteV2SyncStateStore(sqlite);
  state.clearPause(vault.vault_id, vault.device_id, reason);
  // Clearing the protocol pause without clearing the presentation-level vault
  // status leaves Sync now disabled even when the attachment has become
  // readable. A retry is actionable work, so always mark this v2 vault dirty
  // before reconstructing the runtime.
  await db.update(cloudVault).set({ status: 'dirty', updated_at: Date.now() })
    .where(eq(cloudVault.vault_id, vault.vault_id));
  await restartProductionSyncRuntime();
  await syncNow();
}
