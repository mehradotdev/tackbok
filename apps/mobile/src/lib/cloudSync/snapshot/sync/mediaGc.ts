/**
 * Remote media garbage collection (#185 P12, #148). Deletes media blobs on
 * the provider that nothing needs any more: the photos and voice notes of
 * deleted entries once compaction has dropped them, replaced profile photos,
 * and uploads whose attachment never reached a published snapshot.
 *
 * A blob is deleted only when all of these hold:
 * 1. **Every snapshot on the provider was read**, not only the heads: P9's
 *    backup history restores older ones, and a snapshot this device has not
 *    read could refer to anything. Any head that cannot be read, a head
 *    whose snapshot is not listed (yet), or a snapshot that cannot be
 *    downloaded or decoded stops the check: nothing is deleted.
 * 2. **No snapshot refers to it, nor this device's own journal** (its media
 *    rows, attachments not published yet included).
 * 3. **It has been unreferenced for 30 days**, by this device's complete
 *    checks (`sync_media_gc`): one at least 30 days ago and every one since,
 *    never more than 14 days apart. Retention keeps a blob a snapshot refers
 *    to referred to by a listed snapshot for 30 days after that snapshot's
 *    upload (`retention.ts`: a snapshot thinned from the daily history
 *    earlier is one whose blobs a newer snapshot that stays refers to), so
 *    a reference cannot appear and go between two checks unseen.
 * 4. **It was uploaded more than 30 days ago** (provider time), which covers
 *    uploads whose snapshot is still on its way.
 * 5. Right before each delete, the heads and snapshots are listed again and
 *    nothing new may have appeared, and the provider looks the blob up again
 *    and keeps it if any copy is newer (`deleteMedia`).
 *
 * Times come from the provider's clock (`SnapshotProvider.providerTime`,
 * Drive's `Date` header), as retention's do, so this device's clock cannot
 * shorten a count (#185 "clock skew in retention"). A count still restarts
 * if the times it is given jump forward by more than 14 days or back at all.
 *
 * What it cannot prevent, and how that recovers:
 * - **A device back after 180 days** (`compact.ts`), including one that
 *   stayed paused on the mass-deletion question that long and then keeps
 *   its entries, can bring back entries whose blobs were collected. When it
 *   publishes, it uploads every blob it still has (`V2SyncEngine.publish`
 *   asks the provider itself about blobs its head did not refer to, so a
 *   stale provider cache cannot hide the delete); one it never downloaded
 *   stays unavailable, and other devices show the attachment without its
 *   file rather than pausing (`hydratePendingMedia`). An upload whose
 *   snapshot never made it recovers the same way.
 * - **A blob attached again in the seconds between the last listing and the
 *   delete** (the same file, so the same hash, attached by another device
 *   while it was being collected). Its snapshot then refers to a missing
 *   blob until that device publishes again (its next write, or a daily
 *   acknowledgement of another device's writes) and finds the blob gone:
 *   the change feed (or, after a stale cursor, a rebuilt inventory) tells
 *   its provider. Until then other devices show the attachment without its
 *   file.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import {
  mediaAssets,
  runExclusiveDbTransaction,
  syncMediaGc,
  syncSnapshotMedia,
} from '~/db';

import { type CodecWork, decodeEnvelopeAsync, jsCodecWork } from '../../v2/codec';
import type { SyncState } from '../../v2/types';
import {
  SnapshotProviderError,
  type ListedDeviceHead,
  type SnapshotProvider,
  type SnapshotSyncHooks,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a blob must have been unreferenced, by complete checks. */
export const MEDIA_UNREFERENCED_MS = 30 * DAY_MS;
/** How old an upload must be (provider time) before it can be collected. */
export const MEDIA_UPLOAD_GRACE_MS = 30 * DAY_MS;
/**
 * The longest gap between two checks that keeps a blob's unreferenced time
 * running. Well below snapshot retention (30 days), so a snapshot that
 * refers to it is listed at one check or another.
 */
export const MEDIA_MAX_CHECK_GAP_MS = 14 * DAY_MS;
/**
 * Snapshots downloaded per check, by count and compressed bytes (at least
 * one); the rest wait for the next pass.
 */
const MAX_SNAPSHOT_READS = 10;
const MAX_SNAPSHOT_READ_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_DELETES = 10;
const INSERT_BATCH = 100;

export type MediaGcOutcome =
  /** Not every snapshot read yet, or something new appeared: try again next pass. */
  | { status: 'incomplete'; deleted: string[] }
  /** Something could not be read or told apart: nothing deleted. */
  | { status: 'blocked'; reason: string }
  | { status: 'checked'; deleted: string[] };

/**
 * The blob hashes a snapshot's state refers to, sorted. `state.media` is the
 * only place a state refers to blobs; a later feature that adds others must
 * be a required one (`KNOWN_REQUIRED_FEATURES` in `v2/codec.ts`).
 */
export function snapshotBlobs(state: SyncState): string[] {
  return [...new Set([...state.media.values()].map((media) => media.blobHash))].sort();
}

