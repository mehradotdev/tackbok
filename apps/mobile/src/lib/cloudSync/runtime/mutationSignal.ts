type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyCloudSyncMutationCommitted(): void {
  listeners.forEach((listener) => listener());
}

export function addCloudSyncMutationListener(listener: Listener): { remove(): void } {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}
