import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { addCloudSyncMutationListener } from '../runtime/mutationSignal';
import { subscribeProductionCloudSync } from '../runtime/production';
import { loadCloudSyncSnapshot, type CloudSyncSnapshot } from './production';

const EMPTY_SNAPSHOT: CloudSyncSnapshot = {
  configured: false,
  provider: null,
  status: 'off',
  accountLabel: null,
  queuedCount: 0,
  conflictCount: 0,
  lastSuccessAt: null,
  lastVerifiedAt: null,
  revocationKind: null,
};

export function useCloudSyncSnapshot(): {
  snapshot: CloudSyncSnapshot;
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const refresh = useCallback(async () => {
    setSnapshot(await loadCloudSyncSnapshot());
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  useEffect(() => {
    const onChange = () => { void refresh(); };
    const removeProduction = subscribeProductionCloudSync(onChange);
    const mutation = addCloudSyncMutationListener(onChange);
    return () => {
      removeProduction();
      mutation.remove();
    };
  }, [refresh]);

  return { snapshot, refresh };
}
