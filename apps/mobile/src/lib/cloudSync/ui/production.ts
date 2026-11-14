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
import { deleteAllDataInTransaction } from '~/db/queries';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { deleteAllVoiceMemos } from '~/lib/voiceMemoUtils';
import { useSettingsStore } from '~/lib/settings';
import { createGoogleAuthorization } from '../auth';
import {
  CloudConnectionChangedError,
  cloudConnectionLifecycle,
} from '../runtime/connectionLifecycle';
import {
  canResumeUnpublishedBackup,
  clearAuthorizationPause,
} from './connectionRecovery';
import {
  readGoogleAccountEmail,
  readOrCreateGoogleConnectionId,
} from '../auth/secureTokenStore';
import {
  beginConnectionSetup,
  endConnectionSetup,
  resolveConnectionSetup,
  rollBackConnectionSetup,
  type ConnectionRollback,
} from '../runtime/connectionSetup';
import {
  GoogleDriveSnapshotProvider,
  SQLiteDriveProviderStateStore,
  type AvailableDriveVault,
} from '../snapshot/drive';
import { nativeSha256Bytes } from '../snapshot/runtime/nativeSha256';
import { waitingMediaUploadCount } from '../snapshot/runtime/waitingMediaUploads';
import { clearMediaHashes, forgetMediaHashes } from '../snapshot/storage';
import {
  deletionAttentionReason,
  SQLiteSyncStateStore,
  ATTENTION_RECOVERY_ACTION,
  type SyncAttentionReason,
  type SyncRecoveryAction,
} from '../snapshot/sync';
import { SyncCancelledError } from '../snapshot/sync/errors';
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
  runInCloudSyncTransaction,
  type CloudSyncTransaction,
} from '../storage/repositories';

export type CloudSetupOrigin = 'settings' | 'onboarding';

export interface CloudSyncSnapshot {
  configured: boolean;
  provider: 'google-drive' | null;
  vaultId: string | null;
  status: 'off' | 'paused' | 'syncing' | 'queued' | 'synced' | 'warning' | 'restoring';
  accountLabel: string | null;
  activityPhase: SyncPassPhase | null;
  initialRestore: boolean;
  /** Local changes not yet saved to the backup. */
  queuedCount: number;
  /** Photos and voice notes from the backup not yet on this device. */
  pendingDownloadCount: number;
  /** New photos and voice notes on this device waiting for Wi-Fi to back up. */
  waitingUploadCount: number;
  /** Downloaded photos and voice notes on this device, not only this restore's. */
  downloadedMediaCount: number;
  /** Why the latest pass in this session failed, if it did. */
  failureCategory: CloudSyncActionFailureCategory | null;
  conflictCount: number;
  lastSuccessAt: number | null;
  lastVerifiedAt: number | null;
  revocationKind: 'journal-deleted' | 'backup-deleted' | null;
  attentionReason: SyncAttentionReason | null;
  recoveryAction: SyncRecoveryAction | null;
  /**
   * The restore marker's journal proof when this snapshot started reading.
   * Every count was read after it, so counts that match a proof include the
   * journal's media rows, whatever the wall clock did.
   */
  restoreProofAtLoad: number | null;
}

export interface PreparedCloudVault {
  vaultId: string;
  /** When any device last updated this backup, not when it was created. */
  updatedAt: number | null;
}

export interface PreparedGoogleConnection {
  accountLabel: string;
  availableVaults: PreparedCloudVault[];
  /** Backups found in this account that this version could not read. */
  unreadableBackupCount: number;
  localHasData: boolean;
}

