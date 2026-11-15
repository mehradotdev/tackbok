import { SyncRuntime, type RuntimePlatform } from './SyncRuntime';

type AppState = 'active' | 'background' | 'inactive';

/** Android: a backup that could not run offline asks to be woken once online. */
function setup() {
  // An engine always reporting work would loop follow-up passes; tests set it.
  let pendingWork = false;
  let appState: AppState = 'active';
  let online = true;
  let onAppState: (state: AppState) => void = () => {};
  let onNetwork: (online: boolean) => void = () => {};
  let onRun: () => void = () => {};
  const sync = jest.fn(async () => ({ pulled: 0, pushed: 1 }));
  const end = jest.fn();
  const begin = jest.fn(async () => ({ remainingMs: 240_000, end }));
  const requestBackgroundRun = jest.fn();
  const platform: RuntimePlatform = {
    getAppState: () => appState,
    beginBackgroundExecution: begin,
    requestBackgroundRun,
    addBackgroundRunListener: (listener) => {
      onRun = listener;
      return { remove: () => (onRun = () => {}) };
    },
    getNetworkOnline: async () => online,
    addAppStateListener: (listener) => {
      onAppState = listener;
      return { remove: () => {} };
    },
    addNetworkListener: (listener) => {
      onNetwork = listener;
      return { remove: () => {} };
    },
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
  };
  const runtime = new SyncRuntime({
    platform,
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => ({
      provider: { kind: 'google-drive' },
      sync,
      hasPendingWork: () => pendingWork,
    }),
  });
  return {
    runtime,
    sync,
    begin,
    end,
    requestBackgroundRun,
    state: (next: AppState) => {
      appState = next;
      onAppState(next);
    },
    /** Connectivity as the OS reports it, without the listener having fired yet. */
    setOnline: (next: boolean) => (online = next),
    network: (next: boolean) => {
      online = next;
      onNetwork(next);
    },
    run: () => onRun(),
    /** An edit is waiting to be published. */
    setPendingWork: (next: boolean) => (pendingWork = next),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function started(app: ReturnType<typeof setup>) {
  await app.runtime.start();
  await jest.advanceTimersByTimeAsync(0);
  app.sync.mockClear();
}

test('backgrounding offline with unpublished work asks to be woken once online', async () => {
  const app = setup();
  await started(app);
  app.network(false);
  app.setPendingWork(true);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  expect(app.requestBackgroundRun).toHaveBeenCalledTimes(1);
  // No pass and no OS time while offline.
  expect(app.sync).not.toHaveBeenCalled();
  expect(app.begin).not.toHaveBeenCalled();

  // Woken online before the network listener reported it.
  app.setOnline(true);
  app.setPendingWork(false);
  app.run();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(1);
  expect(app.begin).toHaveBeenCalledTimes(1);
  expect(app.end).toHaveBeenCalledTimes(1);
  app.runtime.stop();
});

test('backgrounding online or with nothing to publish asks for no wake-up', async () => {
  const online = setup();
  await started(online);
  online.setPendingWork(true);
  online.state('background');
  await jest.advanceTimersByTimeAsync(0);
  expect(online.requestBackgroundRun).not.toHaveBeenCalled();
  expect(online.begin).toHaveBeenCalledTimes(1);
  online.runtime.stop();

  const idle = setup();
  await started(idle);
  idle.network(false);
  idle.state('background');
  await jest.advanceTimersByTimeAsync(0);
  expect(idle.requestBackgroundRun).not.toHaveBeenCalled();
  idle.runtime.stop();
});

test('a wake-up in the foreground, still offline, or after stop runs no pass', async () => {
  const app = setup();
  await started(app);
  // Foreground passes run on their own.
  app.run();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).not.toHaveBeenCalled();

  app.network(false);
  app.setPendingWork(true);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  app.run();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).not.toHaveBeenCalled();
  expect(app.begin).not.toHaveBeenCalled();

  app.runtime.stop();
  app.setOnline(true);
  app.run();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).not.toHaveBeenCalled();
});

test('a woken pass that finds the device still offline asks again', async () => {
  const app = setup();
  await started(app);
  app.network(false);
  app.setPendingWork(true);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  expect(app.requestBackgroundRun).toHaveBeenCalledTimes(1);

  // Woken behind a portal with no internet: no pass, and a new request. The
  // native coordinator drops it (no pass began), so this cannot loop.
  app.run();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).not.toHaveBeenCalled();
  expect(app.requestBackgroundRun).toHaveBeenCalledTimes(2);
  app.runtime.stop();
});

test('a background pass that loses the connection with work left asks to be woken', async () => {
  const app = setup();
  await started(app);
  app.setPendingWork(true);
  app.sync.mockImplementationOnce(async () => {
    app.network(false);
    throw new Error('network down');
  });
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(1);
  expect(app.requestBackgroundRun).toHaveBeenCalledTimes(1);
  app.runtime.stop();
});
