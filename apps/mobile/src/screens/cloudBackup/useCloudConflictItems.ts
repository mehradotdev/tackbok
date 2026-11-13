import { useCallback, useEffect, useRef, useState } from 'react';
import { listCloudConflictItems, type CloudConflictItem } from '~/lib/cloudSync/ui';

/**
 * Conflicts this device can act on, reloaded whenever `refreshToken` changes:
 * pass the shared sync snapshot, which is reloaded on focus, sync activity
 * (including finished photo downloads) and local journal changes.
 */
export function useCloudConflictItems(refreshToken: unknown) {
  const [items, setItems] = useState<CloudConflictItem[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const mountedRef = useRef(true);
  const loadingRef = useRef<Promise<void> | null>(null);
  const reloadQueuedRef = useRef(false);

  // Loads run one at a time; a request during a load queues one more, so the
  // last result shown is never older than the last request.
  const refresh = useCallback((): Promise<void> => {
    if (loadingRef.current) {
      reloadQueuedRef.current = true;
      return loadingRef.current;
    }
    loadingRef.current = (async () => {
      do {
        reloadQueuedRef.current = false;
        try {
          const next = await listCloudConflictItems();
          if (mountedRef.current) {
            setItems(next);
            setLoadFailed(false);
          }
        } catch {
          if (mountedRef.current) {
            setItems([]);
            setLoadFailed(true);
          }
        }
      } while (reloadQueuedRef.current);
    })().finally(() => {
      loadingRef.current = null;
    });
    return loadingRef.current;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  return { items, loadFailed, refresh };
}

/** Items shown up front; older name versions stay behind a toggle. */
export function activeConflictItems(items: readonly CloudConflictItem[]) {
  return items.filter((item) => item.kind !== 'name' || !item.archived);
}
