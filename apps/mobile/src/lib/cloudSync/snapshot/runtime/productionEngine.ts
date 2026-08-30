import { and, count, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import * as Network from 'expo-network';

import {
  cloudConflicts,
  cloudVault,
  db,
  mediaAssets,
  sqlite,
  syncProviderState,
  userProfile,
} from '~/db';
import { track } from '~/lib/analytics';
import type { CloudSyncFailureCategory } from '~/lib/analytics/events';
import { useSettingsStore } from '~/lib/settings';
import { failureCategoryForAttention } from '../../failureClassification';
import { createGoogleAuthorization } from '../../auth';
import { readOrCreateGoogleConnectionId } from '../../auth/secureTokenStore';
import type {
  RuntimePassResult,
  RuntimeSyncEngine,
  SyncPassPhase,
} from '../../runtime/SyncRuntime';
import { hashPendingProductionMedia } from './mediaHashing';
import { reapRetainedMedia } from '../../storage/retainedMedia';
import {
  GoogleDriveSnapshotProvider,
  SQLiteDriveProviderStateStore,
} from '../drive';
import { BaseShadowManager } from '../sync/baseShadow';
import { SnapshotSyncEngine } from '../sync/engine';
import { ExpoBaseShadowFileStore } from '../sync/expoBaseShadowFiles';
import { SQLiteSyncStateStore } from '../sync/sqliteState';
import type {
  DeviceHead,
  ListedDeviceHead,
  SnapshotObject,
  MediaDownloadSink,
  MediaUploadSource,
  SnapshotProvider,
  SyncAttentionReason,
} from '../sync/types';
import { SnapshotProviderError } from '../sync/types';
import {
  ProductionSnapshotJournalStore,
  ProductionSnapshotMediaStore,
} from '../storage';

interface ProductionSnapshotVault {
  vault_id: string;
  device_id: string;
  status: string;
}

class SnapshotRuntimeFailure extends Error {
  constructor(readonly category: CloudSyncFailureCategory) {
    super(`Snapshot sync stopped: ${category}`);
    this.name = 'SnapshotRuntimeFailure';
  }
}

const runningVaultPasses = new Map<string, Promise<RuntimePassResult>>();

class MediaPolicyProvider implements SnapshotProvider {
  constructor(private readonly delegate: GoogleDriveSnapshotProvider) {}

  listRevocations(vaultId: string) { return this.delegate.listRevocations(vaultId); }
  listHeads(vaultId: string, refresh?: boolean): Promise<ListedDeviceHead[]> {
    return this.delegate.listHeads(vaultId, refresh);
  }
  downloadSnapshot(vaultId: string, snapshotId: string) {
    return this.delegate.downloadSnapshot(vaultId, snapshotId);
  }
  uploadSnapshot(vaultId: string, snapshotId: string, bytes: Uint8Array, createdAt: number) {
    return this.delegate.uploadSnapshot(vaultId, snapshotId, bytes, createdAt);
  }
  verifySnapshot(vaultId: string, snapshotId: string, expectedBytes: Uint8Array) {
    return this.delegate.verifySnapshot(vaultId, snapshotId, expectedBytes);
  }
  updateDeviceHead(vaultId: string, head: DeviceHead) {
    return this.delegate.updateDeviceHead(vaultId, head);
  }
  hasMediaBatch(vaultId: string, blobHashes: readonly string[]) {
    return this.delegate.hasMediaBatch(vaultId, blobHashes);
  }
  async uploadMedia(
    vaultId: string,
    blobHash: string,
    source: MediaUploadSource,
  ): Promise<void> {
    await this.assertMediaTransferAllowed();
    await this.delegate.uploadMedia(vaultId, blobHash, source);
  }
  async downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: MediaDownloadSink,
  ): Promise<boolean> {
    await this.assertMediaTransferAllowed();
    return this.delegate.downloadMedia(vaultId, blobHash, sink);
  }
  listSnapshots(vaultId: string): Promise<SnapshotObject[]> {
    return this.delegate.listSnapshots(vaultId);
  }
  deleteSnapshot(vaultId: string, snapshotId: string) {
    return this.delegate.deleteSnapshot(vaultId, snapshotId);
  }

  private async assertMediaTransferAllowed(): Promise<void> {
    if (!useSettingsStore.getState().cloudSyncWifiOnlyMedia) return;
    const network = await Network.getNetworkStateAsync();
    if (network.type !== Network.NetworkStateType.WIFI) {
      throw new SnapshotProviderError('wifi-only-media', 'Media is waiting for Wi-Fi');
    }
  }
}

export class ProductionSnapshotRuntimeEngine implements RuntimeSyncEngine {
  readonly provider = { kind: 'google-drive' as const };
  private needsFollowup = false;

