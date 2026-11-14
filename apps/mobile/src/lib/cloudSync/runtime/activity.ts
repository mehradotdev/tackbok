import type { SnapshotSyncActivity } from '../snapshot/sync/types';
import type { SyncPassPhase } from './SyncRuntime';

export type ProductionCloudSyncActivity = 'idle' | SyncPassPhase;

/**
 * The phase shown for work the engine is about to start. Media transfers report
 * their own direction before they start.
 */
export const PHASE_FOR_ENGINE_ACTIVITY: Record<SnapshotSyncActivity, SyncPassPhase> = {
  'preparing-local-changes': 'preparing',
  // Remote heads are re-read after every launch; keep that quiet.
  'reading-remote-snapshot': 'checking',
  // Publishing also applies the merged result locally; that is still saving.
  'publishing-local-snapshot': 'uploading',
  'applying-remote-snapshot': 'downloading',
};

/**
 * Polling is quiet until real work starts; explicit sync always has feedback.
 * `checksAreWork` makes checks count as work: before a restore's journal has
 * arrived, reading the backup is the restore itself, and a device with nothing
 * local to prepare reports nothing else until the download is done.
 */
export class SyncActivity {
  private phase: ProductionCloudSyncActivity = 'idle';
  private working = false;
  private manualRequests = 0;

  constructor(
    private readonly changed: () => void,
    private readonly checksAreWork: () => boolean = () => false,
  ) {}

  get current(): ProductionCloudSyncActivity {
    if (this.manualRequests > 0) return this.phase === 'idle' ? 'checking' : this.phase;
    return this.working ? this.phase : 'idle';
  }

  report(phase: ProductionCloudSyncActivity): void {
    const previous = this.current;
    this.phase = phase;
    if (phase === 'idle') this.working = false;
    else if (phase !== 'checking' || this.checksAreWork()) this.working = true;
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
