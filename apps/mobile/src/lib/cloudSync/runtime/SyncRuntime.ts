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
  /** First retry delay after a transient failure; each further one doubles. */
  retryBaseMs?: number;
  retryMaxMs?: number;
  /** Retries after consecutive transient failures; the heartbeat takes over after. */
  retryMaxAttempts?: number;
  now?: () => number;
  random?: () => number;
}

/**
 * Failures a later pass can get past on its own. Everything else needs the
 * user (reconnect, storage, newer app, a paused safety check) or waits for an
 * event the runtime already handles (connectivity, Wi-Fi for media).
 */
const RETRYABLE_FAILURES: ReadonlySet<CloudSyncFailureCategory> = new Set([
  'transient',
  'rate-limit',
]);

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
  private heartbeatDueAt = Infinity;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Retries scheduled since the latest success, user action or connection change. */
  private retryAttempts = 0;
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
          this.retryAttempts = 0;
          this.requestForegroundPass();
          this.scheduleHeartbeat();
        }
        if (!this.active) {
          this.clearHeartbeat();
          this.clearForegroundTimer();
          this.clearRetry();
          if (this.debounceTimer) this.options.platform.clearTimer(this.debounceTimer);
          this.debounceTimer = null;
        }
        // Edits waiting out the debounce are published now, without waiting for it.
        if (state === 'background') void this.runBoundedBackgroundPass('backgrounding');
      }),
      this.options.platform.addNetworkListener((nextOnline) => {
        this.wasOnline = nextOnline;
        // The debounced pass below replaces any retry, and starts a fresh backoff.
        this.clearRetry();
        this.retryAttempts = 0;
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
    this.clearRetry();
    this.retryAttempts = 0;
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
    if (trigger === 'manual') this.retryAttempts = 0;
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
    const lifecycle = this.lifecycle;
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
        // After stop() a joiner belongs to the restarted runtime, not this loop.
        const joined = this.rerunTrigger;
        if (
          controller.signal.aborted &&
          joined &&
          !this.stopped &&
          lifecycle === this.lifecycle &&
          this.active
        ) {
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
    // This pass's outcome decides the next retry.
    this.clearRetry();
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
        this.retryAttempts = 0;
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
          this.retryAttempts = 0;
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
        this.scheduleRetry(this.lastFailureCategory);
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
    this.heartbeatDueAt = Infinity;
  }

  private clearRetry(): void {
    if (this.retryTimer) this.options.platform.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  /**
   * Retries a transient failure sooner than the heartbeat, with exponential
   * backoff and jitter, in the foreground only. A retry the heartbeat would
   * beat is left to the heartbeat. Drive's Retry-After stays with the
   * transport: a pass inside that window fails before it sends a request.
   */
  private scheduleRetry(category: CloudSyncFailureCategory): void {
    this.clearRetry();
    if (!RETRYABLE_FAILURES.has(category)) return;
    if (this.stopped || !this.active || !this.engine || !this.wasOnline) return;
    if (this.retryAttempts >= (this.options.retryMaxAttempts ?? 4)) return;
    const ceiling = Math.min(
      this.options.retryMaxMs ?? 120_000,
      (this.options.retryBaseMs ?? 10_000) * 2 ** this.retryAttempts,
    );
    this.retryAttempts++;
    // Equal jitter: between half the ceiling and the ceiling.
    const delay = ceiling / 2 + ((this.options.random ?? Math.random)() * ceiling) / 2;
    const now = (this.options.now ?? Date.now)();
    if (this.heartbeatTimer && now + delay >= this.heartbeatDueAt) return;
    const lifecycle = this.lifecycle;
    this.retryTimer = this.options.platform.setTimer(() => {
      this.retryTimer = null;
      if (this.stopped || !this.active || lifecycle !== this.lifecycle) return;
      // A running or debounced pass is the retry; its outcome schedules the next.
      if (this.running || this.debounceTimer) return;
      // Reported as 'periodic': a scheduled pass nobody asked for.
      void this.run('periodic');
    }, delay);
  }

  private scheduleHeartbeat(): void {
    if (this.stopped || !this.active || !this.engine || this.heartbeatTimer) return;
    const lifecycle = this.lifecycle;
    const delayMs = this.options.heartbeatMs ?? 120_000;
    this.heartbeatDueAt = (this.options.now ?? Date.now)() + delayMs;
    this.heartbeatTimer = this.options.platform.setTimer(() => {
      this.heartbeatTimer = null;
      this.heartbeatDueAt = Infinity;
      if (this.stopped || !this.active || lifecycle !== this.lifecycle) return;
      // Do not queue redundant passes when a slow sync already owns the engine.
      const pass = this.running ?? this.run('periodic');
      void pass.finally(() => {
        if (lifecycle === this.lifecycle) this.scheduleHeartbeat();
      });
    }, delayMs);
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
