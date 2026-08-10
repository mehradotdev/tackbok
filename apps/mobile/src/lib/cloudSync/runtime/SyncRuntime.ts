import type { SyncPassResult } from '../engine';
import type { CloudSyncFailureCategory, CloudSyncTrigger } from '../../analytics/events';
import { toCloudSyncCountBucket, toCloudSyncDurationBucket } from '../../analytics/events';

export interface RuntimeSyncEngine {
  readonly provider: { readonly kind: 'google-drive' | 'dropbox' };
  sync(): Promise<SyncPassResult>;
  hasPendingWork?(): boolean;
}

export interface RuntimeSubscription { remove(): void; }

export interface RuntimePlatform {
  addAppStateListener(listener: (state: 'active' | 'background' | 'inactive') => void): RuntimeSubscription;
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
  addMutationListener?(listener: () => void): RuntimeSubscription;
  analytics?: RuntimeAnalytics;
  debounceMs?: number;
  readinessRetryMs?: number;
  now?: () => number;
}

function failureCategory(error: unknown): CloudSyncFailureCategory {
  if (typeof error === 'object' && error !== null && 'category' in error) {
    const category = String((error as { category: unknown }).category);
    if (['auth', 'quota', 'rate-limit', 'offline', 'corrupt', 'transient'].includes(category)) {
      return category as CloudSyncFailureCategory;
    }
  }
  return 'unknown';
}

/** Runtime-only orchestration; it owns no UI and never imports Notifications. */
export class SyncRuntime {
  private engine: RuntimeSyncEngine | null = null;
  private subscriptions: RuntimeSubscription[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readinessTimer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<SyncPassResult | null> | null = null;
  private stopped = true;
  private wasOnline = false;
  private lifecycle = 0;
  private rerunTrigger: CloudSyncTrigger | null = null;

  constructor(private readonly options: SyncRuntimeOptions) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    const lifecycle = ++this.lifecycle;
    this.stopped = false;
    const online = await this.options.platform.getNetworkOnline();
    if (this.stopped || lifecycle !== this.lifecycle) return;
    this.wasOnline = online;
    const subscriptions = [
      this.options.platform.addAppStateListener((state) => {
        if (state === 'active') this.schedule('app-active');
        if (state === 'background') void this.runBoundedBackgroundPass('backgrounding');
      }),
      this.options.platform.addNetworkListener((nextOnline) => {
        const restored = nextOnline && !this.wasOnline;
        this.wasOnline = nextOnline;
        if (restored) this.schedule('connectivity-restored');
      }),
    ];
    if (this.options.addMutationListener) {
      subscriptions.push(this.options.addMutationListener(() => this.schedule('local-mutation')));
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
    this.lifecycle++;
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    if (this.debounceTimer) this.options.platform.clearTimer(this.debounceTimer);
    if (this.readinessTimer) this.options.platform.clearTimer(this.readinessTimer);
    this.debounceTimer = null;
    this.readinessTimer = null;
    this.rerunTrigger = null;
    // A later start must reconstruct from the durable checkpoint. Retaining an
    // engine here would keep the previous vault attached across Disconnect →
    // connect or pause/resume and bypass the vault-switch teardown in load().
    this.engine = null;
  }

  async runBoundedBackgroundPass(
    trigger: Extract<CloudSyncTrigger, 'backgrounding' | 'periodic'>,
  ): Promise<SyncPassResult | null> {
    return this.startRun(trigger, false);
  }

  async run(trigger: CloudSyncTrigger): Promise<SyncPassResult | null> {
    return this.startRun(trigger, true);
  }

  private async startRun(
    trigger: CloudSyncTrigger,
    allowFollowup: boolean,
  ): Promise<SyncPassResult | null> {
    if (this.stopped || !this.engine || !this.wasOnline) return null;
    if (this.running) {
      if (allowFollowup) this.rerunTrigger = trigger;
      return this.running;
    }
    this.running = this.runLoop(trigger, allowFollowup)
      .finally(() => { this.running = null; });
    return this.running;
  }

  private async runLoop(
    initialTrigger: CloudSyncTrigger,
    allowFollowup: boolean,
  ): Promise<SyncPassResult | null> {
    let trigger = initialTrigger;
    let finalResult: SyncPassResult | null = null;
    do {
      this.rerunTrigger = null;
      finalResult = await this.runOne(trigger);
      const followup = allowFollowup ? this.rerunTrigger : null;
      if (!followup || this.stopped || !this.wasOnline) break;
      trigger = followup;
    } while (true);
    return finalResult;
  }

  private async runOne(trigger: CloudSyncTrigger): Promise<SyncPassResult | null> {
    const startedAt = (this.options.now ?? Date.now)();
    this.options.analytics?.started(trigger);
    try {
      const result = await this.engine!.sync();
      const elapsed = (this.options.now ?? Date.now)() - startedAt;
      this.options.analytics?.succeeded({
        duration_bucket: toCloudSyncDurationBucket(elapsed),
        pulled_bucket: toCloudSyncCountBucket(result.pulled),
        pushed_bucket: toCloudSyncCountBucket(result.pushed),
      });
      if (this.engine?.hasPendingWork?.()) this.rerunTrigger = trigger;
      return result;
    } catch (error) {
      this.options.analytics?.failed(failureCategory(error));
      return null;
    }
  }

  private async tryEnable(lifecycle = this.lifecycle): Promise<void> {
    if (this.stopped || lifecycle !== this.lifecycle || this.engine) return;
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
        await this.run('app-active');
      }
      return;
    }
    this.readinessTimer = this.options.platform.setTimer(() => {
      this.readinessTimer = null;
      void this.tryEnable(lifecycle);
    }, this.options.readinessRetryMs ?? 5_000);
  }

  private schedule(trigger: CloudSyncTrigger): void {
    if (this.stopped) return;
    if (this.debounceTimer) this.options.platform.clearTimer(this.debounceTimer);
    this.debounceTimer = this.options.platform.setTimer(() => {
      this.debounceTimer = null;
      void this.run(trigger);
    }, this.options.debounceMs ?? 30_000);
  }
}
