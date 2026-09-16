import { BaseShadowManager } from './baseShadow';
import { SQLiteSyncStateStore } from './sqliteState';
import type { ListedDeviceHead, SnapshotProvider, SnapshotSyncHooks } from './types';
import { SnapshotProviderError } from './types';
import { decodeSnapshot } from '../codec';
import { SnapshotValidationError } from '../caps';
import { canonicalize } from '../canonical';
import { activeFrontier, isHeadShapeValid, type RemoteHeadSnapshot } from './frontier';

const RETENTION_COUNT = 3;
const CLEANUP_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CLEANUP_CANDIDATES = 10;

function headSignature(heads: ListedDeviceHead[]): string {
  return canonicalize(heads.map(({ head }) =>
    [head.deviceId, head.deviceSequence, head.snapshotId]).sort());
}

export interface SnapshotCleanupOptions {
  vaultId: string;
  stateStore: SQLiteSyncStateStore;
  shadowManager: BaseShadowManager;
  provider: SnapshotProvider;
  hooks: SnapshotSyncHooks;
  now(): number;
}

export class SnapshotCleanup {
  private lastExaminedSnapshot: string | null = null;
  constructor(private readonly options: SnapshotCleanupOptions) {}

  async run(): Promise<void> {
    await this.reapOldShadows();
    await this.cleanupSnapshots();
  }

  private async reapOldShadows(): Promise<void> {
    const { shadowManager, stateStore } = this.options;
    for (const fileName of stateStore.listShadowReaperFiles()) {
      try {
        await shadowManager.reap(fileName);
        stateStore.completeShadowReap(fileName);
      } catch {
        // The new checkpoint already committed. A later pass retries cleanup.
      }
    }
  }

  private async cleanupSnapshots(): Promise<void> {
    const { hooks, provider, vaultId } = this.options;
    try {
      const heads = await provider.listHeads(vaultId, true);
      const snapshots = await provider.listSnapshots(vaultId);
      const newest = [...snapshots]
        .sort((left, right) => right.createdAt - left.createdAt ||
          right.snapshotId.localeCompare(left.snapshotId))
        .slice(0, RETENTION_COUNT);
      const protectedIds = new Set([
        ...heads.map((value) => value.head.snapshotId),
        ...newest.map((value) => value.snapshotId),
      ]);
      const eligible = snapshots.filter((snapshot) => !protectedIds.has(snapshot.snapshotId) &&
        this.options.now() - snapshot.createdAt >= CLEANUP_GRACE_MS)
        .sort((a, b) => a.createdAt - b.createdAt || a.snapshotId.localeCompare(b.snapshotId));
      // Rotate past retained/unobserved objects so they cannot starve cleanup.
      // This cursor is only an efficiency hint; restarting it is always safe.
      const start = eligible.findIndex((snapshot) => snapshot.snapshotId === this.lastExaminedSnapshot) + 1;
      const candidates = [...eligible.slice(start), ...eligible.slice(0, start)].slice(0, MAX_CLEANUP_CANDIDATES);
      if (candidates.length === 0 || heads.length === 0) return;

      const validated: RemoteHeadSnapshot[] = [];
      const deviceSequences = new Map<string, string>();
      for (const { head } of heads) {
        if (!isHeadShapeValid(head) || head.vaultId !== vaultId) return;
        const key = `${head.deviceId}\0${head.deviceSequence}`;
        const existing = deviceSequences.get(key);
        if (existing && existing !== head.snapshotId) return;
        deviceSequences.set(key, head.snapshotId);
        const duplicate = validated.find((value) => value.snapshotId === head.snapshotId);
        if (duplicate) {
          if (duplicate.head.deviceId !== head.deviceId ||
              duplicate.head.deviceSequence !== head.deviceSequence) return;
          continue;
        }
        const bytes = await provider.downloadSnapshot(vaultId, head.snapshotId);
        if (!bytes) return;
        const { payload } = decodeSnapshot(bytes, head.snapshotId);
        if (payload.vaultId !== vaultId || payload.authorDeviceId !== head.deviceId ||
            payload.deviceSequence !== head.deviceSequence) return;
        validated.push({ head, snapshotId: head.snapshotId, payload });
      }
      const frontier = activeFrontier(validated);
      // A single surviving complete snapshot must cover the other devices.
      // Divergent/offline branches retain history until they are merged.
      if (frontier.length !== 1) return;
      const survivor = frontier[0];
      const covered = new Map(survivor.payload.observedDeviceHeads.map((head) =>
        [head.deviceId, head.deviceSequence]));
      covered.set(survivor.head.deviceId, survivor.head.deviceSequence);
      for (const snapshot of candidates) {
        this.lastExaminedSnapshot = snapshot.snapshotId;
        const bytes = await provider.downloadSnapshot(vaultId, snapshot.snapshotId);
        if (!bytes) continue;
        const { payload } = decodeSnapshot(bytes, snapshot.snapshotId);
        if (payload.vaultId !== vaultId ||
            (covered.get(payload.authorDeviceId) ?? -1) <= payload.deviceSequence) continue;
        await hooks.at?.('during-snapshot-cleanup');
        // Abort this batch if a device published while cleanup was planning.
        if (headSignature(await provider.listHeads(vaultId, true)) !== headSignature(heads)) return;
        await provider.deleteSnapshot(vaultId, snapshot.snapshotId);
      }
    } catch (error) {
      if (!(error instanceof SnapshotProviderError) && !(error instanceof SnapshotValidationError)) throw error;
      // Cleanup is best effort: provider failure retains excess history.
    }
  }
}
