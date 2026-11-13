/**
 * Counts remote applies that may have put attachment files on disk, such as
 * pending downloads arriving. Entry rows do not change when a file arrives, so
 * screens that hide missing files re-check them when this changes.
 */
let revision = 0;
const listeners = new Set<() => void>();

export function bumpMediaRevision(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function getMediaRevision(): number {
  return revision;
}

export function subscribeMediaRevision(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
