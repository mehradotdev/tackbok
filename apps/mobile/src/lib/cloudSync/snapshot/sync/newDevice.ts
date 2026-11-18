/**
 * "Continue as a new device" (#185, P8): the way out of two pauses.
 *
 * - **Another install uses this ID** (`ambiguous-device-head`): this install
 *   moves every write under the old ID it holds to a new device ID
 *   (`reissueWrites`, HLCs kept), and forgets that it ever published under
 *   the old one. Writes the other install made that reached this one through
 *   a third device move too; their values are equal, so they show once.
 *   The old head now belongs to the other install, and the next pass joins
 *   it like any other device's: writes both made stay as versions, nothing
 *   is overwritten.
 * - **This device's clock was far ahead** (`device-clock-ahead`): its writes
 *   since then carry HLCs other devices refuse. The head this install
 *   published is deleted first (no other device took its snapshot in, and
 *   it would be read once real time caught up), then those writes move to a
 *   new ID with HLCs just above the rest.
 *
 * Both keep every value this device shows. The next pass publishes under
 * the new ID.
 *
 * The install-bound device ID (P13, `installBinding.ts`) takes the first
 * path on its own when this install's marker is missing or differs, before
 * any pass; the pause stays for copies it cannot tell apart (a backup taken
 * before the marker existed).
 *
 * Retiring the old ID (#185 P11, `retireDevice`):
 * - **Clock far ahead:** the old ID is dead. Its head is gone and every
 *   write it had is in this install's state, under the old ID or the new
 *   one. It is retired in the same write, so it stops holding back
 *   compaction at once (its acknowledgement was dropped with the move, so
 *   until then nothing would compact for 180 days).
 * - **Another install uses this ID:** not retired. The other install keeps
 *   the ID and may still publish edits made before it saw a delete;
 *   retiring it would let compaction drop values those edits need. It
 *   counts until it expires (180 days without a publish).
 */
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { runExclusiveDbTransaction, syncDevice, syncHeads } from '~/db';

import type { CloudSyncTransaction } from '../../storage/repositories';
import {
  applySyncState,
  captureSyncState,
  type ApplyMediaFiles,
} from '../../storage/v2State';
import { MAX_CONTEXT_AHEAD_MS } from '../../v2/clock';
import { retireDevice } from '../../v2/compact';
import { reissueWrites } from '../../v2/reissue';
import type { SnapshotProvider } from './types';

export type NewDeviceReason = 'another-install' | 'clock-ahead';

const MAX_ATTEMPTS = 4;

/**
 * Deletes head files under the old ID that this install published (its
 * `sync_heads` record names their snapshot); a copy of it elsewhere keeps
 * its own.
 * - **Clock far ahead:** this install's head, which no other device took in
 *   and which would be read once real time caught up.
 * - **Another install:** only a file no device reads: one below the old
 *   ID's newest sequence, or one of two at that sequence (which makes the ID
 *   unreadable everywhere and pauses both installs). The newest head stays:
 *   it may be the other install's, if this install's record came with a
 *   copy of its database. Clears the two files a race between copied phones
 *   leaves under one ID (#216): once one install leaves, the other's file is
 *   read again and that install syncs on.
 */
