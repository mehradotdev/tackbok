import { SyncRuntime, type RuntimePlatform } from './SyncRuntime';

function setup() {
  let appState: 'active' | 'background' | 'inactive' = 'active';
  let onAppState: (state: typeof appState) => void = () => {};
  let onNetwork: (online: boolean) => void = () => {};
  let onMutation: () => void = () => {};
  const sync = jest.fn(async () => ({ pulled: 0, pushed: 0 }));
  const platform: RuntimePlatform = {
    getAppState: () => appState,
    getNetworkOnline: async () => true,
    addAppStateListener: listener => {
      onAppState = listener;
      return { remove: () => { onAppState = () => {}; } };
    },
    addNetworkListener: listener => {
      onNetwork = listener;
      return { remove: () => { onNetwork = () => {}; } };
    },
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: timer => clearTimeout(timer),
  };
  const runtime = new SyncRuntime({
    platform,
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => ({ provider: { kind: 'google-drive' }, sync }),
    addMutationListener: listener => {
      onMutation = listener;
      return { remove: () => { onMutation = () => {}; } };
    },
  });
  return {
    runtime, sync,
    state: (next: typeof appState) => { appState = next; onAppState(next); },
    network: (online: boolean) => onNetwork(online),
    mutate: () => onMutation(),
  };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('an idle foreground device checks cloud every two minutes without local edits', async () => {
  const { runtime, sync } = setup();
  await runtime.start();
  expect(sync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(119_999);
  expect(sync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(sync).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(120_000);
  expect(sync).toHaveBeenCalledTimes(3);
  runtime.stop();
  await jest.advanceTimersByTimeAsync(240_000);
  expect(sync).toHaveBeenCalledTimes(3);
});

test('backgrounding stops the heartbeat and returning checks immediately', async () => {
  const app = setup();
  await app.runtime.start();
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  const backgroundPasses = app.sync.mock.calls.length;
  await jest.advanceTimersByTimeAsync(240_000);
  expect(app.sync).toHaveBeenCalledTimes(backgroundPasses);
  app.state('active');
  expect(app.sync).toHaveBeenCalledTimes(backgroundPasses + 1);
  await jest.advanceTimersByTimeAsync(120_000);
  expect(app.sync).toHaveBeenCalledTimes(backgroundPasses + 2);
  app.runtime.stop();
});

test('offline heartbeats make no requests and resume after connectivity returns', async () => {
  const app = setup();
  await app.runtime.start();
  app.network(false);
  await jest.advanceTimersByTimeAsync(240_000);
  expect(app.sync).toHaveBeenCalledTimes(1);
  app.network(true);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(app.sync).toHaveBeenCalledTimes(2);
  app.runtime.stop();
});

test('continuous local edits cannot postpone the foreground heartbeat', async () => {
  const app = setup();
  await app.runtime.start();
  for (let i = 0; i < 6; i++) {
    app.mutate();
    await jest.advanceTimersByTimeAsync(20_000);
  }
  expect(app.sync).toHaveBeenCalledTimes(2);
  app.runtime.stop();
});

test('a heartbeat does not overlap or queue an extra pass behind a slow manual sync', async () => {
  const app = setup();
  await app.runtime.start();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  app.sync.mockImplementationOnce(async () => { await pending; return { pulled: 0, pushed: 0 }; });
  const manual = app.runtime.run('manual');
  await jest.advanceTimersByTimeAsync(240_000);
  expect(app.sync).toHaveBeenCalledTimes(2);
  finish();
  await manual;
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(120_000);
  expect(app.sync).toHaveBeenCalledTimes(3);
  app.runtime.stop();
});


test('a quick inactive return gets a trailing check at the throttle deadline', async () => {
  const app = setup();
  await app.runtime.start();
  await jest.advanceTimersByTimeAsync(1_000);
  app.state('inactive');
  app.state('active');
  await jest.advanceTimersByTimeAsync(3_999);
  expect(app.sync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(app.sync).toHaveBeenCalledTimes(2);
  app.runtime.stop();
});

test('stopping the runtime cancels a throttled foreground check', async () => {
  const app = setup();
  await app.runtime.start();
  app.state('inactive');
  app.state('active');
  app.runtime.stop();
  await jest.advanceTimersByTimeAsync(5_000);
  expect(app.sync).toHaveBeenCalledTimes(1);
});
