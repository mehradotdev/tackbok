import { useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { addCloudSyncMutationListener } from '../runtime/mutationSignal';
import { subscribeProductionCloudSync } from '../runtime/production';
import { loadCloudSyncSnapshot, type CloudSyncSnapshot } from './production';

const EMPTY_SNAPSHOT: CloudSyncSnapshot = {
  configured: false,
  provider: null,
  status: 'off',
  accountLabel: null,
  activityPhase: null,
  initialRestore: false,
  queuedCount: 0,
  conflictCount: 0,
  lastSuccessAt: null,
  lastVerifiedAt: null,
  revocationKind: null,
  attentionReason: null,
  recoveryAction: null,
};

let cachedSnapshot = EMPTY_SNAPSHOT;
let refreshInFlight: Promise<void> | null = null;
let refreshQueued = false;
let removeSources: (() => void) | null = null;
const listeners = new Set<() => void>();

async function refreshSharedSnapshot(): Promise<void> {
  if (refreshInFlight) {
    refreshQueued = true;
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    do {
      refreshQueued = false;
      cachedSnapshot = await loadCloudSyncSnapshot();
      listeners.forEach((listener) => listener());
    } while (refreshQueued);
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!removeSources) {
    const production = subscribeProductionCloudSync(() => { void refreshSharedSnapshot(); });
    const mutation = addCloudSyncMutationListener(() => { void refreshSharedSnapshot(); });
    removeSources = () => {
      production();
      mutation.remove();
    };
  }
  void refreshSharedSnapshot();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      removeSources?.();
      removeSources = null;
    }
  };
}

export function useCloudSyncSnapshot(): {
  snapshot: CloudSyncSnapshot;
  refresh: () => Promise<void>;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => cachedSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  const refresh = useCallback(() => refreshSharedSnapshot(), []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return { snapshot, refresh };
}
