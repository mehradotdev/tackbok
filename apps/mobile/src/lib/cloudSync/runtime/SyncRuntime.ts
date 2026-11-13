import { CloudConnectionChangedError } from './connectionLifecycle';
import type { CloudSyncFailureCategory, CloudSyncTrigger } from '../../analytics/events';
import {
  toCloudSyncCountBucket,
  toCloudSyncDurationBucket,
} from '../../analytics/events';
import { readCloudSyncFailureCategory } from '../failureClassification';
import { SyncCancelledError } from '../snapshot/sync/errors';

export interface RuntimePassResult {
  pulled: number;
  pushed: number;
}

/** What a pass is doing now, by direction. Phases can repeat within one pass. */
export type SyncPassPhase =
  | 'checking'
  | 'preparing'
  | 'uploading'
  | 'downloading'
  | 'downloading-media';

export interface RuntimeSyncEngine {
  readonly provider: { readonly kind: 'google-drive' | 'dropbox' };
  /** Stops its network work promptly once `signal` aborts. */
  sync(signal?: AbortSignal): Promise<RuntimePassResult>;
  hasPendingWork?(): boolean;
}

export interface RuntimeSubscription {
  remove(): void;
}

/** Time the OS grants to keep running after the app goes to background. */
export interface RuntimeBackgroundExecution {
  /** What the OS said is left when the time was granted, if it said. */
  readonly remainingMs: number | null;
  end(): void;
}

