import { and, count, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import * as Application from 'expo-application';
import * as Network from 'expo-network';
import * as Updates from 'expo-updates';

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
import {
  attentionReasonForProviderError,
  failureCategoryForAttention,
} from '../../failureClassification';
import { createGoogleAuthorization } from '../../auth';
import { readOrCreateGoogleConnectionId } from '../../auth/secureTokenStore';
import type {
  RuntimePassResult,
  RuntimeSyncEngine,
  SyncPassPhase,
} from '../../runtime/SyncRuntime';
import { PHASE_FOR_ENGINE_ACTIVITY } from '../../runtime/activity';
import { cloudConnectionLifecycle } from '../../runtime/connectionLifecycle';
import { hashPendingProductionMedia } from './mediaHashing';
import { recordWaitingMediaUploads } from './waitingMediaUploads';
import { nativeSha256Bytes } from './nativeSha256';
import { reapRetainedMedia } from '../../storage/retainedMedia';
import { GoogleDriveSnapshotProvider, SQLiteDriveProviderStateStore } from '../drive';
import { BaseShadowManager } from '../sync/baseShadow';
import { SnapshotSyncEngine } from '../sync/engine';
import { ExpoBaseShadowFileStore } from '../sync/expoBaseShadowFiles';
import { SQLiteSyncStateStore } from '../sync/sqliteState';
import { VerifiedSnapshotCache } from '../sync/snapshotCache';
import type {
  DeviceHead,
  ListedDeviceHead,
  SnapshotObject,
  MediaDownloadSink,
  MediaUploadSource,
  SnapshotProvider,
  SyncProgressReport,
} from '../sync/types';
import { isolateProgress, SnapshotProviderError } from '../sync/types';
import { SyncCancelledError, throwIfCancelled, untilCancelled } from '../sync/errors';
import { ProductionSnapshotJournalStore, ProductionSnapshotMediaStore } from '../storage';

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

interface RunningVaultPass {
  promise: Promise<RuntimePassResult>;
  signal: AbortSignal;
}

const runningVaultPasses = new Map<string, RunningVaultPass>();

/** Pending attachments downloaded between checks for cancellation and edits. */
const HYDRATION_BATCH = 2;

/**
 * Verified snapshots shared by every engine in this process, so passes skip
 * downloading heads that have not changed. Any connection change (disconnect,
 * account or backup switch, reset, journal deletion) clears it.
 */
export const productionSnapshotCache = new VerifiedSnapshotCache();

/** The running build and update; a change retries a merge that failed. */
export function productionCodeVersion(): string {
  return `${Application.nativeBuildVersion ?? ''}/${Updates.updateId ?? 'embedded'}`;
}
cloudConnectionLifecycle.addChangeListener(() => productionSnapshotCache.clear());

/** The running pass's signal, shared by one engine's provider and hooks. */
interface PassCancellation {
  signal: AbortSignal | null;
}

/**
 * Bytes to download for pending attachment rows. Rows that share a blob
 * download it once, and transfers report bytes per blob, so count each once.
 */
export function pendingMediaBytes(
  rows: readonly { blobHash: string | null; byteSize: number | null }[],
): number {
  const sizes = new Map<string, number>();
  for (const { blobHash, byteSize } of rows) {
    if (blobHash) sizes.set(blobHash, byteSize ?? 0);
  }
  let total = 0;
  for (const size of sizes.values()) total += size;
  return total;
}

class MediaPolicyProvider implements SnapshotProvider {
  constructor(
    private readonly delegate: GoogleDriveSnapshotProvider,
    private readonly onTransfer: (phase: 'uploading' | 'downloading-media') => void,
    private readonly onProgress: (report: SyncProgressReport) => void = () => {},
  ) {}

  listRevocations(vaultId: string) {
    return this.delegate.listRevocations(vaultId);
  }
  listHeads(vaultId: string, refresh?: boolean): Promise<ListedDeviceHead[]> {
    return this.delegate.listHeads(vaultId, refresh);
  }
  downloadSnapshot(vaultId: string, snapshotId: string) {
    return this.delegate.downloadSnapshot(vaultId, snapshotId);
  }
  uploadSnapshot(
    vaultId: string,
    snapshotId: string,
    bytes: Uint8Array,
    createdAt: number,
  ) {
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
  async mediaTransfersAllowed(): Promise<boolean> {
    if (await this.mediaWaitsForWifi()) {
      this.onProgress({ type: 'wait', reason: 'wifi-only-media' });
      return false;
    }
    return true;
  }
  async uploadMedia(
    vaultId: string,
    blobHash: string,
    source: MediaUploadSource,
  ): Promise<void> {
    await this.assertMediaTransferAllowed();
    this.onTransfer('uploading');
    await this.delegate.uploadMedia(vaultId, blobHash, source);
  }
  async downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: MediaDownloadSink,
  ): Promise<boolean> {
    await this.assertMediaTransferAllowed();
    this.onTransfer('downloading-media');
    return this.delegate.downloadMedia(vaultId, blobHash, sink);
  }
  listSnapshots(vaultId: string): Promise<SnapshotObject[]> {
    return this.delegate.listSnapshots(vaultId);
  }
  deleteSnapshot(vaultId: string, snapshotId: string) {
    return this.delegate.deleteSnapshot(vaultId, snapshotId);
  }

  private async mediaWaitsForWifi(): Promise<boolean> {
    if (!useSettingsStore.getState().cloudSyncWifiOnlyMedia) return false;
    const network = await Network.getNetworkStateAsync();
    return network.type !== Network.NetworkStateType.WIFI;
  }

  private async assertMediaTransferAllowed(): Promise<void> {
    if (await this.mediaWaitsForWifi()) {
      this.onProgress({ type: 'wait', reason: 'wifi-only-media' });
      throw new SnapshotProviderError('wifi-only-media', 'Media is waiting for Wi-Fi');
    }
  }
}

export class ProductionSnapshotRuntimeEngine implements RuntimeSyncEngine {
  readonly provider = { kind: 'google-drive' as const };
  private needsFollowup = false;
  /** Missing downloaded files are looked for once per engine, normally per launch. */
  private checkedVerifiedMedia = false;

  constructor(
    private readonly vault: ProductionSnapshotVault,
    private readonly state: SQLiteSyncStateStore,
    private readonly engine: SnapshotSyncEngine,
    private readonly journal: ProductionSnapshotJournalStore,
    private readonly mediaProvider: SnapshotProvider,
    private readonly onActivity: (phase: SyncPassPhase | 'idle') => void,
    private readonly onRemoteApplied?: () => void | Promise<void>,
    private readonly connectionEpoch = cloudConnectionLifecycle.epoch,
    private readonly cancellation: PassCancellation = { signal: null },
    private readonly onProgress: (report: SyncProgressReport) => void = () => {},
    /** OS background tasks have little time; they download one batch per pass. */
    private readonly hydrationBatchesPerPass = Number.POSITIVE_INFINITY,
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
    return (
      durable.journalGeneration > durable.settledGeneration || (pending?.value ?? 0) > 0
    );
  }

  async sync(caller?: AbortSignal): Promise<RuntimePassResult> {
    const vaultId = this.vault.vault_id;
    throwIfCancelled(caller);
    // Joining or draining another caller's pass: this caller's cancellation
    // ends only its own wait. The owner keeps its entry until it settles, so
    // no overlapping pass can start.
    let existing = runningVaultPasses.get(vaultId);
    if (existing && !existing.signal.aborted) {
      return untilCancelled(existing.promise, caller);
    }
    // A cancelled pass is still settling; never overlap it, and never report
    // its cancellation as this caller's result.
    while (existing) {
      await untilCancelled(
        existing.promise.catch(() => undefined),
        caller,
      );
      existing = runningVaultPasses.get(vaultId);
      if (existing && !existing.signal.aborted) {
        return untilCancelled(existing.promise, caller);
      }
    }
    throwIfCancelled(caller);
    const controller = new AbortController();
    const abort = () => controller.abort();
    caller?.addEventListener('abort', abort);
    const pass = cloudConnectionLifecycle.runPass(this.connectionEpoch, (signal) => {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', abort);
      return this.runExclusivePass(controller.signal);
    });
    const running = { promise: pass, signal: controller.signal };
    runningVaultPasses.set(vaultId, running);
    try {
      return await pass;
    } finally {
      caller?.removeEventListener('abort', abort);
      if (runningVaultPasses.get(vaultId) === running) runningVaultPasses.delete(vaultId);
    }
  }

  private async runExclusivePass(signal: AbortSignal): Promise<RuntimePassResult> {
    this.cancellation.signal = signal;
    try {
      this.onProgress({ type: 'pass', state: 'start' });
      throwIfCancelled(signal);
      return await this.syncPass(signal);
    } finally {
      if (this.cancellation.signal === signal) this.cancellation.signal = null;
      // Hashes read during the pass stay valid whatever its outcome.
      await this.journal.persistMediaHashes();
      try {
        this.onProgress({ type: 'pass', state: 'end' });
      } finally {
        this.onActivity('idle');
      }
    }
  }

  private async syncPass(signal: AbortSignal): Promise<RuntimePassResult> {
    this.needsFollowup = false;
    this.onActivity('checking');
    this.onProgress({ type: 'plan', phase: 'checking' });
    const hashing = await hashPendingProductionMedia(2);
    throwIfCancelled(signal);
    if (hashing.processed > 0) {
      this.onActivity('preparing');
      this.onProgress({ type: 'plan', phase: 'preparing' });
    }
    const [unhashed] = await db
      .select({ value: count() })
      .from(mediaAssets)
      .where(
        and(
          isNotNull(mediaAssets.local_uri),
          or(isNull(mediaAssets.blob_hash), isNull(mediaAssets.byte_size)),
          ne(mediaAssets.download_state, 'missing'),
        ),
      );
    throwIfCancelled(signal);
    if ((unhashed?.value ?? 0) > 0) {
      if (hashing.failed > 0 && hashing.processed === 0) {
        this.state.setPause(
          this.vault.vault_id,
          this.vault.device_id,
          'local-media-unreadable',
          'local-media-hash-failed',
        );
        throw new SnapshotRuntimeFailure('local-media');
      }
      this.needsFollowup = true;
      return { pulled: 0, pushed: 0 };
    }
    const [missingLocal] = await db
      .select({ value: count() })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.download_state, 'missing'),
          or(isNull(mediaAssets.blob_hash), isNull(mediaAssets.byte_size)),
        ),
      );
    throwIfCancelled(signal);
    if ((missingLocal?.value ?? 0) > 0 || hashing.missing > 0) {
      this.state.setPause(
        this.vault.vault_id,
        this.vault.device_id,
        'local-media-unreadable',
        'local-media-file-missing',
      );
      throw new SnapshotRuntimeFailure('local-media');
    }

    const beforeConflicts = new Set(
      (
        await db
          .select({ id: cloudConflicts.conflict_id })
          .from(cloudConflicts)
          .where(eq(cloudConflicts.vault_id, this.vault.vault_id))
      ).map(({ id }) => id),
    );
    this.onActivity('checking');
    try {
      const result = await this.engine.sync();
      return await this.finishPass(result, beforeConflicts, signal);
    } catch (error) {
      // A cancelled pass may already have committed remote journal changes or
      // hydrated media, and a later pass can find nothing left to apply. A
      // refresh only re-reads local data, so always refresh after cancellation.
      if (error instanceof SyncCancelledError) {
        await this.refreshAppliedViews().catch(() => undefined);
      }
      throw error;
    }
  }

  private async finishPass(
    result: Awaited<ReturnType<SnapshotSyncEngine['sync']>>,
    beforeConflicts: Set<string>,
    signal: AbortSignal | null,
  ): Promise<RuntimePassResult> {
    throwIfCancelled(signal);
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

    recordWaitingMediaUploads(this.vault.vault_id, result.deferredMediaCount);

    // The journal, text included, is applied by now; attachments the backup
    // holds but this device lacks wait as pending rows. Show the text before
    // downloading them.
    if (result.status === 'published' || result.status === 'pulled') {
      useSettingsStore.getState().markCloudRestoreJournalRestored(this.vault.vault_id);
      await this.refreshAppliedViews();
    }

    // An OS background task has little time and starts a new engine each run,
    // so only the app itself looks for missing files.
    if (
      !this.checkedVerifiedMedia &&
      this.hydrationBatchesPerPass === Number.POSITIVE_INFINITY
    ) {
      // shortcut: once per engine, not per pass, since it checks every
      // downloaded file; check more often if files vanish mid-session.
      try {
        await this.journal.requeueMissingVerifiedMedia();
        this.checkedVerifiedMedia = true;
      } catch (error) {
        // The attachments stay as they are; the next pass tries again.
        console.warn('Cloud sync could not check downloaded media files', error);
      }
    }

    let hydrated = 0;
    throwIfCancelled(signal);
    try {
      // Totals cover every waiting attachment. Downloads run in small batches
      // so cancellation and local edits are noticed between them; edits stop
      // the downloads, and the follow-up pass publishes them and continues.
      const waiting = await db
        .select({ blobHash: mediaAssets.blob_hash, byteSize: mediaAssets.byte_size })
        .from(mediaAssets)
        .where(eq(mediaAssets.download_state, 'pending'));
      if (waiting.length > 0) {
        this.onProgress({
          type: 'plan',
          phase: 'downloading-media',
          items: { done: 0, total: waiting.length },
          bytesTotal: pendingMediaBytes(waiting),
        });
      }
      for (let batch = 1; ; batch += 1) {
        const hydration = await this.journal.hydratePendingMedia(
          this.mediaProvider,
          HYDRATION_BATCH,
          () => this.onProgress({ type: 'item', phase: 'downloading-media' }),
        );
        hydrated += hydration.hydrated;
        // Local completion may finish after cancellation; record nothing from it.
        throwIfCancelled(signal);
        if (hydration.missing > 0) {
          this.state.setPause(
            this.vault.vault_id,
            this.vault.device_id,
            'missing-media',
            'remote-media-disappeared-during-hydration',
          );
          throw new SnapshotRuntimeFailure('corrupt');
        }
        if (hydration.hydrated > 0) await this.onRemoteApplied?.();
        // A short batch means nothing is left. The count read above bounds
        // the loop even if a row were to stay pending.
        if (
          hydration.hydrated < HYDRATION_BATCH ||
          hydrated >= waiting.length ||
          batch >= this.hydrationBatchesPerPass
        )
          break;
        const durable = this.state.loadState(this.vault.vault_id, this.vault.device_id);
        if (durable.journalGeneration > durable.settledGeneration) break;
      }
    } catch (error) {
      // A batch can save some files before it fails; show them. A cancelled
      // pass refreshes screens on its own path.
      if (!(error instanceof SyncCancelledError)) {
        try {
          await this.onRemoteApplied?.();
        } catch {
          // A failed screen refresh must not replace the hydration error.
        }
      }
      if (error instanceof SnapshotRuntimeFailure) throw error;
      throwIfCancelled(signal);
      if (
        error instanceof SnapshotProviderError &&
        ['transient', 'rate-limited', 'wifi-only-media'].includes(error.code)
      ) {
        // Metadata/text sync has completed. Media remains visibly pending and
        // will retry on a later foreground pass or when Wi-Fi is available.
      } else if (error instanceof SnapshotProviderError) {
        const reason = attentionReasonForProviderError(error.code) ?? 'missing-media';
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

    throwIfCancelled(signal);
    const now = Date.now();
    await db
      .insert(syncProviderState)
      .values({
        provider_kind: 'google-drive',
        last_attempt_at: now,
        last_success_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
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
    await db
      .update(cloudVault)
      .set({
        status: durable.journalGeneration > durable.settledGeneration ? 'dirty' : 'idle',
        updated_at: now,
      })
      .where(eq(cloudVault.vault_id, this.vault.vault_id));
    // An up-to-date pass also proves the journal is applied.
    useSettingsStore.getState().markCloudRestoreJournalRestored(this.vault.vault_id);
    await reapRetainedMedia();

    const conflicts = await db
      .select()
      .from(cloudConflicts)
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
      if (
        parsed.entityType === 'entry' ||
        parsed.entityType === 'tag' ||
        parsed.entityType === 'prompt' ||
        parsed.entityType === 'profile'
      ) {
        track('cloud_sync_conflict_recovered', { entity_type: parsed.entityType });
      }
    }
    await this.refreshProfileCache();
    if (result.status === 'published' || result.status === 'pulled' || hydrated > 0)
      await this.onRemoteApplied?.();
    const [pendingMedia] = await db
      .select({ value: count() })
      .from(mediaAssets)
      .where(eq(mediaAssets.download_state, 'pending'));
    this.needsFollowup = result.actionableChanges > 0;
    if ((pendingMedia?.value ?? 0) > 0 && hydrated > 0) this.needsFollowup = true;
    return {
      pulled: result.status === 'published' || result.status === 'pulled' ? 1 : 0,
      pushed: result.status === 'published' ? 1 : 0,
    };
  }

  private async refreshProfileCache(): Promise<void> {
    const [profile] = await db.select().from(userProfile).limit(1);
    const [photo] = profile?.photo_asset_id
      ? await db
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.asset_id, profile.photo_asset_id))
          .limit(1)
      : [];
    useSettingsStore.setState({
      profileName: profile?.display_name ?? null,
      profileImageUri: photo?.local_uri ?? null,
    });
  }

  private async refreshAppliedViews(): Promise<void> {
    await this.refreshProfileCache();
    await this.onRemoteApplied?.();
  }
}

