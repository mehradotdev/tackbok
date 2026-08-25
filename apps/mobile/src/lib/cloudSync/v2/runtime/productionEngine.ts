import { and, count, eq, isNotNull, isNull, or } from 'drizzle-orm';
import * as Network from 'expo-network';

import {
  cloudV2Conflicts,
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
import { createGoogleAuthorization } from '../../auth';
import { readOrCreateGoogleConnectionId } from '../../auth/secureTokenStore';
import type { RuntimePassResult, RuntimeSyncEngine } from '../../runtime/SyncRuntime';
import type { SyncPassPhase } from '../../engine';
import { hashPendingProductionMedia } from './mediaHashing';
import {
  GoogleDriveSnapshotV2Provider,
  SQLiteDriveV2ProviderStateStore,
} from '../drive';
import { BaseShadowManagerV2 } from '../sync/baseShadow';
import { SnapshotV2SyncEngine } from '../sync/engine';
import { ExpoBaseShadowFileStore } from '../sync/expoBaseShadowFiles';
import { SQLiteV2SyncStateStore } from '../sync/sqliteState';
import type {
  DeviceHeadV2,
  ListedDeviceHeadV2,
  SnapshotObjectV2,
  V2MediaDownloadSink,
  V2MediaUploadSource,
  SnapshotV2Provider,
  V2AttentionReason,
} from '../sync/types';
import { V2ProviderError } from '../sync/types';
import {
  ProductionSnapshotV2JournalStore,
  ProductionSnapshotV2MediaStore,
} from '../storage';

interface ProductionV2Vault {
  vault_id: string;
  device_id: string;
  status: string;
}

class V2RuntimeFailure extends Error {
  constructor(readonly category: CloudSyncFailureCategory) {
    super(`Protocol-v2 sync stopped: ${category}`);
    this.name = 'V2RuntimeFailure';
  }
}

function failureCategory(reason: V2AttentionReason): CloudSyncFailureCategory {
  if (reason === 'authorization-required' || reason === 'account-mismatch' ||
      reason === 'consent-incomplete') return 'auth';
  if (reason === 'provider-quota-full') return 'quota';
  if (reason === 'invalid-remote-snapshot' || reason === 'unsupported-format' ||
      reason === 'derived-id-collision' || reason === 'ambiguous-device-head') return 'corrupt';
  return 'unknown';
}

class MediaPolicyProvider implements SnapshotV2Provider {
  constructor(private readonly delegate: GoogleDriveSnapshotV2Provider) {}

  listRevocations(vaultId: string) { return this.delegate.listRevocations(vaultId); }
  listHeads(vaultId: string, refresh?: boolean): Promise<ListedDeviceHeadV2[]> {
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
  updateDeviceHead(vaultId: string, head: DeviceHeadV2) {
    return this.delegate.updateDeviceHead(vaultId, head);
  }
  hasMediaBatch(vaultId: string, blobHashes: readonly string[]) {
    return this.delegate.hasMediaBatch(vaultId, blobHashes);
  }
  async uploadMedia(
    vaultId: string,
    blobHash: string,
    source: V2MediaUploadSource,
  ): Promise<void> {
    await this.assertMediaTransferAllowed();
    await this.delegate.uploadMedia(vaultId, blobHash, source);
  }
  async downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: V2MediaDownloadSink,
  ): Promise<boolean> {
    await this.assertMediaTransferAllowed();
    return this.delegate.downloadMedia(vaultId, blobHash, sink);
  }
  listSnapshots(vaultId: string): Promise<SnapshotObjectV2[]> {
    return this.delegate.listSnapshots(vaultId);
  }
  deleteSnapshot(vaultId: string, snapshotId: string) {
    return this.delegate.deleteSnapshot(vaultId, snapshotId);
  }

  private async assertMediaTransferAllowed(): Promise<void> {
    if (!useSettingsStore.getState().cloudSyncWifiOnlyMedia) return;
    const network = await Network.getNetworkStateAsync();
    if (network.type !== Network.NetworkStateType.WIFI) {
      throw new V2ProviderError('wifi-only-media', 'Media is waiting for Wi-Fi');
    }
  }
}

export class ProductionV2RuntimeEngine implements RuntimeSyncEngine {
  readonly provider = { kind: 'google-drive' as const };
  private needsFollowup = false;

  constructor(
    private readonly vault: ProductionV2Vault,
    private readonly state: SQLiteV2SyncStateStore,
    private readonly engine: SnapshotV2SyncEngine,
    private readonly journal: ProductionSnapshotV2JournalStore,
    private readonly mediaProvider: SnapshotV2Provider,
    private readonly onActivity: (phase: SyncPassPhase | 'idle') => void,
    private readonly onRemoteApplied?: () => void | Promise<void>,
  ) {}

  hasPendingWork(): boolean {
    if (this.needsFollowup) return true;
    const durable = this.state.loadState(this.vault.vault_id, this.vault.device_id);
    const pending = sqlite.getFirstSync<{ value: number }>(
      `SELECT COUNT(*) AS value FROM cloud_v2_pending_publication
       WHERE vault_id = ? AND device_id = ?`,
      this.vault.vault_id,
      this.vault.device_id,
    );
    return durable.journalGeneration > durable.settledGeneration || (pending?.value ?? 0) > 0;
  }

  async sync(): Promise<RuntimePassResult> {
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
    ));
    if ((unhashed?.value ?? 0) > 0) {
      if (hashing.failed > 0 && hashing.processed === 0) {
        this.state.setPause(
          this.vault.vault_id,
          this.vault.device_id,
          'local-media-unreadable',
          'local-media-hash-failed',
        );
        throw new V2RuntimeFailure('corrupt');
      }
      this.needsFollowup = true;
      return { pulled: 0, pushed: 0 };
    }

    const beforeConflicts = new Set((await db.select({ id: cloudV2Conflicts.conflict_id })
      .from(cloudV2Conflicts)
      .where(eq(cloudV2Conflicts.vault_id, this.vault.vault_id))).map(({ id }) => id));
    this.onActivity('checking');
    const result = await this.engine.sync();
    if (result.status === 'attention') {
      throw new V2RuntimeFailure(failureCategory(result.reason));
    }
    if (result.status === 'retry') {
      throw new V2RuntimeFailure(
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
        throw new V2RuntimeFailure('corrupt');
      }
    } catch (error) {
      if (error instanceof V2RuntimeFailure) throw error;
      if (error instanceof V2ProviderError &&
          ['transient', 'rate-limited', 'wifi-only-media'].includes(error.code)) {
        // Metadata/text sync has completed. Media remains visibly pending and
        // will retry on a later foreground pass or when Wi-Fi is available.
      } else if (error instanceof V2ProviderError) {
        const reason: V2AttentionReason = error.code === 'authorization-required'
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
        throw new V2RuntimeFailure(failureCategory(reason));
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

    const conflicts = await db.select().from(cloudV2Conflicts)
      .where(eq(cloudV2Conflicts.vault_id, this.vault.vault_id));
    for (const row of conflicts) {
      if (beforeConflicts.has(row.conflict_id)) continue;
      const parsed = JSON.parse(row.conflict_json) as { entityType?: unknown };
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

export async function createProductionV2RuntimeEngine(options: {
  vault: ProductionV2Vault;
  onActivity: (phase: SyncPassPhase | 'idle') => void;
  onRemoteApplied?: () => void | Promise<void>;
}): Promise<ProductionV2RuntimeEngine> {
  const connectionId = await readOrCreateGoogleConnectionId();
  const state = new SQLiteV2SyncStateStore(sqlite);
  state.loadState(options.vault.vault_id, options.vault.device_id);
  const media = new ProductionSnapshotV2MediaStore();
  const journal = new ProductionSnapshotV2JournalStore(
    options.vault.vault_id,
    options.vault.device_id,
    media,
  );
  const drive = new GoogleDriveSnapshotV2Provider({
    auth: createGoogleAuthorization(),
    state: new SQLiteDriveV2ProviderStateStore(sqlite, connectionId),
  });
  const provider = new MediaPolicyProvider(drive);
  const engine = new SnapshotV2SyncEngine(
    options.vault.vault_id,
    options.vault.device_id,
    state,
    new BaseShadowManagerV2(new ExpoBaseShadowFileStore()),
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
  return new ProductionV2RuntimeEngine(
    options.vault,
    state,
    engine,
    journal,
    provider,
    options.onActivity,
    options.onRemoteApplied,
  );
}

export function readProductionV2ResultState(
  vaultId: string,
  deviceId: string,
): { actionableChanges: number; pauseReason: V2AttentionReason | null } {
  const state = new SQLiteV2SyncStateStore(sqlite).loadState(vaultId, deviceId);
  return {
    actionableChanges: Math.max(0, state.journalGeneration - state.settledGeneration),
    pauseReason: state.pauseReason,
  };
}
