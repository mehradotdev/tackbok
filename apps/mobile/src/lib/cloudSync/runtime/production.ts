import { AppState } from 'react-native';
import {
  cloudConnectionLifecycle,
  CloudConnectionChangedError,
} from './connectionLifecycle';
import { reconcileAbandonedConnectionSetup } from './connectionSetup';
import * as Network from 'expo-network';
import { and, inArray, isNotNull } from 'drizzle-orm';
import { cloudVault, db } from '~/db';
import { track } from '~/lib/analytics';
import {
  toCloudSyncCountBucket,
  toCloudSyncDurationBucket,
} from '~/lib/analytics/events';
import { useSettingsStore } from '~/lib/settings';
import { isNormalizedModelReady, runNormalizedModelBackfill } from '../storage/backfill';
import { SyncRuntime, type RuntimePlatform, type RuntimeSyncEngine } from './SyncRuntime';
import { SyncActivity, type ProductionCloudSyncActivity } from './activity';
import { SyncProgressTracker, type SyncProgressSnapshot } from './progress';
import { addCloudSyncMutationListener } from './mutationSignal';
import { createProductionSnapshotRuntimeEngine } from '../snapshot/runtime';
import { readCloudSyncFailureCategory } from '../failureClassification';
import { SyncCancelledError } from '../snapshot/sync/errors';
export type { ProductionCloudSyncActivity } from './activity';

const productionCloudSyncListeners = new Set<() => void>();
const productionCloudSyncActivity = new SyncActivity(notifyProductionCloudSyncChanged);
// Progress changes often, so it has its own listeners: reloading the database
// snapshot on every update would be wasted work.
const productionCloudSyncProgressListeners = new Set<() => void>();
// One failing display listener must not skip the rest.
const productionCloudSyncProgress = new SyncProgressTracker(() =>
  productionCloudSyncProgressListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('Cloud sync progress listener failed', error);
    }
  }),
);

export function getProductionCloudSyncProgress(): SyncProgressSnapshot {
  return productionCloudSyncProgress.current;
}

export function subscribeProductionCloudSyncProgress(listener: () => void): () => void {
  productionCloudSyncProgressListeners.add(listener);
  return () => productionCloudSyncProgressListeners.delete(listener);
}

export function getProductionCloudSyncActivity(): ProductionCloudSyncActivity {
  return productionCloudSyncActivity.current;
}

export function setProductionCloudSyncActivity(
  activity: ProductionCloudSyncActivity,
): void {
  productionCloudSyncActivity.report(activity);
}

export function subscribeProductionCloudSync(listener: () => void): () => void {
  productionCloudSyncListeners.add(listener);
  return () => productionCloudSyncListeners.delete(listener);
}

export function notifyProductionCloudSyncChanged(): void {
  productionCloudSyncListeners.forEach((listener) => listener());
}

const platform: RuntimePlatform = {
  getAppState: () => (AppState.currentState === 'active' ? 'active' : 'background'),
  addAppStateListener(listener) {
    return AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background' || state === 'inactive') {
        listener(state);
      }
    });
  },
  addNetworkListener(listener) {
    return Network.addNetworkStateListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      productionCloudSyncProgress.networkChanged(online);
      listener(online);
    });
  },
  async getNetworkOnline() {
    const state = await Network.getNetworkStateAsync();
    const online = state.isConnected === true && state.isInternetReachable !== false;
    productionCloudSyncProgress.networkChanged(online);
    return online;
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
    priorAppUse: settings._hadSavedSettings || settings.hasCompletedOnboarding,
  });
}

export async function createProductionRuntimeEngine(
  onRemoteApplied?: () => void | Promise<void>,
): Promise<RuntimeSyncEngine | null> {
  // A setup the app died in may have stored another account's credentials.
  await reconcileAbandonedConnectionSetup();
  const [configured] = await db
    .select()
    .from(cloudVault)
    .where(
      and(
        isNotNull(cloudVault.remote_root_id),
        inArray(cloudVault.status, ['dirty', 'idle', 'restoring']),
      ),
    )
    .limit(1);
  if (!configured?.remote_root_id || configured.provider_kind !== 'google-drive')
    return null;

  return createProductionSnapshotRuntimeEngine({
    vault: configured,
    onActivity: setProductionCloudSyncActivity,
    onProgress: (report) => productionCloudSyncProgress.report(report),
    onRemoteApplied,
  });
}

export async function isProductionCloudSyncConfigured(): Promise<boolean> {
  const [configured] = await db
    .select({ vaultId: cloudVault.vault_id })
    .from(cloudVault)
    .where(
      and(
        isNotNull(cloudVault.remote_root_id),
        inArray(cloudVault.status, ['dirty', 'idle', 'restoring']),
      ),
    )
    .limit(1);
  return configured !== undefined;
}

export function createProductionSyncRuntime(
  options: {
    onRemoteApplied?: () => void | Promise<void>;
  } = {},
): SyncRuntime {
  return new SyncRuntime({
    platform,
    readiness: { isReady: isNormalizedModelReady, retryBackfill },
    createEngine: () => createProductionRuntimeEngine(options.onRemoteApplied),
    waitForConnectionChange: () => cloudConnectionLifecycle.waitForChanges(),
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

export function getProductionSyncRuntime(
  options: {
    onRemoteApplied?: () => void | Promise<void>;
  } = {},
): SyncRuntime {
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
  const finish = productionCloudSyncActivity.beginManual();
  try {
    await productionRuntime.start();
    const result = await productionRuntime.run('manual');
    notifyProductionCloudSyncChanged();
    return result !== null;
  } finally {
    finish();
  }
}

export function getProductionCloudSyncFailureCategory() {
  return productionRuntime?.getLastFailureCategory() ?? null;
}

export async function runProductionBackgroundPass(): Promise<boolean> {
  if (!(await isNormalizedModelReady())) {
    try {
      await retryBackfill();
    } catch {
      return false;
    }
  }
  if (!(await isNormalizedModelReady())) return false;
  // A connection can change while the async factory is constructing an engine.
  // Keep rejecting that engine, but give this background invocation one fresh attempt.
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedAt = Date.now();
    try {
      const engine = await createProductionRuntimeEngine();
      if (!engine) return true;
      track('cloud_sync_started', { trigger: 'periodic' });
      const result = await engine.sync();
      track('cloud_sync_succeeded', {
        duration_bucket: toCloudSyncDurationBucket(Date.now() - startedAt),
        pulled_bucket: toCloudSyncCountBucket(result.pulled),
        pushed_bucket: toCloudSyncCountBucket(result.pushed),
      });
      return true;
    } catch (error) {
      if (error instanceof CloudConnectionChangedError && attempt === 0) continue;
      // A connection change cancelled this pass; that is not a sync failure.
      if (error instanceof SyncCancelledError) return true;
      track('cloud_sync_failed', { category: readCloudSyncFailureCategory(error) });
      return false;
    }
  }
  return false;
}
