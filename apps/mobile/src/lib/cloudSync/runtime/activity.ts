import type { SnapshotKillPoint } from '../snapshot/sync/types';
import type { SyncPassPhase } from './SyncRuntime';

export type ProductionCloudSyncActivity = 'idle' | SyncPassPhase;

/**
 * Maps an engine checkpoint to the phase that follows it, or null to keep the
 * current phase. Media transfers report their own direction before they start.
 */
export function phaseAfterCheckpoint(
  point: SnapshotKillPoint,
  current: ProductionCloudSyncActivity,
): SyncPassPhase | null {
  switch (point) {
    case 'after-local-mutation':
      return 'preparing';
    case 'after-candidate-persisted':
    case 'after-snapshot-uploaded':
    case 'after-snapshot-verified':
    case 'after-head-advanced':
      return 'uploading';
    case 'during-remote-snapshot-download':
      // Remote heads are re-read after every launch; keep that quiet.
      return 'checking';
    case 'during-merge-application':
      // Publishing also applies the merged result locally; that is still saving.
      return current === 'uploading' ? null : 'downloading';
    default:
      // Media transfers, cleanup, and local bookkeeping keep the current phase.
      return null;
  }
}

/** Polling is quiet until real work starts; explicit sync always has feedback. */
export class SyncActivity {
  private phase: ProductionCloudSyncActivity = 'idle';
  private working = false;
  private manualRequests = 0;

  constructor(private readonly changed: () => void) {}

  get current(): ProductionCloudSyncActivity {
    if (this.manualRequests > 0) return this.phase === 'idle' ? 'checking' : this.phase;
    return this.working ? this.phase : 'idle';
  }

  report(phase: ProductionCloudSyncActivity): void {
    const previous = this.current;
    this.phase = phase;
    if (phase === 'idle') this.working = false;
    else if (phase !== 'checking') this.working = true;
    // Refresh completion even for quiet checks: new errors and last-success
    // timestamps must become visible without showing an in-progress spinner.
    if (previous !== this.current || phase === 'idle') this.changed();
  }

  beginManual(): () => void {
    const previous = this.current;
    this.manualRequests++;
    if (previous !== this.current) this.changed();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      const previous = this.current;
      this.manualRequests--;
      if (previous !== this.current) this.changed();
    };
  }
}
