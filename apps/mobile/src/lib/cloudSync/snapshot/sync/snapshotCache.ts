import type { JournalSnapshotPayload } from '../types';

export interface VerifiedSnapshotCacheLimits {
  entries: number;
  decodedBytes: number;
}

// shortcut: 24 snapshots and 16 MiB of canonical JSON (one maximum frontier
// of eight heads plus their ancestors, for typical vaults); raise them once
// on-device memory measurements show larger vaults regularly miss the cache.
export const VERIFIED_SNAPSHOT_CACHE_LIMITS: Readonly<VerifiedSnapshotCacheLimits> =
  Object.freeze({
    entries: 24,
    decodedBytes: 16 * 1024 * 1024,
  });

interface CachedSnapshot {
  payload: JournalSnapshotPayload;
  decodedBytes: number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Snapshots already downloaded and fully validated, reused across sync passes.
 * A snapshot ID is the hash of its canonical payload, so an entry can never go
 * stale; it only saves a download and decode. It is never proof that the
 * remote object still exists. Least recently used entries are evicted first.
 */
export class VerifiedSnapshotCache {
  // Map order is the recency order: the first key is the least recently used.
  private readonly entries = new Map<string, CachedSnapshot>();
  private decodedBytes = 0;

  constructor(
    private readonly limits: Readonly<VerifiedSnapshotCacheLimits> = VERIFIED_SNAPSHOT_CACHE_LIMITS,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get retainedBytes(): number {
    return this.decodedBytes;
  }

  get(vaultId: string, snapshotId: string): JournalSnapshotPayload | undefined {
    const key = this.key(vaultId, snapshotId);
    const cached = this.entries.get(key);
    if (!cached) return undefined;
    this.entries.delete(key);
    this.entries.set(key, cached);
    return cached.payload;
  }

  /**
   * Call only after every check on the payload passed, including its vault.
   * `decodedBytes` is its verified uncompressed size.
   */
  set(
    vaultId: string,
    snapshotId: string,
    payload: JournalSnapshotPayload,
    decodedBytes: number,
  ): void {
    if (payload.vaultId !== vaultId) return;
    const key = this.key(vaultId, snapshotId);
    this.remove(key);
    if (decodedBytes > this.limits.decodedBytes || this.limits.entries <= 0) return;
    // Shared across passes, so no caller may change it in place.
    this.entries.set(key, { payload: deepFreeze(payload), decodedBytes });
    this.decodedBytes += decodedBytes;
    for (const oldest of this.entries.keys()) {
      if (
        this.entries.size <= this.limits.entries &&
        this.decodedBytes <= this.limits.decodedBytes
      ) {
        break;
      }
      this.remove(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
    this.decodedBytes = 0;
  }

  private remove(key: string): void {
    const cached = this.entries.get(key);
    if (!cached) return;
    this.entries.delete(key);
    this.decodedBytes -= cached.decodedBytes;
  }

  private key(vaultId: string, snapshotId: string): string {
    return `${vaultId}\0${snapshotId}`;
  }
}