/**
 * Records the blobs a snapshot refers to, for a later check. Called with
 * snapshots the engine downloads or publishes anyway, so the check rarely
 * downloads one itself.
 */
export async function recordSnapshotMedia(
  vaultId: string,
  snapshotId: string,
  state: SyncState,
): Promise<void> {
  await runExclusiveDbTransaction((tx) =>
    tx
      .insert(syncSnapshotMedia)
      .values({
        vault_id: vaultId,
        snapshot_id: snapshotId,
        blobs_json: JSON.stringify(snapshotBlobs(state)),
      })
      // Snapshot IDs are content hashes: a row only changes if it was damaged.
      .onConflictDoUpdate({
        target: [syncSnapshotMedia.vault_id, syncSnapshotMedia.snapshot_id],
        set: { blobs_json: JSON.stringify(snapshotBlobs(state)) },
      }),
  );
}

/** Why the listed heads cannot be checked against `snapshotIds`, or null. */
function headsBlock(
  listed: readonly ListedDeviceHead[],
  snapshotIds: ReadonlySet<string>,
): string | null {
  for (const { head } of listed) {
    if (head === null) return 'unreadable-head';
    if (!snapshotIds.has(String(head.snapshotId))) return 'head-snapshot-not-listed';
  }
  return null;
}

/**
 * Blobs this device's own journal holds or still needs. Not the local
 * reaper's ledger (`sync_retained_media`): it keeps local files of removed
 * attachments until the removal is backed up, which needs no remote blob.
 */
async function localBlobs(): Promise<Set<string>> {
  const rows = await runExclusiveDbTransaction((tx) =>
    tx
      .select({ blobHash: mediaAssets.blob_hash })
      .from(mediaAssets)
      .where(isNotNull(mediaAssets.blob_hash)),
  );
  return new Set(rows.map((row) => row.blobHash!));
}

/**
 * Records this complete check: each unreferenced blob keeps its time if the
 * previous check was recent enough, or starts one now; every other row
 * goes, with the blob sets of snapshots no longer listed. Returns the blobs
 * unreferenced for long enough.
 */
function advance(
  vaultId: string,
  unreferenced: readonly string[],
  listedSnapshots: ReadonlySet<string>,
  now: number,
): Promise<string[]> {
  return runExclusiveDbTransaction(async (tx) => {
    const rows = await tx
      .select()
      .from(syncMediaGc)
      .where(eq(syncMediaGc.vault_id, vaultId));
    const prior = new Map(rows.map((row) => [row.blob_hash, row]));
    await tx.delete(syncMediaGc).where(eq(syncMediaGc.vault_id, vaultId));
    const values = unreferenced.map((blobHash) => {
      const row = prior.get(blobHash);
      const continued =
        row !== undefined &&
        now >= row.checked_at &&
        now - row.checked_at <= MEDIA_MAX_CHECK_GAP_MS;
      return {
        vault_id: vaultId,
        blob_hash: blobHash,
        unreferenced_since: continued ? row.unreferenced_since : now,
        checked_at: now,
      };
    });
    for (let offset = 0; offset < values.length; offset += INSERT_BATCH)
      await tx.insert(syncMediaGc).values(values.slice(offset, offset + INSERT_BATCH));
    const cached = await tx
      .select({ snapshotId: syncSnapshotMedia.snapshot_id })
      .from(syncSnapshotMedia)
      .where(eq(syncSnapshotMedia.vault_id, vaultId));
    const gone = cached
      .map((row) => row.snapshotId)
      .filter((snapshotId) => !listedSnapshots.has(snapshotId));
    for (let offset = 0; offset < gone.length; offset += INSERT_BATCH)
      await tx
        .delete(syncSnapshotMedia)
        .where(
          and(
            eq(syncSnapshotMedia.vault_id, vaultId),
            inArray(
              syncSnapshotMedia.snapshot_id,
              gone.slice(offset, offset + INSERT_BATCH),
            ),
          ),
        );
    return values
      .filter((value) => now - value.unreferenced_since >= MEDIA_UNREFERENCED_MS)
      .map((value) => value.blob_hash);
  });
}

/** A cached blob list, or null when the row is damaged (read the snapshot again). */
function parseBlobs(json: string): string[] | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  return Array.isArray(value) &&
    value.every((hash) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))
    ? (value as string[])
    : null;
}

export async function loadSnapshotMedia(vaultId: string): Promise<Map<string, string[]>> {
  const rows = await runExclusiveDbTransaction((tx) =>
    tx.select().from(syncSnapshotMedia).where(eq(syncSnapshotMedia.vault_id, vaultId)),
  );
  const blobs = new Map<string, string[]>();
  for (const row of rows) {
    const parsed = parseBlobs(row.blobs_json);
    if (parsed) blobs.set(row.snapshot_id, parsed);
  }
  return blobs;
}