  constructor(
    private readonly vault: ProductionSnapshotVault,
    private readonly state: SQLiteSyncStateStore,
    private readonly engine: SnapshotSyncEngine,
    private readonly journal: ProductionSnapshotJournalStore,
    private readonly mediaProvider: SnapshotProvider,
    private readonly onActivity: (phase: SyncPassPhase | 'idle') => void,
    private readonly onRemoteApplied?: () => void | Promise<void>,
  ) {}

  hasPendingWork(): boolean {
    if (this.needsFollowup) return true;
    const durable = this.state.loadState(this.vault.vault_id, this.vault.device_id);
    const pending = sqlite.getFirstSync<{ value: number }>(
      `SELECT COUNT(*) AS value FROM cloud_pending_publication
       WHERE vault_id = ? AND device_id = ?`,
      this.vault.vault_id,
      this.vault.device_id,
    );
    return durable.journalGeneration > durable.settledGeneration || (pending?.value ?? 0) > 0;
  }

  async sync(): Promise<RuntimePassResult> {
    const vaultId = this.vault.vault_id;
    const existing = runningVaultPasses.get(vaultId);
    if (existing) return existing;
    const pass = this.runExclusivePass();
    runningVaultPasses.set(vaultId, pass);
    try {
      return await pass;
    } finally {
      if (runningVaultPasses.get(vaultId) === pass) runningVaultPasses.delete(vaultId);
    }
  }

  private async runExclusivePass(): Promise<RuntimePassResult> {
    try {
      return await this.syncPass();
    } finally {
      this.onActivity('idle');
    }
  }

  private async syncPass(): Promise<RuntimePassResult> {
    this.needsFollowup = false;
    this.onActivity('preparing');
    const hashing = await hashPendingProductionMedia(2);
    const [unhashed] = await db.select({ value: count() }).from(mediaAssets).where(and(
      isNotNull(mediaAssets.local_uri),
      or(isNull(mediaAssets.blob_hash), isNull(mediaAssets.byte_size)),
      ne(mediaAssets.download_state, 'missing'),
    ));
    if ((unhashed?.value ?? 0) > 0) {
      if (hashing.failed > 0 && hashing.processed === 0) {
        this.state.setPause(
          this.vault.vault_id,
          this.vault.device_id,
          'local-media-unreadable',
          'local-media-hash-failed',
        );
        throw new SnapshotRuntimeFailure('corrupt');
      }
      this.needsFollowup = true;
      return { pulled: 0, pushed: 0 };
    }
    const [missingLocal] = await db.select({ value: count() }).from(mediaAssets)
      .where(and(
        eq(mediaAssets.download_state, 'missing'),
        or(isNull(mediaAssets.blob_hash), isNull(mediaAssets.byte_size)),
      ));
    if ((missingLocal?.value ?? 0) > 0 || hashing.missing > 0) {
      this.state.setPause(
        this.vault.vault_id,
        this.vault.device_id,
        'local-media-unreadable',
        'local-media-file-missing',
      );
      throw new SnapshotRuntimeFailure('corrupt');
    }

    const beforeConflicts = new Set((await db.select({ id: cloudConflicts.conflict_id })
      .from(cloudConflicts)
      .where(eq(cloudConflicts.vault_id, this.vault.vault_id))).map(({ id }) => id));
    this.onActivity('checking');
    const result = await this.engine.sync();
    if (result.status === 'attention') {
      throw new SnapshotRuntimeFailure(failureCategoryForAttention(result.reason));
    }
    if (result.status === 'retry') {
      throw new SnapshotRuntimeFailure(
        result.reason === 'rate-limited'
          ? 'rate-limit'
          : result.reason === 'wifi-only-media'
            ? 'wifi-only-media'
            : 'transient',
      );
    }

    let hydrated = 0;
    try {
      const hydration = await this.journal.hydratePendingMedia(this.mediaProvider, 2);
      hydrated = hydration.hydrated;
      if (hydration.missing > 0) {
        this.state.setPause(
          this.vault.vault_id,
          this.vault.device_id,
          'missing-media',
          'remote-media-disappeared-during-hydration',
        );
        throw new SnapshotRuntimeFailure('corrupt');
      }
    } catch (error) {
      if (error instanceof SnapshotRuntimeFailure) throw error;
      if (error instanceof SnapshotProviderError &&
          ['transient', 'rate-limited', 'wifi-only-media'].includes(error.code)) {
        // Metadata/text sync has completed. Media remains visibly pending and
        // will retry on a later foreground pass or when Wi-Fi is available.
      } else if (error instanceof SnapshotProviderError) {
        const reason: SyncAttentionReason = error.code === 'authorization-required'
          ? 'authorization-required'
          : error.code === 'permission-denied'
            ? 'provider-permission-denied'
            : 'missing-media';
        this.state.setPause(
          this.vault.vault_id,
          this.vault.device_id,
          reason,
          `media-hydration-${error.code}`,
        );
        throw new SnapshotRuntimeFailure(failureCategoryForAttention(reason));
      } else {
        throw error;
      }
    }

    this.onActivity('finishing');
    const now = Date.now();
    await db.insert(syncProviderState).values({
      provider_kind: 'google-drive',
      last_attempt_at: now,
      last_success_at: now,
      updated_at: now,
    }).onConflictDoUpdate({
      target: syncProviderState.provider_kind,
      set: {
        last_attempt_at: now,
        last_success_at: now,
        pause_code: null,
        error_code: null,
        updated_at: now,
      },
    });
    const durable = this.state.loadState(this.vault.vault_id, this.vault.device_id);
    await db.update(cloudVault).set({
      status: durable.journalGeneration > durable.settledGeneration ? 'dirty' : 'idle',
      updated_at: now,
    }).where(eq(cloudVault.vault_id, this.vault.vault_id));
    await reapRetainedMedia();

    const conflicts = await db.select().from(cloudConflicts)
      .where(eq(cloudConflicts.vault_id, this.vault.vault_id));
    for (const row of conflicts) {
      if (beforeConflicts.has(row.conflict_id)) continue;
      let parsed: { entityType?: unknown };
      try {
        parsed = JSON.parse(row.conflict_json) as { entityType?: unknown };
      } catch {
        this.state.setPause(
          this.vault.vault_id,
          this.vault.device_id,
          'cleanup-inconsistent',
          'invalid-local-conflict-record',
        );
        throw new SnapshotRuntimeFailure('corrupt');
      }
      if (parsed.entityType === 'entry' || parsed.entityType === 'tag' ||
          parsed.entityType === 'prompt' || parsed.entityType === 'profile') {
        track('cloud_sync_conflict_recovered', { entity_type: parsed.entityType });
      }
    }
    const [profile] = await db.select().from(userProfile).limit(1);
    const [photo] = profile?.photo_asset_id
      ? await db.select().from(mediaAssets)
        .where(eq(mediaAssets.asset_id, profile.photo_asset_id)).limit(1)
      : [];
    useSettingsStore.setState({
      profileName: profile?.display_name ?? null,
      profileImageUri: photo?.local_uri ?? null,
    });
    if (result.status === 'published' || hydrated > 0) await this.onRemoteApplied?.();
    const [pendingMedia] = await db.select({ value: count() }).from(mediaAssets)
      .where(eq(mediaAssets.download_state, 'pending'));
    this.needsFollowup = result.actionableChanges > 0;
    if ((pendingMedia?.value ?? 0) > 0 && hydrated > 0) this.needsFollowup = true;
    return {
      pulled: result.status === 'published' ? 1 : 0,
      pushed: result.status === 'published' ? 1 : 0,
    };
  }
}

