import type { CloudSyncFailureCategory } from '../../analytics/events';
import { SyncCancelledError } from '../snapshot/sync/errors';
import { SyncRuntime, type RuntimePlatform } from './SyncRuntime';

class CategorizedFailure extends Error {
  constructor(readonly category: CloudSyncFailureCategory) {
    super(category);
  }
}

const ok = { pulled: 0, pushed: 0 };

function setup({ random = 1 }: { random?: number } = {}) {
  let appState: 'active' | 'background' | 'inactive' = 'active';
  let onAppState: (state: typeof appState) => void = () => {};
  let onNetwork: (online: boolean) => void = () => {};
  let onMutation: () => void = () => {};
  const sync = jest.fn(async (_signal?: AbortSignal) => ok);
  const random_ = jest.fn(() => random);
  const platform: RuntimePlatform = {
    getAppState: () => appState,
    getNetworkOnline: async () => true,
    addAppStateListener: (listener) => {
      onAppState = listener;
      return { remove: () => (onAppState = () => {}) };
    },
    addNetworkListener: (listener) => {
      onNetwork = listener;
      return { remove: () => (onNetwork = () => {}) };
    },
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
  };
  const runtime = new SyncRuntime({
    platform,
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => ({ provider: { kind: 'google-drive' }, sync }),
    addMutationListener: (listener) => {
      onMutation = listener;
      return { remove: () => (onMutation = () => {}) };
    },
    random: random_,
  });
  return {
    runtime,
    sync,
    random: random_,
    fail: (category: CloudSyncFailureCategory, times = 1) => {
      for (let i = 0; i < times; i++)
        sync.mockImplementationOnce(async () => {
          throw new CategorizedFailure(category);
        });
    },
    state: (next: typeof appState) => {
      appState = next;
      onAppState(next);
    },
    network: (online: boolean) => onNetwork(online),
    mutate: () => onMutation(),
  };
}