/** The blobs one snapshot refers to, if recorded (`recordSnapshotMedia`). */
export async function recordedSnapshotMedia(
  vaultId: string,
  snapshotId: string,
): Promise<Set<string> | null> {
  const [row] = await runExclusiveDbTransaction((tx) =>
    tx
      .select({ blobs: syncSnapshotMedia.blobs_json })
      .from(syncSnapshotMedia)
      .where(
        and(
          eq(syncSnapshotMedia.vault_id, vaultId),
          eq(syncSnapshotMedia.snapshot_id, snapshotId),
        ),
      ),
  );
  const parsed = row ? parseBlobs(row.blobs) : null;
  return parsed ? new Set(parsed) : null;
}

/**
 * One check, and the deletes it allows (see the module comment). Provider
 * errors are thrown to the caller, which keeps them from failing the pass.
 */
export async function collectMedia(options: {
  vaultId: string;
  provider: SnapshotProvider;
  now: number;
  hooks?: SnapshotSyncHooks;
  codecWork?: CodecWork;
}): Promise<MediaGcOutcome> {
  const { vaultId, provider, hooks } = options;
  const { now } = options;
  // Only blobs old enough to collect need the snapshots read.
  const old = (await provider.listMedia(vaultId)).filter(
    ({ createdAt }) => createdAt !== null && now - createdAt >= MEDIA_UPLOAD_GRACE_MS,
  );
  if (old.length === 0) return { status: 'checked', deleted: [] };
  const listed = await provider.listHeads(vaultId, true);
  const snapshots = await provider.listSnapshots(vaultId);
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.snapshotId));
  const blocked = headsBlock(listed, snapshotIds);
  if (blocked) return { status: 'blocked', reason: blocked };

  const blobs = await loadSnapshotMedia(vaultId);
  const unread = snapshots.filter((snapshot) => !blobs.has(snapshot.snapshotId));
  let reads = 0;
  let readBytes = 0;
  for (const { snapshotId, byteCount } of unread) {
    if (
      reads > 0 &&
      (reads >= MAX_SNAPSHOT_READS || readBytes + byteCount > MAX_SNAPSHOT_READ_BYTES)
    )
      return { status: 'incomplete', deleted: [] };
    reads += 1;
    readBytes += byteCount;
    // Where a cancelled or out-of-time pass stops; what was read is kept.
    await hooks?.at?.('during-snapshot-cleanup');
    // Retention on another device may thin a snapshot after it was listed:
    // one that is no longer listed is checked again soon, not tomorrow.
    const gone = async () =>
      !(await provider.listSnapshots(vaultId)).some(
        (listed) => listed.snapshotId === snapshotId,
      );
    let bytes: Uint8Array | null;
    try {
      bytes = await provider.downloadSnapshot(vaultId, snapshotId);
    } catch (error) {
      if (
        error instanceof SnapshotProviderError &&
        error.code === 'transient' &&
        (await gone())
      )
        return { status: 'incomplete', deleted: [] };
      throw error;
    }
    if (!bytes)
      return (await gone())
        ? { status: 'incomplete', deleted: [] }
        : { status: 'blocked', reason: 'snapshot-missing' };
    let state: SyncState;
    try {
      const decoded = await decodeEnvelopeAsync(
        bytes,
        snapshotId,
        options.codecWork ?? jsCodecWork,
      );
      if (decoded.header.vaultId !== vaultId)
        return { status: 'blocked', reason: 'snapshot-other-vault' };
      state = decoded.state;
    } catch {
      // Damaged, or from a newer build: what it refers to is unknown.
      return { status: 'blocked', reason: 'snapshot-unreadable' };
    }
    await recordSnapshotMedia(vaultId, snapshotId, state);
    blobs.set(snapshotId, snapshotBlobs(state));
  }

  const referenced = await localBlobs();
  for (const { snapshotId } of snapshots)
    for (const blobHash of blobs.get(snapshotId)!) referenced.add(blobHash);
  const eligible = await advance(
    vaultId,
    old.map(({ blobHash }) => blobHash).filter((blobHash) => !referenced.has(blobHash)),
    snapshotIds,
    now,
  );

  const deleted: string[] = [];
  for (const blobHash of eligible.slice(0, MAX_MEDIA_DELETES)) {
    // Listed again right before each delete: anything new may refer to it.
    const heads = await provider.listHeads(vaultId, true);
    const current = await provider.listSnapshots(vaultId);
    if (
      current.some((snapshot) => !snapshotIds.has(snapshot.snapshotId)) ||
      headsBlock(heads, snapshotIds) !== null
    )
      return { status: 'incomplete', deleted };
    if ((await localBlobs()).has(blobHash)) continue;
    await hooks?.at?.('during-snapshot-cleanup');
    if (await provider.deleteMedia(vaultId, blobHash, now - MEDIA_UPLOAD_GRACE_MS))
      deleted.push(blobHash);
    await runExclusiveDbTransaction((tx) =>
      tx
        .delete(syncMediaGc)
        .where(
          and(eq(syncMediaGc.vault_id, vaultId), eq(syncMediaGc.blob_hash, blobHash)),
        ),
    );
  }
  return { status: 'checked', deleted };
}