export interface RuntimePlatform {
  getAppState?(): 'active' | 'background' | 'inactive';
  /**
   * Asks the OS for background time. `onExpire` runs if the OS ends it first.
   * Resolves to null where the platform grants none; a pass then runs as long
   * as the OS lets the process run.
   */
  beginBackgroundExecution?(
    onExpire: () => void,
  ): Promise<RuntimeBackgroundExecution | null>;
  addAppStateListener(
    listener: (state: 'active' | 'background' | 'inactive') => void,
  ): RuntimeSubscription;
  addNetworkListener(listener: (online: boolean) => void): RuntimeSubscription;
  getNetworkOnline(): Promise<boolean>;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

export interface RuntimeReadiness {
  isReady(): Promise<boolean>;
  retryBackfill(): Promise<void>;
}

export interface RuntimeAnalytics {
  connected(provider: 'google-drive' | 'dropbox'): void;
  started(trigger: CloudSyncTrigger): void;
  succeeded(payload: {
    duration_bucket: ReturnType<typeof toCloudSyncDurationBucket>;
    pulled_bucket: ReturnType<typeof toCloudSyncCountBucket>;
    pushed_bucket: ReturnType<typeof toCloudSyncCountBucket>;
  }): void;
  failed(category: CloudSyncFailureCategory): void;
}

export interface SyncRuntimeOptions {
  platform: RuntimePlatform;
  readiness: RuntimeReadiness;
  createEngine(): Promise<RuntimeSyncEngine | null>;
  waitForConnectionChange?(): Promise<void>;
  addMutationListener?(listener: () => void): RuntimeSubscription;
  analytics?: RuntimeAnalytics;
  debounceMs?: number;
  readinessRetryMs?: number;
  heartbeatMs?: number;
  foregroundThrottleMs?: number;
  /** Deadline when the OS grants background time without saying how much. */
  backgroundDeadlineMs?: number;
  /** Kept free before the OS deadline so a cancelled pass can settle. */
  backgroundSafetyMarginMs?: number;
  now?: () => number;
}

interface BackgroundWindow {
  closed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  execution: RuntimeBackgroundExecution | null;
}

/** Runtime-only orchestration; it owns no UI and never imports Notifications. */
export class SyncRuntime {
  private engine: RuntimeSyncEngine | null = null;
  private subscriptions: RuntimeSubscription[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readinessTimer: ReturnType<typeof setTimeout> | null = null;
  private foregroundTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private active = true;
  private lastForegroundAt = -Infinity;
  private running: Promise<RuntimePassResult | null> | null = null;
  private passController: AbortController | null = null;
  private stopped = true;
  private starting: Promise<void> | null = null;
  private wasOnline = false;
  private lifecycle = 0;
  /** A caller that joined the running pass and still needs one after it. */
  private rerunTrigger: CloudSyncTrigger | null = null;
  /** The engine reported more work after the latest pass. */
  private pendingWorkTrigger: CloudSyncTrigger | null = null;
  private lastFailureCategory: CloudSyncFailureCategory | null = null;
  /** A local edit was committed since the latest pass started. */
  private localEditPending = false;
  private backgroundWindow: BackgroundWindow | null = null;

  constructor(private readonly options: SyncRuntimeOptions) {}

  /**
   * Starts the runtime and runs its first pass. A second call while that start
   * is in flight shares it, so a manual pass never runs before the engine exists.
   */
  start(): Promise<void> {
    if (!this.stopped) return this.starting ?? Promise.resolve();
    const starting = this.startOnce().finally(() => {
      if (this.starting === starting) this.starting = null;
    });
    this.starting = starting;
    return starting;
  }

  private async startOnce(): Promise<void> {
    const lifecycle = ++this.lifecycle;
    this.stopped = false;
    this.lastFailureCategory = null;
    let online = false;
    try {
      online = await this.options.platform.getNetworkOnline();
    } catch {
      this.lastFailureCategory = 'offline';
    }
    if (this.stopped || lifecycle !== this.lifecycle) return;
    this.wasOnline = online;
    this.active = (this.options.platform.getAppState?.() ?? 'active') === 'active';
    const subscriptions = [
      this.options.platform.addAppStateListener((state) => {
        const becameActive = state === 'active' && !this.active;
        this.active = state === 'active';
        if (becameActive) {
          // Foreground passes run unbounded again.
          if (this.backgroundWindow) this.closeBackgroundWindow(this.backgroundWindow);
          this.requestForegroundPass();
          this.scheduleHeartbeat();
        }
        if (!this.active) {
          this.clearHeartbeat();
          this.clearForegroundTimer();
          if (this.debounceTimer) this.options.platform.clearTimer(this.debounceTimer);
          this.debounceTimer = null;
        }
        // Edits waiting out the debounce are published now, without waiting for it.
        if (state === 'background') void this.runBoundedBackgroundPass('backgrounding');
      }),
      this.options.platform.addNetworkListener((nextOnline) => {
        this.wasOnline = nextOnline;
        // Network listeners also fire for an online transport change, such as
        // cellular -> Wi-Fi. That transition must retry Wi-Fi-only media even
        // though the coarse online boolean remains true.
        if (nextOnline) this.schedule('connectivity-restored');
      }),
    ];
    if (this.options.addMutationListener) {
      subscriptions.push(
        this.options.addMutationListener(() => {
          this.localEditPending = true;
          this.schedule('local-mutation');
        }),
      );
    }
    if (this.stopped || lifecycle !== this.lifecycle) {
      subscriptions.forEach((subscription) => subscription.remove());
      return;
    }
    this.subscriptions = subscriptions;
    await this.tryEnable(lifecycle);
  }

  stop(): void {
    this.stopped = true;
    this.starting = null;
    this.lifecycle++;
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    if (this.debounceTimer) this.options.platform.clearTimer(this.debounceTimer);
    if (this.readinessTimer) this.options.platform.clearTimer(this.readinessTimer);
    this.debounceTimer = null;
    this.readinessTimer = null;
    this.clearHeartbeat();
    this.clearForegroundTimer();
    this.lastForegroundAt = -Infinity;
    this.rerunTrigger = null;
    this.localEditPending = false;
    // Its deadline must not cancel a later lifecycle's pass, but the OS time
    // stays until the aborted pass settled (runBoundedBackgroundPass ends it).
    this.detachBackgroundWindow();
    // Abort the running pass; a connection change then drains it before it
    // touches credentials (CloudConnectionLifecycle.change).
    this.passController?.abort();
    this.passController = null;
    this.running = null;
    this.lastFailureCategory = null;
    // A later start must reconstruct from the durable checkpoint. Retaining an
    // engine here would keep the previous vault attached across Disconnect →
    // connect or pause/resume and bypass the vault-switch teardown in load().
    this.engine = null;
  }

  /**
   * Runs, or joins, a pass under OS background time. It is cancelled before the
   * OS deadline, and edits committed while it runs get a follow-up pass.
   */
  async runBoundedBackgroundPass(
    trigger: Extract<CloudSyncTrigger, 'backgrounding' | 'periodic'>,
  ): Promise<RuntimePassResult | null> {
    if (this.stopped || !this.engine || !this.wasOnline) {
      return this.startRun(trigger, false);
    }
    const window = this.openBackgroundWindow();
    try {
      return await this.startRun(trigger, false);
    } finally {
      // Ends the OS background time only after the pass, even a cancelled one, settled.
      this.closeBackgroundWindow(window);
    }
  }

  async run(trigger: CloudSyncTrigger): Promise<RuntimePassResult | null> {
    return this.startRun(trigger, true);
  }

  getLastFailureCategory(): CloudSyncFailureCategory | null {
    return this.lastFailureCategory;
  }

  private async startRun(
    trigger: CloudSyncTrigger,
    allowFollowup: boolean,
  ): Promise<RuntimePassResult | null> {
    if (this.stopped || !this.engine) return null;
    if (!this.wasOnline) {
      this.lastFailureCategory = 'offline';
      return null;
    }
    if (this.running) {
      if (allowFollowup) this.rerunTrigger = trigger;
      return this.running;
    }
    const controller = new AbortController();
    this.passController = controller;
    const running: Promise<RuntimePassResult | null> = this.runLoop(
      trigger,
      allowFollowup,
      controller.signal,
    )
      .finally(() => {
        if (this.running === running) this.running = null;
        if (this.passController === controller) this.passController = null;
      })
      .then((result) => {
        // A background deadline cancelled this loop, but the app came back to
        // the foreground meanwhile and a pass joined it. Callers waiting here,
        // such as Sync now, get that pass's result rather than the cancellation.
        const joined = this.rerunTrigger;
        if (controller.signal.aborted && joined && !this.stopped && this.active) {
          return this.run(joined);
        }
        return result;
      });
    this.running = running;
    return running;
  }

  private async runLoop(
    initialTrigger: CloudSyncTrigger,
    allowFollowup: boolean,
    signal: AbortSignal,
  ): Promise<RuntimePassResult | null> {
    const lifecycle = this.lifecycle;
    let trigger = initialTrigger;
    let finalResult: RuntimePassResult | null = null;
    do {
      this.rerunTrigger = null;
      this.pendingWorkTrigger = null;
      finalResult = await this.runOne(trigger, signal);
      // A bounded background loop leaves remaining engine work (media) to later
      // passes. In background no debounce timer runs, so an edit committed
      // during the pass is published by a follow-up while the OS grants time.
      const followup =
        this.rerunTrigger ??
        (allowFollowup ? this.pendingWorkTrigger : null) ??
        (this.localEditPending && this.backgroundWindow ? 'local-mutation' : null);
      if (
        !followup ||
        signal.aborted ||
        this.stopped ||
        lifecycle !== this.lifecycle ||
        !this.wasOnline
      )
        break;
      trigger = followup;
    } while (true);
    return finalResult;
  }

  private async runOne(
    trigger: CloudSyncTrigger,
    signal: AbortSignal,
    retryConnectionChange = true,
  ): Promise<RuntimePassResult | null> {
    const lifecycle = this.lifecycle;
    const startedAt = (this.options.now ?? Date.now)();
    // Edits committed from here on may miss this pass's snapshot.
    this.localEditPending = false;
    this.options.analytics?.started(trigger);
    try {
      const result = await this.engine!.sync(signal);
      const elapsed = (this.options.now ?? Date.now)() - startedAt;
      if (!this.stopped && lifecycle === this.lifecycle) {
        this.options.analytics?.succeeded({
          duration_bucket: toCloudSyncDurationBucket(elapsed),
          pulled_bucket: toCloudSyncCountBucket(result.pulled),
          pushed_bucket: toCloudSyncCountBucket(result.pushed),
        });
        this.lastFailureCategory = null;
      }
      if (
        !this.stopped &&
        lifecycle === this.lifecycle &&
        this.engine?.hasPendingWork?.()
      ) {
        this.pendingWorkTrigger = trigger;
      }
      return result;
    } catch (error) {
      // Cancellation is not a failure: record no category or analytics.
      if (error instanceof SyncCancelledError) return null;
      let failure = error;
      if (
        error instanceof CloudConnectionChangedError &&
        retryConnectionChange &&
        !this.stopped &&
        lifecycle === this.lifecycle
      ) {
        try {
          await this.options.waitForConnectionChange?.();
          if (
            this.stopped ||
            lifecycle !== this.lifecycle ||
            !this.active ||
            !this.wasOnline
          )
            return null;
          // Never retry the old engine: its captured connection epoch is invalid.
          const engine = await this.options.createEngine();
          if (this.stopped || lifecycle !== this.lifecycle) return null;
          this.engine = engine;
          if (!engine) return null; // Disconnect, pause, or pending setup.
          return await this.runOne(trigger, signal, false);
        } catch (retryError) {
          if (retryError instanceof SyncCancelledError) return null;
          failure = retryError;
        }
      }
      if (!this.stopped && lifecycle === this.lifecycle) {
        this.lastFailureCategory = readCloudSyncFailureCategory(failure);
        this.options.analytics?.failed(this.lastFailureCategory);
      }
      return null;
    }
  }

  private openBackgroundWindow(): BackgroundWindow {
    if (this.backgroundWindow) return this.backgroundWindow;
    const window: BackgroundWindow = { closed: false, timer: null, execution: null };
    this.backgroundWindow = window;
    const armDeadline = (delayMs: number) => {
      if (this.backgroundWindow !== window) return;
      window.timer = this.options.platform.setTimer(() => {
        window.timer = null;
        // Cancels like stop(): the pass settles its local state before it ends.
        if (this.backgroundWindow === window) this.passController?.abort();
      }, delayMs);
    };
    const begin = this.options.platform.beginBackgroundExecution;
    if (!begin) return window;
    // The pass starts without waiting for the OS answer.
    begin(() => {
      // The OS ended the time already; stop whatever is still running.
      if (window.closed) return;
      if (this.backgroundWindow === window) this.passController?.abort();
      window.execution = null;
      this.closeBackgroundWindow(window);
    }).then(
      (execution) => {
        if (window.closed) {
          execution?.end();
          return;
        }
        window.execution = execution;
        if (!execution) return;
        armDeadline(
          execution.remainingMs === null
            ? (this.options.backgroundDeadlineMs ?? 25_000)
            : Math.max(
                0,
                execution.remainingMs - (this.options.backgroundSafetyMarginMs ?? 5_000),
              ),
        );
      },
      () => {
        // No OS time: the pass runs as long as the process does, as before.
      },
    );
    return window;
  }

  private detachBackgroundWindow(): void {
    const window = this.backgroundWindow;
    if (!window) return;
    if (window.timer) this.options.platform.clearTimer(window.timer);
    window.timer = null;
    this.backgroundWindow = null;
  }

  private closeBackgroundWindow(window: BackgroundWindow): void {
    if (window.closed) return;
    window.closed = true;
    if (window.timer) this.options.platform.clearTimer(window.timer);
    window.timer = null;
    window.execution?.end();
    window.execution = null;
    if (this.backgroundWindow === window) this.backgroundWindow = null;
  }

  private async tryEnable(lifecycle = this.lifecycle): Promise<void> {
    if (this.stopped || lifecycle !== this.lifecycle || this.engine) return;
    try {
      if (!(await this.options.readiness.isReady())) {
        try {
          await this.options.readiness.retryBackfill();
        } catch {
          // Readiness stays closed; the in-session timer retries the checkpoint.
        }
      }
      if (this.stopped || lifecycle !== this.lifecycle) return;
      if (await this.options.readiness.isReady()) {
        if (this.stopped || lifecycle !== this.lifecycle) return;
        const engine = await this.options.createEngine();
        if (this.stopped || lifecycle !== this.lifecycle) return;
        this.engine = engine;
        if (this.engine) {
          this.options.analytics?.connected(this.engine.provider.kind);
          if (this.active) {
            this.lastForegroundAt = (this.options.now ?? Date.now)();
            await this.run('app-active');
            this.scheduleHeartbeat();
          }
        }
        return;
      }
    } catch (error) {
      if (this.stopped || lifecycle !== this.lifecycle) return;
      this.lastFailureCategory = readCloudSyncFailureCategory(error);
      this.options.analytics?.failed(this.lastFailureCategory);
    }
    this.scheduleReadinessRetry(lifecycle);
  }

  private scheduleReadinessRetry(lifecycle: number): void {
    if (this.readinessTimer || this.stopped || lifecycle !== this.lifecycle) return;
    this.readinessTimer = this.options.platform.setTimer(() => {
      this.readinessTimer = null;
      void this.tryEnable(lifecycle);
    }, this.options.readinessRetryMs ?? 5_000);
  }

  private requestForegroundPass(): void {
    const now = (this.options.now ?? Date.now)();
    const remaining =
      (this.options.foregroundThrottleMs ?? 5_000) - (now - this.lastForegroundAt);
    if (remaining > 0) {
      if (!this.foregroundTimer) {
        this.foregroundTimer = this.options.platform.setTimer(() => {
          this.foregroundTimer = null;
          if (!this.stopped && this.active) this.requestForegroundPass();
        }, remaining);
      }
      return;
    }
    this.clearForegroundTimer();
    this.lastForegroundAt = now;
    // Foreground reads should not wait behind the local-edit debounce.
    void this.run('app-active');
  }

  private clearForegroundTimer(): void {
    if (this.foregroundTimer) this.options.platform.clearTimer(this.foregroundTimer);
    this.foregroundTimer = null;
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) this.options.platform.clearTimer(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleHeartbeat(): void {
    if (this.stopped || !this.active || !this.engine || this.heartbeatTimer) return;
    const lifecycle = this.lifecycle;
    this.heartbeatTimer = this.options.platform.setTimer(() => {
      this.heartbeatTimer = null;
      if (this.stopped || !this.active || lifecycle !== this.lifecycle) return;
      // Do not queue redundant passes when a slow sync already owns the engine.
      const pass = this.running ?? this.run('periodic');
      void pass.finally(() => {
        if (lifecycle === this.lifecycle) this.scheduleHeartbeat();
      });
    }, this.options.heartbeatMs ?? 120_000);
  }

  private schedule(trigger: CloudSyncTrigger): void {
    if (this.stopped || !this.active) return;
    if (this.debounceTimer) this.options.platform.clearTimer(this.debounceTimer);
    this.debounceTimer = this.options.platform.setTimer(() => {
      this.debounceTimer = null;
      void this.run(trigger);
    }, this.options.debounceMs ?? 30_000);
  }
}
