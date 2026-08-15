import { useCallback, useEffect, useRef, useState } from 'react';
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

export function useCloudSyncSnapshot(): {
  snapshot: CloudSyncSnapshot;
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const next = await loadCloudSyncSnapshot();
    if (sequence === refreshSequence.current) setSnapshot(next);
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
