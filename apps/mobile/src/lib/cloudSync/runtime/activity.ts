import type { SyncPassPhase } from './SyncRuntime';

export type ProductionCloudSyncActivity = 'idle' | SyncPassPhase;

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
