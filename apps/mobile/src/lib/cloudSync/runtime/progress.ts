import type {
  SyncProgressCount,
  SyncProgressPhase,
  SyncProgressReport,
  SyncWaitReason,
} from '../snapshot/sync/types';

export type {
  SyncProgressCount,
  SyncProgressPhase,
  SyncProgressReport,
  SyncWaitReason,
} from '../snapshot/sync/types';

/** Check, download, combine, then transfer (uploads and photos). */
export const SYNC_PROGRESS_TOTAL_STEPS = 4;

export const STEP_FOR_PROGRESS_PHASE: Record<SyncProgressPhase, number> = {
  preparing: 1,
  checking: 1,
  downloading: 2,
  merging: 3,
  uploading: 4,
  'uploading-media': 4,
  'downloading-media': 4,
};

/** Time estimates need this much transfer history before they are shown. */
export const ETA_MIN_ELAPSED_MS = 5_000;
export const ETA_MIN_FRACTION = 0.1;
/** About four UI updates per second. */
export const PROGRESS_UPDATE_INTERVAL_MS = 250;

export interface SyncWait {
  reason: SyncWaitReason;
  /** Epoch milliseconds when the wait ends, when known. */
  until?: number;
}

export interface SyncProgress {
  phase: SyncProgressPhase;
  step: number;
  totalSteps: number;
  items?: SyncProgressCount;
  bytes?: SyncProgressCount;
  waiting?: SyncWait;
  /** Time left in the current step, only once it can be estimated honestly. */
  etaMs?: number;
}

export interface SyncProgressSnapshot {
  /** Null between passes. */
  progress: SyncProgress | null;
  /** A wait that outlives its pass: media held back until Wi-Fi. */
  idleWait: SyncWaitReason | null;
}

interface PhaseCounter {
  items?: SyncProgressCount;
  bytesTotal?: number;
  /** Greatest byte count seen per object, so a retried read never counts twice. */
  transfers: Map<string, number>;
  /** First byte sample in this phase: the baseline for the transfer rate. */
  firstSample?: { at: number; done: number };
}

export interface ProgressClock {
  now(): number;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

const systemClock: ProgressClock = {
  now: () => Date.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};

const EMPTY: SyncProgressSnapshot = { progress: null, idleWait: null };

function bytesDone(counter: PhaseCounter): number {
  let done = 0;
  for (const value of counter.transfers.values()) done += value;
  return done;
}

/**
 * Remaining time from the rate since the phase's first byte sample. Omitted
 * until enough of a known total has moved to make the estimate meaningful.
 */
export function estimateRemainingMs(
  sample: { at: number; done: number } | undefined,
  done: number,
  total: number,
  now: number,
): number | undefined {
  if (!sample || total <= 0 || done >= total) return undefined;
  const elapsed = now - sample.at;
  const moved = done - sample.done;
  if (elapsed < ETA_MIN_ELAPSED_MS || moved < total * ETA_MIN_FRACTION) return undefined;
  return ((total - done) * elapsed) / moved;
}

/**
 * Folds progress reports into one display snapshot. Counts never move
 * backwards within a phase, the step only goes back when a pass re-plans from
 * its check, and listeners hear about changes at most every interval.
 */
export class SyncProgressTracker {
  private phase: SyncProgressPhase | null = null;
  private step = 0;
  private counters = new Map<SyncProgressPhase, PhaseCounter>();
  private transferWait: SyncWait | null = null;
  private wifiWait = false;
  private offline = false;
  private published: SyncProgressSnapshot = EMPTY;
  private lastPublishedAt = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly changed: () => void,
    private readonly clock: ProgressClock = systemClock,
    private readonly intervalMs = PROGRESS_UPDATE_INTERVAL_MS,
  ) {}

  get current(): SyncProgressSnapshot {
    return this.published;
  }