async function removeOwnHeads(
  provider: Pick<SnapshotProvider, 'listHeads' | 'deleteDeviceHead'>,
  vaultId: string,
  from: string,
  reason: NewDeviceReason,
) {
  const [own] = await runExclusiveDbTransaction((tx) =>
    tx
      .select({
        snapshotId: syncHeads.snapshot_id,
        pending: syncHeads.pending_snapshot_id,
      })
      .from(syncHeads)
      .where(and(eq(syncHeads.vault_id, vaultId), eq(syncHeads.device_id, from))),
  );
  const mine = new Set([own?.snapshotId, own?.pending].filter(Boolean));
  const listed = (await provider.listHeads(vaultId, true)).filter(
    (candidate) =>
      candidate.head?.deviceId === from &&
      Number.isSafeInteger(candidate.head.deviceSequence),
  );
  const sequence = (candidate: (typeof listed)[number]) =>
    Number(candidate.head!.deviceSequence);
  const newest = Math.max(...listed.map(sequence));
  const atNewest = new Set(
    listed
      .filter((candidate) => sequence(candidate) === newest)
      .map((c) => c.head!.snapshotId),
  );
  for (const candidate of listed) {
    if (!mine.has(String(candidate.head!.snapshotId))) continue;
    const unread = sequence(candidate) < newest || atNewest.size > 1;
    if (reason === 'clock-ahead' || unread)
      await provider.deleteDeviceHead(vaultId, candidate.physicalId);
  }
}

export async function continueAsNewDevice(options: {
  vaultId: string;
  reason: NewDeviceReason;
  /**
   * Needed for `clock-ahead`: its own published head is deleted. With
   * `another-install`, its own files no device reads are deleted too
   * (`removeOwnHeads`); the launch-time check runs offline without one.
   */
  provider?: Pick<SnapshotProvider, 'listHeads' | 'deleteDeviceHead'>;
  files: ApplyMediaFiles;
  /** More writes committed with the move (P13: the install binding). */
  alsoInTransaction?: (tx: CloudSyncTransaction) => Promise<void>;
  /** The wall clock: in the clock case, the writes after it move. */
  now: number;
  newDeviceId?: () => string;
}): Promise<string> {
  const { vaultId, reason, provider, files } = options;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const captured = await captureSyncState();
    if (captured.state.vaultId !== vaultId)
      throw new Error('Sync metadata is for another vault');
    const from = captured.deviceId;
    // Every write under the old ID moves for another install, not only those
    // since this install last published: the other install may have
    // published over that snapshot from an older copy (a race), and its head
    // would then read this install's writes as replaced. A write both
    // installs hold appears twice under different IDs with one value, which
    // shows once. After a clock far ahead, the writes past now move.
    const keepUpTo = reason === 'another-install' ? -1 : Math.floor(options.now);
    if (reason === 'clock-ahead' && !provider)
      throw new Error('A clock-ahead recovery needs the provider');
    if (attempt === 0 && provider) await removeOwnHeads(provider, vaultId, from, reason);
    const to = options.newDeviceId?.() ?? randomUUID();
    let next = reissueWrites(captured.state, {
      from,
      to,
      keepUpTo,
      hlcs: reason === 'another-install' ? 'same' : 'after',
    });
    if (reason === 'clock-ahead') {
      // Retired up to any last-seen time another device could hold for it:
      // they refuse states more than the bound ahead of their clocks. Not
      // its highest (ahead) time, or a copy publishing at real time later
      // would look retired for as long as the clock was wrong. A copy made
      // after it published writes further ahead is not covered by the
      // retired-ID pause; the clock-ahead pause stops it until real time is
      // within the bound of those writes.
      const { ctx, roster } = captured.state;
      const upTo = Math.min(
        Math.max(ctx[from] ?? 0, roster[from] ?? 0),
        Math.floor(options.now) + MAX_CONTEXT_AHEAD_MS,
      );
      next = retireDevice(next, { device: to, wallMs: options.now }, from, upTo);
    }
    const applied = await applySyncState(captured, next, files, async (rawTx) => {
      const tx = rawTx as CloudSyncTransaction;
      await tx.update(syncDevice).set({ device_id: to }).where(eq(syncDevice.id, 'self'));
      // This device never published under the new ID.
      await tx
        .delete(syncHeads)
        .where(and(eq(syncHeads.vault_id, vaultId), eq(syncHeads.device_id, from)));
      await options.alsoInTransaction?.(tx);
    });
    if (applied) return to;
  }
  throw new Error('The journal kept changing; try again');
}
