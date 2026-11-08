import { GoogleDriveSnapshotProvider } from '../snapshot/drive/googleDriveSnapshotProvider';
import type { DriveResponseLike } from '../snapshot/drive/transport';
import { MemoryDriveProviderStateStore } from '../snapshot/drive/state';
import { SyncCancelledError } from '../snapshot/sync/errors';
import { SyncRuntime } from './SyncRuntime';
import { CloudConnectionLifecycle } from './connectionLifecycle';

const auth = {
  authorize: async () => ({ accessToken: 'synthetic-access', expiresAt: 0 }),
  getFreshAccessToken: async () => 'synthetic-access',
  clearInvalidAccessToken: async () => {},
  signOut: async () => {},
  getAccountLabel: async () => 'Synthetic account',
};

function stalledDrive(signal: () => AbortSignal | null) {
  const requests: string[] = [];
  const provider = new GoogleDriveSnapshotProvider({
    auth,
    state: new MemoryDriveProviderStateStore(),
    // A request that never answers, like a stalled or suspended connection.
    fetch: (url) => {
      requests.push(url);
      return new Promise<DriveResponseLike>(() => {});
    },
    signal,
  });
  return { provider, requests };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('Disconnect aborts a pass blocked in a Drive request and drains it before running', async () => {
  const lifecycle = new CloudConnectionLifecycle();
  let passSignal: AbortSignal | null = null;
  const drive = stalledDrive(() => passSignal);
  const events: string[] = [];
  const pass = lifecycle.runPass(lifecycle.epoch, async (signal) => {
    passSignal = signal;
    try {
      await drive.provider.listRevocations('vault');
    } finally {
      // Local state still settling after the request was cancelled.
      await tick();
      events.push('pass settled');
    }
  });
  const cancelled = expect(pass).rejects.toBeInstanceOf(SyncCancelledError);
  await tick();
  expect(drive.requests).toHaveLength(1);

  await lifecycle.change(async () => {
    events.push('credentials cleared');
  });
  await cancelled;
  expect(events).toEqual(['pass settled', 'credentials cleared']);
  expect(drive.requests).toHaveLength(1);
});

test('a cancelled pass is not recorded as a sync failure', async () => {
  const lifecycle = new CloudConnectionLifecycle();
  const failed = jest.fn();
  let passSignal: AbortSignal | null = null;
  const drive = stalledDrive(() => passSignal);
  let entered!: () => void;
  const inRequest = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const runtime = new SyncRuntime({
    platform: {
      getAppState: () => 'background',
      getNetworkOnline: async () => true,
      addAppStateListener: () => ({ remove() {} }),
      addNetworkListener: () => ({ remove() {} }),
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
    },
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => ({
      provider: { kind: 'google-drive' },
      sync: () =>
        lifecycle.runPass(lifecycle.epoch, async (signal) => {
          passSignal = signal;
          entered();
          await drive.provider.listRevocations('vault');
          return { pulled: 0, pushed: 0 };
        }),
    }),
    analytics: {
      connected: () => {},
      started: () => {},
      succeeded: () => {},
      failed,
    },
  });
  await runtime.start();
  const run = runtime.run('manual');
  await inRequest;
  // A background or other connection change, without a runtime stop first.
  await lifecycle.change(async () => {});
  await expect(run).resolves.toBeNull();
  expect(runtime.getLastFailureCategory()).toBeNull();
  expect(failed).not.toHaveBeenCalled();

  // stop() alone also aborts the runtime's own pass.
  const stopped = jest.fn(
    (signal?: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new SyncCancelledError()));
      }),
  );
  const stopRuntime = new SyncRuntime({
    platform: {
      getAppState: () => 'background',
      getNetworkOnline: async () => true,
      addAppStateListener: () => ({ remove() {} }),
      addNetworkListener: () => ({ remove() {} }),
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
    },
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => ({ provider: { kind: 'google-drive' }, sync: stopped }),
    analytics: { connected: () => {}, started: () => {}, succeeded: () => {}, failed },
  });
  await stopRuntime.start();
  const stoppedRun = stopRuntime.run('manual');
  await tick();
  stopRuntime.stop();
  await expect(stoppedRun).resolves.toBeNull();
  expect(failed).not.toHaveBeenCalled();
});

test('a manual pass asked for while the runtime starts waits for its engine', async () => {
  let engineReady!: () => void;
  const creating = new Promise<void>((resolve) => {
    engineReady = resolve;
  });
  const sync = jest.fn(async () => ({ pulled: 0, pushed: 0 }));
  const runtime = new SyncRuntime({
    platform: {
      getAppState: () => 'active',
      getNetworkOnline: async () => true,
      addAppStateListener: () => ({ remove() {} }),
      addNetworkListener: () => ({ remove() {} }),
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
    },
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => {
      await creating;
      return { provider: { kind: 'google-drive' }, sync };
    },
    heartbeatMs: 60_000,
  });
  // Resume starts the runtime without waiting for it.
  const starting = runtime.start();
  await tick();
  // Sync now, before the engine exists: start() shares the start in flight.
  let manualStarted = false;
  const manual = runtime.start().then(() => {
    manualStarted = true;
    return runtime.run('manual');
  });
  await tick();
  expect(manualStarted).toBe(false);
  engineReady();
  await starting;
  await expect(manual).resolves.not.toBeNull();
  expect(sync).toHaveBeenCalledTimes(2);
  runtime.stop();
});