export type CloudSyncActionFailureCategory =
  | 'auth'
  | 'quota'
  | 'rate-limit'
  | 'offline'
  | 'wifi-only-media'
  | 'local-media'
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
let connectionSetupInProgress = false;
let pendingConnection: {
  provider: GoogleDriveSnapshotProvider;
  auth: ReturnType<typeof createGoogleAuthorization>;
  prepared: PreparedGoogleConnection;
  rollback: ConnectionRollback;
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
  const restoreProofAtLoad =
    useSettingsStore.getState().cloudRestore?.journalRestoredAt ?? null;
  const [vault] = await db.select().from(cloudVault).limit(1);
  const [[queued], [syncState], [conflicts], [providerState], [pendingMedia]] =
    await Promise.all([
      vault
        ? db
            .select({
              value: cloudSyncState.journal_generation,
              settled: cloudSyncState.settled_generation,
            })
            .from(cloudSyncState)
            .where(
              and(
                eq(cloudSyncState.vault_id, vault.vault_id),
                eq(cloudSyncState.device_id, vault.device_id),
              ),
            )
            .limit(1)
        : Promise.resolve([{ value: 0, settled: 0 }]),
      vault
        ? db
            .select()
            .from(cloudSyncState)
            .where(
              and(
                eq(cloudSyncState.vault_id, vault.vault_id),
                eq(cloudSyncState.device_id, vault.device_id),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
      vault
        ? db
            .select({ value: count() })
            .from(cloudConflicts)
            .where(
              and(
                eq(cloudConflicts.vault_id, vault.vault_id),
                isNull(cloudConflicts.acknowledged_at),
              ),
            )
        : Promise.resolve([{ value: 0 }]),
      db
        .select()
        .from(syncProviderState)
        .where(eq(syncProviderState.provider_kind, 'google-drive'))
        .limit(1),
      vault
        ? db
            .select({ value: count() })
            .from(mediaAssets)
            .where(inArray(mediaAssets.download_state, ['pending', 'downloading']))
        : Promise.resolve([]),
    ]);
  const [downloadedMedia] = vault
    ? await db
        .select({ value: count() })
        .from(mediaAssets)
        .where(eq(mediaAssets.download_state, 'verified'))
    : [];
  const queuedCount = vault
    ? Math.max(0, (queued?.value ?? 0) - (queued?.settled ?? 0))
    : 0;
  const pendingDownloadCount = vault ? (pendingMedia?.value ?? 0) : 0;
  const waitingUploadCount = vault ? waitingMediaUploadCount(vault.vault_id) : 0;
  const conflictCount = conflicts?.value ?? 0;
  const configured = Boolean(
    vault?.remote_root_id && !['disabled', 'revoked'].includes(vault.status),
  );
  if (configured && vault && accountLabelAttemptedForVault !== vault.vault_id) {
    accountLabelAttemptedForVault = vault.vault_id;
    // Loading the label can refresh and store tokens. As a pass, a Disconnect
    // or Reconnect waits for that write instead of being undone by it.
    const epoch = cloudConnectionLifecycle.epoch;
    let label: string | null = null;
    let changed = false;
    try {
      label = await cloudConnectionLifecycle.runPass(epoch, () =>
        createGoogleAuthorization().getAccountLabel(),
      );
    } catch (error) {
      changed = error instanceof CloudConnectionChangedError;
    }
    if (!changed && cloudConnectionLifecycle.epoch === epoch) {
      accountLabelInMemory = label;
    } else if (accountLabelAttemptedForVault === vault.vault_id) {
      // A connection change decides the label; the load after it asks again.
      accountLabelAttemptedForVault = null;
    }
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
  else if (configured && queuedCount + pendingDownloadCount + waitingUploadCount > 0)
    status = 'queued';
  else if (configured) status = 'synced';

  return {
    configured,
    provider: vault?.provider_kind === 'google-drive' ? 'google-drive' : null,
    vaultId: vault?.vault_id ?? null,
    status,
    accountLabel: vault ? accountLabelInMemory : null,
    activityPhase: activity === 'idle' ? null : activity,
    initialRestore: vault?.status === 'restoring',
    queuedCount,
    pendingDownloadCount,
    waitingUploadCount,
    downloadedMediaCount: vault ? (downloadedMedia?.value ?? 0) : 0,
    failureCategory: getProductionCloudSyncFailureCategory(),
    conflictCount,
    lastSuccessAt: providerState?.last_success_at ?? null,
    lastVerifiedAt: providerState?.last_verify_at ?? null,
    revocationKind: vault?.revocation_kind ?? null,
    attentionReason,
    recoveryAction: attentionReason ? ATTENTION_RECOVERY_ACTION[attentionReason] : null,
    restoreProofAtLoad,
  };
}

/**
 * Authorizes the account the user chooses in place of the stored one, then
 * runs `staged` with it. Setup and Reconnect both go through here. The current
 * backup and credentials are guarded durably and the backup disabled before
 * authorization, so no failure, interleaving or process death can leave a
 * backup enabled with an account that has not been confirmed for it: a throw
 * puts them back here, and a launch after process death puts them back (see
 * connectionSetup). Call it under the connection barrier. `staged` commits by
 * enabling a backup and then calling endConnectionSetup.
 */
async function withStagedGoogleAccount<T>(
  auth: ReturnType<typeof createGoogleAuthorization>,
  staged: (rollback: ConnectionRollback) => Promise<T>,
): Promise<T> {
  // When this throws nothing changed; a guard it could not read stays for
  // recovery, and the action can be tried again.
  const rollback = await beginConnectionSetup();
  try {
    // Background tasks must not use the staged credentials either.
    await setCloudSyncBackgroundTaskEnabled(false);
    await auth.authorize();
    return await staged(rollback);
  } catch (error) {
    await rollBackConnection(auth, rollback);
    throw error;
  }
}

async function prepareGoogleDriveConnectionImpl(): Promise<PreparedGoogleConnection> {
  const auth = createGoogleAuthorization();
  // Until a backup is chosen, a cancelled or failed setup puts the current
  // backup and its credentials back, so a backup this device is still using
  // (such as a running restore) keeps going.
  try {
    // An earlier setup's picker is invalidated and its backup put back first.
    await resolvePendingConnectionSetup();
    connectionSetupInProgress = true;
    return await withStagedGoogleAccount(auth, async (rollback) => {
      const connectionId = await readOrCreateGoogleConnectionId();
      const provider = new GoogleDriveSnapshotProvider({
        auth,
        state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
        hashBytes: nativeSha256Bytes,
      });
      const { vaults, unreadableVaultIds } = await provider.listAvailableVaults();
      const prepared = {
        accountLabel: await auth.getAccountLabel(),
        availableVaults: vaults
          .filter((vault) => !vault.vaultId.includes('probe-'))
          .map((vault: AvailableDriveVault) => ({
            vaultId: vault.vaultId,
            updatedAt: vault.updatedAt || null,
          })),
        unreadableBackupCount: unreadableVaultIds.filter(
          (vaultId) => !vaultId.includes('probe-'),
        ).length,
        localHasData: await localHasData(),
      };
      pendingConnection = { provider, auth, prepared, rollback };
      accountLabelInMemory = prepared.accountLabel;
      notifyProductionCloudSyncChanged();
      return prepared;
    });
  } catch (error) {
    connectionSetupInProgress = false;
    throw error;
  }
}

async function rollBackConnection(
  auth: ReturnType<typeof createGoogleAuthorization>,
  rollback: ConnectionRollback,
): Promise<void> {
  await rollBackConnectionSetup(rollback, () => auth.signOut());
  accountLabelInMemory = null;
  accountLabelAttemptedForVault = null;
  if (rollback.vaults.length > 0) await enableBackgroundSyncAfterCommit();
}

async function cancelPreparedGoogleDriveConnectionImpl(): Promise<void> {
  const pending = pendingConnection;
  pendingConnection = null;
  if (pending) await rollBackConnection(pending.auth, pending.rollback);
}

/**
 * While a setup is pending, the configured backup and account are
 * authoritative. Every other connection action calls this first, under the
 * connection barrier: it puts the setup back (credentials, then backup status)
 * and invalidates its picker, so the action uses the configured account and
 * never enables a backup with staged credentials. A setup a dead process left
 * is put back too; an unreadable guard throws and stays for recovery.
 */
async function resolvePendingConnectionSetup(): Promise<void> {
  connectionSetupInProgress = false;
  if (pendingConnection) {
    await cancelPreparedGoogleDriveConnectionImpl();
    return;
  }
  await resolveAbandonedConnectionSetup();
}

/** Puts back a setup a dead process left. Call it under the connection barrier. */
async function resolveAbandonedConnectionSetup(): Promise<void> {
  if (await resolveConnectionSetup(() => createGoogleAuthorization().signOut())) {
    accountLabelInMemory = null;
    accountLabelAttemptedForVault = null;
  }
}

/**
 * Background sync is an extra; foreground sync already runs for a committed
 * connection. A failed registration is logged and retried at the next launch.
 */
async function enableBackgroundSyncAfterCommit(): Promise<void> {
  try {
    await setCloudSyncBackgroundTaskEnabled(true);
  } catch (error) {
    console.warn('Cloud backup background sync will be registered at next launch', error);
  }
}

async function completeGoogleDriveConnectionImpl(options: {
  origin: CloudSetupOrigin;
  /** The picker's connection; a newer or put-back setup invalidates it. */
  connection: PreparedGoogleConnection;
  vaultId?: string;
  createNew?: boolean;
}): Promise<void> {
  const pending = pendingConnection;
  if (!pending || pending.prepared !== options.connection) {
    throw new Error('Google Drive connection is no longer active');
  }

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
    selected = { vaultId: randomUUID(), updatedAt: Date.now() };
  }

  stopProductionSyncRuntime();
  const [prior] = await db
    .select({ deviceId: cloudVault.device_id })
    .from(cloudVault)
    .limit(1);
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
    await tx
      .insert(cloudSyncState)
      .values({
        vault_id: selected!.vaultId,
        device_id: deviceId,
        journal_generation: shouldPublishLocal ? 1 : 0,
        settled_generation: 0,
        next_device_sequence: 1,
        updated_at: now,
      })
      .onConflictDoUpdate({
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
    await tx
      .insert(syncProviderState)
      .values({
        provider_kind: 'google-drive',
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: syncProviderState.provider_kind,
        set: { error_code: null, pause_code: null, updated_at: now },
      });
  });
  // The vault commit is irrevocable: drop the in-memory rollback before any
  // fallible cleanup, so a later cancel can never put the old account back.
  pendingConnection = null;
  connectionSetupInProgress = false;
  // The committed backup is active, so a guard left behind (by a crash or a
  // failed delete) is inert and startup reconciliation clears it.
  try {
    await endConnectionSetup();
  } catch (error) {
    console.warn('Could not clear the connection setup guard', error);
  }
  accountLabelAttemptedForVault = selected.vaultId;
  // The connection is committed. Record the restore and finish onboarding here,
  // not in the setup screen, so neither depends on that screen staying open.
  const settings = useSettingsStore.getState();
  settings.setCloudRestore(
    options.createNew ? null : { vaultId: selected.vaultId, startedAt: now },
  );
  if (options.origin === 'onboarding') settings.setHasCompletedOnboarding(true);
  await enableBackgroundSyncAfterCommit();
  notifyProductionCloudSyncChanged();
}

async function reconnectGoogleDriveImpl(): Promise<void> {
  await resolvePendingConnectionSetup();
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault?.remote_root_id) {
    throw new Error('No cloud backup is configured');
  }
  const auth = createGoogleAuthorization();
  const previousEmail = await readGoogleAccountEmail();
  // The chosen account is unconfirmed until it proves it holds this backup.
  await withStagedGoogleAccount(auth, async () => {
    const connectionId = await readOrCreateGoogleConnectionId();
    const provider = new GoogleDriveSnapshotProvider({
      auth,
      state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
      hashBytes: nativeSha256Bytes,
    });
    const { vaults: available } = await provider.listAvailableVaults();
    const store = new SQLiteSyncStateStore(sqlite);
    const state = store.loadState(vault.vault_id, vault.device_id);
    const accountLabel = await auth.getAccountLabel();
    const resumeUnpublished = canResumeUnpublishedBackup({
      previousEmail,
      currentEmail: await readGoogleAccountEmail(),
      settledGeneration: state.settledGeneration,
      hasBase: store.loadBaseCheckpoint(vault.vault_id, vault.device_id) !== null,
      availableVaultCount: available.length,
      revoked:
        vault.revocation_kind !== null ||
        (await provider.listRevocations(vault.vault_id)).length > 0,
    });
    if (
      !available.some((remote) => remote.vaultId === vault.vault_id) &&
      !resumeUnpublished
    ) {
      throw new Error(
        'The configured Tackbok backup was not found in this Google account',
      );
    }
    await setCloudSyncBackgroundTaskEnabled(true);
    clearAuthorizationPause(store, vault.vault_id, vault.device_id);
    await db
      .update(cloudVault)
      .set({
        status: state.journalGeneration > state.settledGeneration ? 'dirty' : 'idle',
        last_connected_at: Date.now(),
        updated_at: Date.now(),
      })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    // The backup is active with an account that holds it, so the guard is inert.
    await endConnectionSetup();
    accountLabelInMemory = accountLabel;
    accountLabelAttemptedForVault = vault.vault_id;
  });
}

async function disconnectGoogleDriveImpl(): Promise<void> {
  stopProductionSyncRuntime();
  await resolvePendingConnectionSetup();
  // Per-device Disconnect is intentionally local. This abstraction clears
  // SecureStore and native session state without calling Google's revoke API.
  await createGoogleAuthorization().signOut();
  await db.update(cloudVault).set({ status: 'disabled', updated_at: Date.now() });
  useSettingsStore.getState().setCloudRestore(null);
  accountLabelInMemory = null;
  accountLabelAttemptedForVault = null;
  await setCloudSyncBackgroundTaskEnabled(false);
  notifyProductionCloudSyncChanged();
}

async function setCloudSyncPausedImpl(paused: boolean): Promise<void> {
  await resolvePendingConnectionSetup();
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault) throw new Error('Cloud sync is not configured');
  if (vault.status === 'revoked' || vault.status === 'disabled') {
    throw new Error('Cloud sync cannot be paused in its current state');
  }
  if (paused) {
    stopProductionSyncRuntime();
    await db
      .update(cloudVault)
      .set({ status: 'paused', updated_at: Date.now() })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    await setCloudSyncBackgroundTaskEnabled(false);
  } else {
    const [queued] = await db
      .select({
        value: sql<number>`MAX(0, ${cloudSyncState.journal_generation} - ${cloudSyncState.settled_generation})`,
      })
      .from(cloudSyncState)
      .where(
        and(
          eq(cloudSyncState.vault_id, vault.vault_id),
          eq(cloudSyncState.device_id, vault.device_id),
        ),
      )
      .limit(1);
    await db
      .update(cloudVault)
      .set({
        status: (queued?.value ?? 0) > 0 ? 'dirty' : 'idle',
        updated_at: Date.now(),
      })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    await setCloudSyncBackgroundTaskEnabled(true);
  }
  notifyProductionCloudSyncChanged();
}