  report(report: SyncProgressReport): void {
    switch (report.type) {
      case 'pass':
        this.phase = null;
        this.step = 0;
        this.counters.clear();
        this.transferWait = null;
        // A new pass checks Wi-Fi again; a finished pass keeps what it found.
        if (report.state === 'start') this.wifiWait = false;
        // Start and end are rare and must not be hidden by a pending update.
        this.publish();
        return;
      case 'plan':
        this.enter(report.phase);
        this.counters.set(report.phase, {
          items: report.items ? { ...report.items } : undefined,
          bytesTotal: report.bytesTotal,
          transfers: new Map(),
        });
        break;
      case 'phase':
        this.enter(report.phase);
        break;
      case 'item': {
        const items = this.counters.get(report.phase)?.items;
        if (!items || items.done >= items.total) return;
        items.done += 1;
        break;
      }
      case 'bytes': {
        if (!this.phase) return;
        const counter = this.counter(this.phase);
        const previous = counter.transfers.get(report.key) ?? 0;
        if (report.done <= previous) return;
        counter.transfers.set(report.key, report.done);
        // The baseline includes this sample, so a resumed upload's earlier
        // bytes never read as speed.
        counter.firstSample ??= { at: this.clock.now(), done: bytesDone(counter) };
        break;
      }
      case 'wait':
        // Offline comes from the platform (networkChanged), not from requests.
        if (report.reason === 'wifi-only-media') this.wifiWait = true;
        else if (report.reason !== 'offline')
          this.transferWait = report.reason
            ? { reason: report.reason, until: report.until }
            : null;
        break;
    }
    this.schedule();
  }

  /** Connectivity from the platform; any change may also have brought Wi-Fi. */
  networkChanged(online: boolean): void {
    const changed = this.offline !== !online || this.wifiWait;
    this.offline = !online;
    this.wifiWait = false;
    if (changed) this.schedule();
  }

  /** Publishes what is pending now, e.g. before a test reads the snapshot. */
  flush(): void {
    if (this.timer) this.publish();
  }

  private enter(phase: SyncProgressPhase): void {
    const step = STEP_FOR_PROGRESS_PHASE[phase];
    if (step === 1 && this.step > 1) {
      // Re-planning starts over from the check; earlier counts no longer apply.
      this.counters.clear();
      this.step = 1;
    } else {
      this.step = Math.max(this.step, step);
    }
    this.phase = phase;
  }

  private counter(phase: SyncProgressPhase): PhaseCounter {
    let counter = this.counters.get(phase);
    if (!counter) {
      counter = { transfers: new Map() };
      this.counters.set(phase, counter);
    }
    return counter;
  }

  private schedule(): void {
    if (this.timer) return;
    const wait = this.lastPublishedAt + this.intervalMs - this.clock.now();
    if (wait <= 0) {
      this.publish();
      return;
    }
    this.timer = this.clock.setTimer(() => {
      this.timer = null;
      this.publish();
    }, wait);
  }

  private publish(): void {
    if (this.timer) this.clock.clearTimer(this.timer);
    this.timer = null;
    this.lastPublishedAt = this.clock.now();
    this.published = {
      progress: this.snapshot(),
      idleWait: !this.phase && this.wifiWait ? 'wifi-only-media' : null,
    };
    this.changed();
  }

  private snapshot(): SyncProgress | null {
    if (!this.phase) return null;
    const counter = this.counters.get(this.phase);
    const progress: SyncProgress = {
      phase: this.phase,
      step: this.step,
      totalSteps: SYNC_PROGRESS_TOTAL_STEPS,
    };
    if (counter?.items) progress.items = { ...counter.items };
    if (counter?.bytesTotal !== undefined) {
      const total = counter.bytesTotal;
      // A rare extra read in the same phase (a re-checked head) never overshoots.
      const done = Math.min(bytesDone(counter), total);
      progress.bytes = { done, total };
      const eta = estimateRemainingMs(counter.firstSample, done, total, this.clock.now());
      if (eta !== undefined) progress.etaMs = eta;
    }
    const waiting: SyncWait | null = this.offline
      ? { reason: 'offline' }
      : (this.transferWait ?? (this.wifiWait ? { reason: 'wifi-only-media' } : null));
    if (waiting) progress.waiting = { ...waiting };
    return progress;
  }
}
