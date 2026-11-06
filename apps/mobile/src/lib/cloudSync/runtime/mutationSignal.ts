type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Runs after a committed write, so it never throws: one failing listener must
 * not skip the rest or make the committed write look rolled back.
 */
export function notifyCloudSyncMutationCommitted(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('Cloud sync mutation listener failed', error);
    }
  });
}

export function addCloudSyncMutationListener(listener: Listener): { remove(): void } {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}
