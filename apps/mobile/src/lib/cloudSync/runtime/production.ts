import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { and, inArray, isNotNull } from 'drizzle-orm';
import { cloudVault, db, sqlite } from '~/db';
import { track } from '~/lib/analytics';
import {
  toCloudSyncCountBucket,
  toCloudSyncDurationBucket,
} from '~/lib/analytics/events';
import { useSettingsStore } from '~/lib/settings';
import { createGoogleAuthorization } from '../auth';
import {
  SQLiteEngineCheckpointStore,
  SQLiteSyncEngine,
  type SyncPassPhase,
} from '../engine';
import { GoogleDriveProvider } from '../providers';
import {
  hydrateProductionOutbox,
  hashPendingProductionMedia,
  materializeProductionDomain,
  persistProductionEngineResult,
  registerProductionBlobSources,
  readNormalizedSeedPage,
  wipeProductionJournalAfterRevocation,
} from '../storage/engineDomain';
import {
  isNormalizedModelReady,
  runNormalizedModelBackfill,
} from '../storage/backfill';
import { SyncRuntime, type RuntimePlatform, type RuntimeSyncEngine } from './SyncRuntime';
import { addCloudSyncMutationListener } from './mutationSignal';

class ProductionRuntimeEngine implements RuntimeSyncEngine {
  constructor(
    private readonly engine: SQLiteSyncEngine,
    private readonly onRemoteApplied?: () => void | Promise<void>,
  ) {}
  get provider() { return this.engine.provider; }
  hasPendingWork() {
    return this.engine.hasPendingPullWork ||
      (this.engine.needsSeedPage && this.engine.outbox.size === 0);
  }

  async sync() {
    setProductionCloudSyncActivity('preparing');
    try {
      const network = await Network.getNetworkStateAsync();
      const mediaAllowed =
        !useSettingsStore.getState().cloudSyncWifiOnlyMedia ||
        network.type === Network.NetworkStateType.WIFI;
      if (mediaAllowed) {
        await hashPendingProductionMedia();
        await registerProductionBlobSources(this.engine);
      }
      await hydrateProductionOutbox(this.engine);
      if (this.engine.needsSeedPage) {
        const page = await readNormalizedSeedPage(this.engine.seedingCheckpoint);
        this.engine.seedBatch(page.items, page.isFinalPage);
      }
      const priorConflicts = new Set(this.engine.conflicts.keys());
      const result = await this.engine.sync({
        onPhase: setProductionCloudSyncActivity,
        // A save can commit while pull is in flight. Refreshing the transactional
        // queue immediately before Apply makes the generation-CAS observe it.
        beforeApply: () => hydrateProductionOutbox(this.engine),
      });
      if (result.revoked && this.engine.revocationKind === 'journal-deleted') {
        await wipeProductionJournalAfterRevocation();
      }
      for (const [conflictId, conflict] of this.engine.conflicts) {
        if (!priorConflicts.has(conflictId)) {
          track('cloud_sync_conflict_recovered', { entity_type: conflict.entityType });
        }
      }
      await materializeProductionDomain(this.engine, result.appliedEntityKeys);
      await persistProductionEngineResult(this.engine, result.changedEntityKeys);
      this.engine.acknowledgeMaterialized(result.appliedEntityKeys);
      if (result.remoteApplied > 0) {
        await this.onRemoteApplied?.();
      } else if (this.engine.revocationKind === 'journal-deleted') {
        await this.onRemoteApplied?.();
      }
      return result;
    } finally {
      setProductionCloudSyncActivity('idle');
    }
  }
}

const productionCloudSyncListeners = new Set<() => void>();
export type ProductionCloudSyncActivity = 'idle' | SyncPassPhase;
let productionCloudSyncActivity: ProductionCloudSyncActivity = 'idle';

export function getProductionCloudSyncActivity(): ProductionCloudSyncActivity {
  return productionCloudSyncActivity;
}

function setProductionCloudSyncActivity(activity: ProductionCloudSyncActivity): void {
  productionCloudSyncActivity = activity;
  notifyProductionCloudSyncChanged();
}

export function subscribeProductionCloudSync(listener: () => void): () => void {
  productionCloudSyncListeners.add(listener);
  return () => productionCloudSyncListeners.delete(listener);
}

export function notifyProductionCloudSyncChanged(): void {
  productionCloudSyncListeners.forEach((listener) => listener());
}

