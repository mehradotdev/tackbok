/**
 * Backup history and retention (#185 P9). Snapshots on the provider are
 * immutable; heads point to the newest of each device. Retention keeps:
 *
 * - every snapshot a head points to (and the ones the engine names, such as
 *   heads it has taken in), however old;
 * - **one snapshot per day for 30 days**: the newest of each UTC day of its
 *   upload, so every device picks the same one. These are the backups the
 *   user can restore or export (`backupHistory`);
 * - every snapshot of the current day, which is not over yet.
 *
 * Any other snapshot goes once it is 30 days old. A younger one goes earlier
 * ("thinned") only when a newer snapshot that stays refers to every media
 * blob it refers to. Media garbage collection (`mediaGc.ts`) relies on this:
 * a blob some snapshot refers to stays referred to by a listed snapshot for
 * at least 30 days after that snapshot's upload, so a reference cannot
 * appear and go between two collection checks unseen. A snapshot whose
 * blobs are not recorded yet, or whose upload time is unknown, is not thinned.
 *
 * Times are the provider's: upload times are Drive's `createdTime`, and "now"
 * is Drive's clock (`SnapshotProvider.providerTime`), so a device clock that
 * is wrong can neither delete history early nor keep it for ever.
 */
import type { SnapshotObject } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a snapshot no head points to is kept. */
export const SNAPSHOT_RETENTION_MS = 30 * DAY_MS;

const dayOf = (time: number) => Math.floor(time / DAY_MS);

/**
 * Upload order: time, then ID by code unit (not a locale's collation), so
 * every device sees the same order.
 */
function byUpload(left: SnapshotObject, right: SnapshotObject): number {
  return (
    left.createdAt - right.createdAt ||
    (left.snapshotId < right.snapshotId ? -1 : left.snapshotId > right.snapshotId ? 1 : 0)
  );
}

/**
 * The newest snapshot of each UTC day (provider time) from the last 30 days,
 * newest first: the backup history. Snapshots with no known upload time are
 * left out.
 */
export function backupHistory(
  snapshots: readonly SnapshotObject[],
  now: number,
): SnapshotObject[] {
  const newest = new Map<number, SnapshotObject>();
  for (const snapshot of snapshots) {
    if (snapshot.createdAt <= 0 || now - snapshot.createdAt >= SNAPSHOT_RETENTION_MS)
      continue;
    const day = dayOf(snapshot.createdAt);
    const prior = newest.get(day);
    if (!prior || byUpload(prior, snapshot) < 0) newest.set(day, snapshot);
  }
  return [...newest.values()].sort((left, right) => byUpload(right, left));
}

/**
 * The snapshots retention may delete now, oldest first (see the module
 * comment). `referenced` are the snapshots heads point to; `blobs` the media
 * each snapshot refers to, where recorded.
 */
export function snapshotsToDelete(options: {
  snapshots: readonly SnapshotObject[];
  referenced: ReadonlySet<string>;
  blobs: ReadonlyMap<string, readonly string[]>;
  now: number;
}): string[] {
  const { referenced, blobs, now } = options;
  const known = options.snapshots.filter((snapshot) => snapshot.createdAt > 0);
  const daily = new Set(backupHistory(known, now).map((snapshot) => snapshot.snapshotId));
  const today = dayOf(now);
  const deleted: string[] = [];
  // Blobs that snapshots newer than the one at hand, and staying, refer to.
  // Any snapshot that stays may cover older ones: it goes only once 30 days
  // old, or when a newer one that stays covers it in turn.
  const covered = new Set<string>();
  for (const { snapshotId, createdAt } of [...known].sort(byUpload).reverse()) {
    const own = blobs.get(snapshotId);
    const stays =
      referenced.has(snapshotId) ||
      (now - createdAt < SNAPSHOT_RETENTION_MS &&
        (daily.has(snapshotId) ||
          dayOf(createdAt) >= today ||
          !own ||
          !own.every((blob) => covered.has(blob))));
    if (!stays) deleted.push(snapshotId);
    else for (const blob of own ?? []) covered.add(blob);
  }
  return deleted.reverse();
}
