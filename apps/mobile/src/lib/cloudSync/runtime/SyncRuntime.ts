import type { SyncPassResult } from '../engine';
import type {
  CloudSyncFailureCategory,
  CloudSyncTrigger,
} from '../../analytics/events';
import {
  toCloudSyncCountBucket,
  toCloudSyncDurationBucket,
} from '../../analytics/events';

export interface RuntimeSyncEngine {
  readonly provider: { readonly kind: 'google-drive' | 'dropbox' };
  sync(): Promise<SyncPassResult>;
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
  analytics?: RuntimeAnalytics;
  debounceMs?: number;
  readinessRetryMs?: number;
  now?: () => number;
}

function failureCategory(error: unknown): CloudSyncFailureCategory {
  if (typeof error === 'object' && error !== null && 'category' in error) {
    const category = String((error as { category: unknown }).category);
    if (['auth', 'quota', 'rate-limit', 'corrupt', 'transient'].includes(category)) {
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

  constructor(private readonly options: SyncRuntimeOptions) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    this.wasOnline = await this.options.platform.getNetworkOnline();
    this.subscriptions = [
      this.options.platform.addAppStateListener((state) => {
        if (state === 'active') this.schedule('app-active');
        if (state === 'background') void this.runBoundedBackgroundPass('backgrounding');
      }),
      this.options.platform.addNetworkListener((online) => {
        const restored = online && !this.wasOnline;
        this.wasOnline = online;
        if (restored) this.schedule('connectivity-restored');
      }),
    ];
    await this.tryEnable();
  }

  stop(): void {
    this.stopped = true;
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    if (this.debounceTimer) this.options.platform.clearTimer(this.debounceTimer);
    if (this.readinessTimer) this.options.platform.clearTimer(this.readinessTimer);
    this.debounceTimer = null;
    this.readinessTimer = null;
  }

  async runBoundedBackgroundPass(
    trigger: Extract<CloudSyncTrigger, 'backgrounding' | 'periodic'>,
  ): Promise<SyncPassResult | null> {
    // One engine pass is the bound. Cursor/outbox checkpoints carry remaining
    // work into the next foreground or OS-managed invocation.
    return this.run(trigger);
  }

  async run(trigger: CloudSyncTrigger): Promise<SyncPassResult | null> {
    if (this.stopped || !this.engine || !this.wasOnline) return null;
    if (this.running) return this.running;
    const startedAt = (this.options.now ?? Date.now)();
    this.options.analytics?.started(trigger);
    this.running = this.engine.sync()
      .then((result) => {
        const elapsed = (this.options.now ?? Date.now)() - startedAt;
        this.options.analytics?.succeeded({
          duration_bucket: toCloudSyncDurationBucket(elapsed),
          pulled_bucket: toCloudSyncCountBucket(result.pulled),
          pushed_bucket: toCloudSyncCountBucket(result.pushed),
        });
        return result;
      })
      .catch((error: unknown) => {
        this.options.analytics?.failed(failureCategory(error));
        return null;
      })
      .finally(() => { this.running = null; });
    return this.running;
  }

  private async tryEnable(): Promise<void> {
    if (this.stopped || this.engine) return;
    if (!(await this.options.readiness.isReady())) {
      try {
        await this.options.readiness.retryBackfill();
      } catch {
        // Readiness stays closed; the in-session timer retries the checkpoint.
      }
    }
    if (await this.options.readiness.isReady()) {
      this.engine = await this.options.createEngine();
      if (this.engine) {
        this.options.analytics?.connected(this.engine.provider.kind);
        await this.run('app-active');
      }
      return;
    }
    this.readinessTimer = this.options.platform.setTimer(() => {
      this.readinessTimer = null;
      void this.tryEnable();
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