const platform: RuntimePlatform = {
  addAppStateListener(listener) {
    return AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background' || state === 'inactive') {
        listener(state);
      }
    });
  },
  addNetworkListener(listener) {
    return Network.addNetworkStateListener((state) =>
      listener(state.isConnected === true && state.isInternetReachable !== false),
    );
  },
  async getNetworkOnline() {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable !== false;
  },
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};

async function retryBackfill(): Promise<void> {
  const settings = useSettingsStore.getState();
  await runNormalizedModelBackfill({
    profileName: settings.profileName,
    profileEmail: settings.profileEmail,
    profileImageUri: settings.profileImageUri,
  });
}

export async function createProductionRuntimeEngine(
  onRemoteApplied?: () => void | Promise<void>,
): Promise<RuntimeSyncEngine | null> {
  const [configured] = await db.select().from(cloudVault).where(and(
    isNotNull(cloudVault.remote_root_id),
    inArray(cloudVault.status, ['dirty', 'idle', 'restoring']),
  )).limit(1);
  if (!configured?.remote_root_id || configured.provider_kind !== 'google-drive') return null;

  // This is the sole runtime construction path. Android token minting therefore
  // stays behind AndroidGoogleAuthorization's durable connection-mark check.
  const provider = new GoogleDriveProvider({ auth: createGoogleAuthorization() });
  const engine = new SQLiteSyncEngine(
    configured.device_id,
    { vaultId: configured.vault_id, remoteRootId: configured.remote_root_id },
    provider,
    new SQLiteEngineCheckpointStore(sqlite),
    { requiresMaterializationAck: true },
  );
  return new ProductionRuntimeEngine(engine, onRemoteApplied);
}

export async function isProductionCloudSyncConfigured(): Promise<boolean> {
  const [configured] = await db.select({ vaultId: cloudVault.vault_id }).from(cloudVault).where(and(
    isNotNull(cloudVault.remote_root_id),
    inArray(cloudVault.status, ['dirty', 'idle', 'restoring']),
  )).limit(1);
  return configured !== undefined;
}

export function createProductionSyncRuntime(options: {
  onRemoteApplied?: () => void | Promise<void>;
} = {}): SyncRuntime {
  return new SyncRuntime({
    platform,
    readiness: { isReady: isNormalizedModelReady, retryBackfill },
    createEngine: () => createProductionRuntimeEngine(options.onRemoteApplied),
    addMutationListener: addCloudSyncMutationListener,
    analytics: {
      connected: (provider) => track('cloud_sync_connected', { provider }),
      started: (trigger) => track('cloud_sync_started', { trigger }),
      succeeded: (payload) => track('cloud_sync_succeeded', payload),
      failed: (category) => track('cloud_sync_failed', { category }),
    },
  });
}

let productionRuntime: SyncRuntime | null = null;

export function getProductionSyncRuntime(options: {
  onRemoteApplied?: () => void | Promise<void>;
} = {}): SyncRuntime {
  productionRuntime ??= createProductionSyncRuntime(options);
  return productionRuntime;
}

export async function restartProductionSyncRuntime(): Promise<void> {
  if (!productionRuntime) return;
  productionRuntime.stop();
  await productionRuntime.start();
  notifyProductionCloudSyncChanged();
}

export function stopProductionSyncRuntime(): void {
  productionRuntime?.stop();
}

export async function runProductionManualSync(): Promise<boolean> {
  if (!productionRuntime) return false;
  // Fast Refresh, a prior Disconnect, or an app lifecycle cleanup may have
  // stopped the singleton. A user-initiated pass should make one explicit
  // attempt to restore the runtime before reporting failure.
  await productionRuntime.start();
  const result = await productionRuntime.run('manual');
  notifyProductionCloudSyncChanged();
  return result !== null;
}

export function getProductionCloudSyncFailureCategory() {
  return productionRuntime?.getLastFailureCategory() ?? null;
}

export async function runProductionBackgroundPass(): Promise<boolean> {
  if (!(await isNormalizedModelReady())) {
    try { await retryBackfill(); } catch { return false; }
  }
  if (!(await isNormalizedModelReady())) return false;
  const engine = await createProductionRuntimeEngine();
  if (!engine) return true;
  track('cloud_sync_started', { trigger: 'periodic' });
  const startedAt = Date.now();
  try {
    const result = await engine.sync();
    track('cloud_sync_succeeded', {
      duration_bucket: toCloudSyncDurationBucket(Date.now() - startedAt),
      pulled_bucket: toCloudSyncCountBucket(result.pulled),
      pushed_bucket: toCloudSyncCountBucket(result.pushed),
    });
    return true;
  } catch {
    track('cloud_sync_failed', { category: 'unknown' });
    return false;
  }
}