/** Times, relative to the first pass, at which each later pass started. */
async function passTimes(app: ReturnType<typeof setup>, untilMs: number) {
  const start = Date.now();
  const times: number[] = [];
  app.sync.mockImplementation(async () => {
    times.push(Date.now() - start);
    throw new CategorizedFailure('transient');
  });
  await jest.advanceTimersByTimeAsync(untilMs);
  return times;
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('transient failures retry with doubling delays, then leave it to the heartbeat', async () => {
  const app = setup();
  app.fail('transient');
  await app.runtime.start();
  expect(app.sync).toHaveBeenCalledTimes(1);
  // random() = 1 puts each retry at its ceiling: 10 s, 20 s, 40 s, 80 s.
  // The fourth would land after the heartbeat at 120 s, so the heartbeat runs it.
  const times = await passTimes(app, 120_000);
  expect(times).toEqual([10_000, 30_000, 70_000, 120_000]);
  // After four retries only the heartbeat runs.
  expect(await passTimes(app, 240_000)).toEqual([120_000, 240_000]);
  app.runtime.stop();
});

test('jitter keeps each delay between half its ceiling and the ceiling', async () => {
  const low = setup({ random: 0 });
  low.fail('rate-limit');
  await low.runtime.start();
  await jest.advanceTimersByTimeAsync(4_999);
  expect(low.sync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(low.sync).toHaveBeenCalledTimes(2);
  low.runtime.stop();

  const high = setup({ random: 0.999 });
  high.fail('transient');
  await high.runtime.start();
  // 5 s + 0.999 × 5 s = 9 995 ms.
  await jest.advanceTimersByTimeAsync(9_994);
  expect(high.sync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(high.sync).toHaveBeenCalledTimes(2);
  high.runtime.stop();
});

test('the delay never exceeds the cap', async () => {
  const app = setup();
  const runtime = new SyncRuntime({
    platform: {
      getNetworkOnline: async () => true,
      addAppStateListener: () => ({ remove: () => {} }),
      addNetworkListener: () => ({ remove: () => {} }),
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
    },
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => ({ provider: { kind: 'google-drive' }, sync: app.sync }),
    heartbeatMs: 10_000_000,
    retryBaseMs: 30_000,
    retryMaxMs: 50_000,
    retryMaxAttempts: 10,
    random: () => 1,
  });
  app.fail('transient');
  await runtime.start();
  const times = await passTimes(app, 200_000);
  // 30 s, then capped at 50 s.
  expect(times).toEqual([30_000, 80_000, 130_000, 180_000]);
  runtime.stop();
});

test.each<CloudSyncFailureCategory>([
  'auth',
  'quota',
  'corrupt',
  'local-media',
  'offline',
  'wifi-only-media',
  'unknown',
])('a %s failure is not retried before the heartbeat', async (category) => {
  const app = setup();
  app.fail(category);
  await app.runtime.start();
  expect(app.runtime.getLastFailureCategory()).toBe(category);
  await jest.advanceTimersByTimeAsync(119_999);
  expect(app.sync).toHaveBeenCalledTimes(1);
  app.runtime.stop();
});

test('a cancelled pass is not retried', async () => {
  const app = setup();
  app.sync.mockImplementationOnce(async () => {
    throw new SyncCancelledError();
  });
  await app.runtime.start();
  await jest.advanceTimersByTimeAsync(119_999);
  expect(app.sync).toHaveBeenCalledTimes(1);
  app.runtime.stop();
});

test('success resets the backoff', async () => {
  const app = setup();
  app.fail('transient', 3);
  await app.runtime.start();
  // Retries at 10 s and 30 s fail; the one at 70 s succeeds.
  await jest.advanceTimersByTimeAsync(70_000);
  expect(app.sync).toHaveBeenCalledTimes(4);
  // No retry after a success.
  await jest.advanceTimersByTimeAsync(49_999);
  expect(app.sync).toHaveBeenCalledTimes(4);
  // The next failure starts again from the first delay.
  app.fail('transient');
  await app.runtime.run('periodic');
  expect(app.sync).toHaveBeenCalledTimes(5);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(app.sync).toHaveBeenCalledTimes(6);
  app.runtime.stop();
});

test('Sync now and a connectivity change start a fresh backoff', async () => {
  const app = setup();
  app.fail('transient', 4);
  await app.runtime.start();
  await jest.advanceTimersByTimeAsync(30_000); // Retries at 10 s and 30 s failed.
  expect(app.sync).toHaveBeenCalledTimes(3);
  await app.runtime.run('manual'); // Fails; the retry is 10 s again, not 40 s.
  expect(app.sync).toHaveBeenCalledTimes(4);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(app.sync).toHaveBeenCalledTimes(5);

  app.fail('transient');
  await app.runtime.run('periodic');
  expect(app.sync).toHaveBeenCalledTimes(6);
  // Connectivity replaces the pending retry with its debounced pass.
  app.network(true);
  await jest.advanceTimersByTimeAsync(29_999);
  expect(app.sync).toHaveBeenCalledTimes(6);
  await jest.advanceTimersByTimeAsync(1);
  expect(app.sync).toHaveBeenCalledTimes(7);
  app.runtime.stop();
});

test('a retry never runs while a pass is in flight and never adds a pass of its own', async () => {
  const app = setup();
  app.fail('transient');
  await app.runtime.start();
  let finish!: () => void;
  app.sync.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(ok);
      }),
  );
  // A manual pass starts before the retry and is still running when it is due.
  const manual = app.runtime.run('manual');
  expect(app.sync).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(20_000);
  expect(app.sync).toHaveBeenCalledTimes(2);
  finish();
  await manual;
  await jest.advanceTimersByTimeAsync(60_000);
  expect(app.sync).toHaveBeenCalledTimes(2);
  app.runtime.stop();
});

test('a pending debounced pass takes the place of a due retry', async () => {
  const app = setup();
  app.fail('transient');
  await app.runtime.start();
  // The edit's debounce ends at 30 s; the retry is due at 10 s.
  app.mutate();
  await jest.advanceTimersByTimeAsync(10_000);
  expect(app.sync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(20_000);
  expect(app.sync).toHaveBeenCalledTimes(2);
  // The debounced pass succeeded, so nothing else runs before the heartbeat.
  await jest.advanceTimersByTimeAsync(89_999);
  expect(app.sync).toHaveBeenCalledTimes(2);
  app.runtime.stop();
});

test('backgrounding and stop() cancel a pending retry', async () => {
  const app = setup();
  app.fail('transient');
  await app.runtime.start();
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  const afterBackground = app.sync.mock.calls.length;
  await jest.advanceTimersByTimeAsync(600_000);
  expect(app.sync).toHaveBeenCalledTimes(afterBackground);

  const stopped = setup();
  stopped.fail('transient');
  await stopped.runtime.start();
  stopped.runtime.stop();
  await jest.advanceTimersByTimeAsync(600_000);
  expect(stopped.sync).toHaveBeenCalledTimes(1);
});

test('a failure in a background pass schedules no retry', async () => {
  const app = setup();
  await app.runtime.start();
  app.state('background');
  app.fail('transient');
  await app.runtime.runBoundedBackgroundPass('periodic');
  const passes = app.sync.mock.calls.length;
  await jest.advanceTimersByTimeAsync(600_000);
  expect(app.sync).toHaveBeenCalledTimes(passes);
  app.runtime.stop();
});
