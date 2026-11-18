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
 * The install-bound device ID (P13) is the real fix for the first case;
 * this is the user's way out until then.
 *
 * shortcut: the old ID stays on other devices' rosters, holding back
 * compaction until it expires after 180 days (P11 retires such IDs).
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
import { reissueWrites } from '../../v2/reissue';
import type { SnapshotProvider } from './types';

export type NewDeviceReason = 'another-install' | 'clock-ahead';

const MAX_ATTEMPTS = 4;

export async function continueAsNewDevice(options: {
  vaultId: string;
  reason: NewDeviceReason;
  provider: Pick<SnapshotProvider, 'listHeads' | 'deleteDeviceHead'>;
  files: ApplyMediaFiles;
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
    let keepUpTo: number;
    if (reason === 'another-install') {
      // Every write under the old ID moves, not only those since this
      // install last published: the other install may have published over
      // that snapshot from an older copy (a race), and its head would then
      // read this install's writes as replaced. A write both installs hold
      // appears twice under different IDs with one value, which shows once.
      keepUpTo = -1;
    } else {
      keepUpTo = Math.floor(options.now);
      if (attempt === 0) {
        // Only the head this install published: a copy of it elsewhere
        // (an OS restore) keeps its own.
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
        for (const listed of await provider.listHeads(vaultId, true))
          if (listed.head?.deviceId === from && mine.has(String(listed.head.snapshotId)))
            await provider.deleteDeviceHead(vaultId, listed.physicalId);
      }
    }
    const to = options.newDeviceId?.() ?? randomUUID();
    const next = reissueWrites(captured.state, {
      from,
      to,
      keepUpTo,
      hlcs: reason === 'another-install' ? 'same' : 'after',
    });
    const applied = await applySyncState(captured, next, files, async (rawTx) => {
      const tx = rawTx as CloudSyncTransaction;
      await tx.update(syncDevice).set({ device_id: to }).where(eq(syncDevice.id, 'self'));
      // This device never published under the new ID.
      await tx
        .delete(syncHeads)
        .where(and(eq(syncHeads.vault_id, vaultId), eq(syncHeads.device_id, from)));
    });
    if (applied) return to;
  }
  throw new Error('The journal kept changing; try again');
}