/**
 * Runs a manual pass. Throws SyncCancelledError when Pause, Disconnect or another
 * connection change stopped it, so callers can tell that apart from a failure.
 */
export async function syncNow(): Promise<boolean> {
  return runManualSyncSince(cloudConnectionLifecycle.epoch);
}

/** `epoch` is the connection epoch when the user's whole action started. */
async function runManualSyncSince(epoch: number): Promise<boolean> {
  if (await runProductionManualSync()) return true;
  // The runtime records a category only for a genuine failure, never for a
  // cancelled pass, so a failure that overlaps a connection change still shows.
  const category = getProductionCloudSyncFailureCategory();
  if (category) throw new CloudSyncActionError(category);
  if (cloudConnectionLifecycle.epoch !== epoch) throw new SyncCancelledError();
  throw new CloudSyncActionError('unknown');
}

async function revokeCloudVaultImpl(
  kind: 'backup-deleted' | 'journal-deleted',
): Promise<void> {
  // Deletion targets the configured backup with the configured account.
  await resolvePendingConnectionSetup();
  const [vault] = await db
    .select()
    .from(cloudVault)
    .where(and(eq(cloudVault.provider_kind, 'google-drive')))
    .limit(1);
  if (!vault?.remote_root_id) {
    throw new Error('No cloud backup is configured');
  }
  stopProductionSyncRuntime();
  const state = new SQLiteSyncStateStore(sqlite);
  let remoteDeletionCompleted = false;
  try {
    // This is the durable point of no ordinary-sync return. If the process
    // dies anywhere below, startup keeps the runtime disabled and exposes a
    // Resume deletion action instead of silently returning to normal sync.
    await db
      .update(cloudVault)
      .set({
        status: 'paused',
        revocation_kind: kind,
        revocation_acknowledged_at: null,
        updated_at: Date.now(),
      })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    await setCloudSyncBackgroundTaskEnabled(false);
    notifyProductionCloudSyncChanged();
    const connectionId = await readOrCreateGoogleConnectionId();
    const provider = new GoogleDriveSnapshotProvider({
      auth: createGoogleAuthorization(),
      state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
      hashBytes: nativeSha256Bytes,
    });
    await provider.publishRevocation(vault.vault_id, kind);
    const purge = await provider.purgeRevokedVault(vault.vault_id);
    if (purge.remaining !== 0) throw new Error('Cloud backup purge is incomplete');
    // Checkpoint remote completion before signing out. A force-close after
    // this write can finish journal deletion without Drive authorization;
    // backup deletion exposes local credential cleanup instead of retrying
    // the already-complete purge with credentials that may have been cleared.
    const revocationId = randomUUID();
    await db
      .update(cloudVault)
      .set({
        status: 'revoked',
        revocation_kind: kind,
        revocation_id: revocationId,
        revocation_acknowledged_at: null,
        updated_at: Date.now(),
      })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    remoteDeletionCompleted = true;
    state.clearPause(vault.vault_id, vault.device_id);
    await createGoogleAuthorization().signOut();
    await db
      .update(cloudVault)
      .set({
        revocation_acknowledged_at: Date.now(),
        updated_at: Date.now(),
      })
      .where(eq(cloudVault.vault_id, vault.vault_id));
    useSettingsStore.getState().setCloudRestore(null);
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

function deleteLocalMediaFiles(): string[] {
  const errors: string[] = [];
  for (const remove of [deleteAllPhotos, deleteAllVoiceMemos]) {
    try {
      remove();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

async function wipeJournalAndLocalCloudReplica(): Promise<string[]> {
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
    await clearMediaHashes(tx);
  });
  forgetMediaHashes();
  return deleteLocalMediaFiles();
}

async function resetThisDeviceOnlyImpl(): Promise<string[]> {
  stopProductionSyncRuntime();
  await resolvePendingConnectionSetup();
  const [vault] = await db.select({ id: cloudVault.vault_id }).from(cloudVault).limit(1);
  if (vault) {
    // Sign out before deleting local state. A crash before the atomic wipe
    // leaves the journal intact; a crash after it cannot leave queued deletes.
    await createGoogleAuthorization().signOut();
    await setCloudSyncBackgroundTaskEnabled(false);
  }
  accountLabelInMemory = null;
  accountLabelAttemptedForVault = null;
  const mediaCleanupErrors = await wipeJournalAndLocalCloudReplica();
  useSettingsStore.getState().setCloudRestore(null);
  notifyProductionCloudSyncChanged();
  return mediaCleanupErrors;
}

async function deleteJournalEverywhereImpl(): Promise<string[]> {
  await resolvePendingConnectionSetup();
  const [vault] = await db
    .select({
      status: cloudVault.status,
      revocationKind: cloudVault.revocation_kind,
    })
    .from(cloudVault)
    .limit(1);
  const remoteDeletionAlreadyCompleted =
    vault?.status === 'revoked' && vault.revocationKind === 'journal-deleted';
  if (!remoteDeletionAlreadyCompleted) {
    await revokeCloudVaultImpl('journal-deleted');
  } else {
    // A prior run may have died after the remote-complete checkpoint and
    // before clearing credentials/local data. Both operations are idempotent.
    await createGoogleAuthorization().signOut();
    await setCloudSyncBackgroundTaskEnabled(false);
  }
  const mediaCleanupErrors = await wipeJournalAndLocalCloudReplica();
  useSettingsStore.getState().setCloudRestore(null);
  notifyProductionCloudSyncChanged();
  return mediaCleanupErrors;
}

export async function retrySyncAttentionReason(
  reason: SyncAttentionReason,
): Promise<void> {
  // Retry enables the backup, so its checks and its status change run under the
  // connection barrier: no setup or Reconnect can stage another account's
  // credentials in between, and a later Pause or Disconnect writes after it.
  const retrying = cloudConnectionLifecycle.change(async () => {
    if (connectionSetupInProgress || pendingConnection) {
      throw new Error('Finish or cancel the Google account setup first');
    }
    await resolveAbandonedConnectionSetup();
    const [vault] = await db.select().from(cloudVault).limit(1);
    if (!vault) throw new Error('No cloud backup');
    const state = new SQLiteSyncStateStore(sqlite);
    state.clearPause(vault.vault_id, vault.device_id, reason);
    // Clearing the protocol pause without clearing the presentation-level vault
    // status leaves Sync now disabled even when the attachment has become
    // readable. A retry is actionable work, so always mark this vault dirty
    // before reconstructing the runtime.
    await db
      .update(cloudVault)
      .set({ status: 'dirty', updated_at: Date.now() })
      .where(eq(cloudVault.vault_id, vault.vault_id));
  });
  // Any later connection change, such as Pause or Disconnect, cancels the
  // whole retry.
  const epoch = cloudConnectionLifecycle.epoch;
  await retrying;
  if (cloudConnectionLifecycle.epoch !== epoch) throw new SyncCancelledError();
  await restartProductionSyncRuntime();
  if (cloudConnectionLifecycle.epoch !== epoch) throw new SyncCancelledError();
  await runManualSyncSince(epoch);
}

// All connection mutations share the same barrier as production sync passes.
// Drain before touching credentials, then rebuild from the committed state.
// The change returns without waiting for the rebuilt runtime: its first pass can
// be a whole restore, and Pause or Disconnect must stay available to cancel it.
// The runtime records that pass's failure for the status card.
function connectionChange<A extends unknown[], R>(
  operation: (...args: A) => Promise<R>,
  restart: 'always' | 'success' | 'never' = 'always',
) {
  return async (...args: A): Promise<R> => {
    stopProductionSyncRuntime();
    let succeeded = false;
    try {
      const result = await cloudConnectionLifecycle.change(() => operation(...args));
      succeeded = true;
      return result;
    } finally {
      if (
        !connectionSetupInProgress &&
        !pendingConnection &&
        (restart === 'always' || (restart === 'success' && succeeded))
      ) {
        void restartProductionSyncRuntime().catch(() => undefined);
      }
      notifyProductionCloudSyncChanged();
    }
  };
}

export async function prepareGoogleDriveConnection(): Promise<PreparedGoogleConnection> {
  connectionSetupInProgress = true;
  // Restarts only when nothing was staged, so the current backup resumes.
  return connectionChange(prepareGoogleDriveConnectionImpl, 'always')();
}
export async function cancelPreparedGoogleDriveConnection(): Promise<void> {
  // Screen cleanup after a committed setup is a no-op, not a runtime stop.
  if (!connectionSetupInProgress && !pendingConnection) return;
  // Restarts so the backup that was put back resumes.
  await connectionChange(async () => {
    try {
      await cancelPreparedGoogleDriveConnectionImpl();
    } finally {
      connectionSetupInProgress = false;
    }
  }, 'always')();
}
export const completeGoogleDriveConnection = connectionChange(
  completeGoogleDriveConnectionImpl,
  'success',
);
export const reconnectGoogleDrive = connectionChange(reconnectGoogleDriveImpl);
export const disconnectGoogleDrive = connectionChange(disconnectGoogleDriveImpl);
export const setCloudSyncPaused = connectionChange(setCloudSyncPausedImpl);
export const revokeCloudVault = connectionChange(revokeCloudVaultImpl);
export const resetThisDeviceOnly = connectionChange(resetThisDeviceOnlyImpl);
export const deleteJournalEverywhere = connectionChange(deleteJournalEverywhereImpl);
