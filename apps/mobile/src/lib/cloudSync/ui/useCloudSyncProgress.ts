import { useSyncExternalStore } from 'react';
import {
  getProductionCloudSyncProgress,
  subscribeProductionCloudSyncProgress,
} from '../runtime/production';
import type { SyncProgressSnapshot } from '../runtime/progress';

const EMPTY_PROGRESS: SyncProgressSnapshot = { progress: null, idleWait: null };

/** Live pass progress; updates are already throttled by the tracker. */
export function useCloudSyncProgress(): SyncProgressSnapshot {
  return useSyncExternalStore(
    subscribeProductionCloudSyncProgress,
    getProductionCloudSyncProgress,
    () => EMPTY_PROGRESS,
  );
}