export async function createProductionSnapshotRuntimeEngine(options: {
  vault: ProductionSnapshotVault;
  onActivity: (phase: SyncPassPhase | 'idle') => void;
  onRemoteApplied?: () => void | Promise<void>;
}): Promise<ProductionSnapshotRuntimeEngine> {
  const connectionId = await readOrCreateGoogleConnectionId();
  const state = new SQLiteSyncStateStore(sqlite);
  state.loadState(options.vault.vault_id, options.vault.device_id);
  const media = new ProductionSnapshotMediaStore();
  const journal = new ProductionSnapshotJournalStore(
    options.vault.vault_id,
    options.vault.device_id,
    media,
  );
  const drive = new GoogleDriveSnapshotProvider({
    auth: createGoogleAuthorization(),
    state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
  });
  const provider = new MediaPolicyProvider(drive);
  const engine = new SnapshotSyncEngine(
    options.vault.vault_id,
    options.vault.device_id,
    state,
    new BaseShadowManager(new ExpoBaseShadowFileStore()),
    journal,
    media,
    provider,
    {
      at: (point) => {
        if (point === 'during-remote-snapshot-download') options.onActivity('checking');
        else if (point === 'during-merge-application') options.onActivity('finishing');
        else if (point === 'during-media-transfer' || point === 'after-snapshot-uploaded' ||
            point === 'after-snapshot-verified' || point === 'after-head-advanced') {
          options.onActivity('uploading');
        } else options.onActivity('preparing');
      },
    },
  );
  return new ProductionSnapshotRuntimeEngine(
    options.vault,
    state,
    engine,
    journal,
    provider,
    options.onActivity,
    options.onRemoteApplied,
  );
}

export function readProductionSnapshotResultState(
  vaultId: string,
  deviceId: string,
): { actionableChanges: number; pauseReason: SyncAttentionReason | null } {
  const state = new SQLiteSyncStateStore(sqlite).loadState(vaultId, deviceId);
  return {
    actionableChanges: Math.max(0, state.journalGeneration - state.settledGeneration),
    pauseReason: state.pauseReason,
  };
}
