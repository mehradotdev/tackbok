import { BaseShadowManager } from './baseShadow';
import { SQLiteSyncStateStore } from './sqliteState';
import type { SnapshotProvider, SnapshotSyncHooks } from './types';
import { SnapshotProviderError } from './types';

const RETENTION_COUNT = 3;
const CLEANUP_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SnapshotCleanupOptions {
  vaultId: string;
  stateStore: SQLiteSyncStateStore;
  shadowManager: BaseShadowManager;
  provider: SnapshotProvider;
  hooks: SnapshotSyncHooks;
  now(): number;
}

export class SnapshotCleanup {
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
      const heads = await provider.listHeads(vaultId, false);
      // Multiple logical heads may still represent unresolved branches. Keep
      // excess history rather than deleting lineage not proven redundant.
      const logicalDevices = new Set(heads.map((value) => value.head.deviceId));
      if (logicalDevices.size > 1) return;
      const snapshots = await provider.listSnapshots(vaultId);
      const newest = [...snapshots]
        .sort((left, right) => right.createdAt - left.createdAt ||
          right.snapshotId.localeCompare(left.snapshotId))
        .slice(0, RETENTION_COUNT);
      const protectedIds = new Set([
        ...heads.map((value) => value.head.snapshotId),
        ...newest.map((value) => value.snapshotId),
      ]);
      for (const snapshot of snapshots) {
        if (protectedIds.has(snapshot.snapshotId) ||
            this.options.now() - snapshot.createdAt < CLEANUP_GRACE_MS) continue;
        await hooks.at?.('during-snapshot-cleanup');
        await provider.deleteSnapshot(vaultId, snapshot.snapshotId);
      }
    } catch (error) {
      if (!(error instanceof SnapshotProviderError)) throw error;
      // Cleanup is best effort: provider failure retains excess history.
    }
  }
}
