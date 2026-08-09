import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { and, isNotNull, ne } from 'drizzle-orm';
import { cloudVault, db, sqlite } from '~/db';
import { track } from '~/lib/analytics';
import {
  toCloudSyncCountBucket,
  toCloudSyncDurationBucket,
} from '~/lib/analytics/events';
import { useSettingsStore } from '~/lib/settings';
import { createGoogleAuthorization } from '../auth';
import { SQLiteEngineCheckpointStore, SQLiteSyncEngine } from '../engine';
import { GoogleDriveProvider } from '../providers';
import {
  enumerateNormalizedDomain,
  hydrateProductionOutbox,
  hashPendingProductionMedia,
  materializeProductionDomain,
  persistProductionEngineResult,
  registerProductionBlobSources,
} from '../storage/engineDomain';
import {
  isNormalizedModelReady,
  runNormalizedModelBackfill,
} from '../storage/backfill';
import { SyncRuntime, type RuntimePlatform, type RuntimeSyncEngine } from './SyncRuntime';

class ProductionRuntimeEngine implements RuntimeSyncEngine {
  constructor(
    private readonly engine: SQLiteSyncEngine,
    private readonly onRemoteApplied?: () => void | Promise<void>,
  ) {}
  get provider() { return this.engine.provider; }

  async sync() {
    await hashPendingProductionMedia();
    await registerProductionBlobSources(this.engine);
    await hydrateProductionOutbox(this.engine);
    if (!this.engine.isSeeding && this.engine.seedingCheckpoint === null) {
      const initial = await enumerateNormalizedDomain();
      if (initial.length > 0) this.engine.seed(initial);
    }
    const priorConflicts = new Set(this.engine.conflicts.keys());
    const result = await this.engine.sync();
    for (const [conflictId, conflict] of this.engine.conflicts) {
      if (!priorConflicts.has(conflictId)) {
        track('cloud_sync_conflict_recovered', { entity_type: conflict.entityType });
      }
    }
    await materializeProductionDomain(this.engine);
    await persistProductionEngineResult(this.engine);
    await this.onRemoteApplied?.();
    return result;
  }
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
    ne(cloudVault.status, 'disabled'),
    ne(cloudVault.status, 'revoked'),
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
  );
  return new ProductionRuntimeEngine(engine, onRemoteApplied);
}

export function createProductionSyncRuntime(options: {
  onRemoteApplied?: () => void | Promise<void>;
} = {}): SyncRuntime {
  return new SyncRuntime({
    platform,
    readiness: { isReady: isNormalizedModelReady, retryBackfill },
    createEngine: () => createProductionRuntimeEngine(options.onRemoteApplied),
    analytics: {
      connected: (provider) => track('cloud_sync_connected', { provider }),
      started: (trigger) => track('cloud_sync_started', { trigger }),
      succeeded: (payload) => track('cloud_sync_succeeded', payload),
      failed: (category) => track('cloud_sync_failed', { category }),
    },
  });
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