export async function createProductionSnapshotRuntimeEngine(options: {
  vault: ProductionSnapshotVault;
  onActivity: (phase: SyncPassPhase | 'idle') => void;
  onProgress?: (report: SyncProgressReport) => void;
  onRemoteApplied?: () => void | Promise<void>;
  hydrationBatchesPerPass?: number;
}): Promise<ProductionSnapshotRuntimeEngine> {
  const connectionEpoch = cloudConnectionLifecycle.epoch;
  const cancellation: PassCancellation = { signal: null };
  const connectionId = await readOrCreateGoogleConnectionId();
  const state = new SQLiteSyncStateStore(sqlite);
  state.loadState(options.vault.vault_id, options.vault.device_id);
  const media = new ProductionSnapshotMediaStore();
  const journal = new ProductionSnapshotJournalStore(
    options.vault.vault_id,
    options.vault.device_id,
    media,
  );
  const onProgress = isolateProgress(options.onProgress);
  const drive = new GoogleDriveSnapshotProvider({
    auth: createGoogleAuthorization(),
    state: new SQLiteDriveProviderStateStore(sqlite, connectionId),
    signal: () => cancellation.signal,
    onProgress,
    hashBytes: nativeSha256Bytes,
  });
  const provider = new MediaPolicyProvider(drive, options.onActivity, onProgress);
  const engine = new SnapshotSyncEngine(
    options.vault.vault_id,
    options.vault.device_id,
    state,
    new BaseShadowManager(new ExpoBaseShadowFileStore()),
    journal,
    media,
    provider,
    {
      at: () => {
        // Kill points are where a pass may stop and resume safely; a cancelled
        // pass stops at the next one (including between media transfers).
        throwIfCancelled(cancellation.signal);
      },
      activity: (activity) => options.onActivity(PHASE_FOR_ENGINE_ACTIVITY[activity]),
      progress: onProgress,
    },
    Date.now,
    productionSnapshotCache,
    productionCodeVersion(),
  );
  return new ProductionSnapshotRuntimeEngine(
    options.vault,
    state,
    engine,
    journal,
    provider,
    options.onActivity,
    options.onRemoteApplied,
    connectionEpoch,
    cancellation,
    onProgress,
    options.hydrationBatchesPerPass,
  );
}
