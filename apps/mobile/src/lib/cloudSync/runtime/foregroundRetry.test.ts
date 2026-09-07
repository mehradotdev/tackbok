import { SyncRuntime } from './SyncRuntime';
import { CloudConnectionChangedError, CloudConnectionLifecycle } from './connectionLifecycle';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const connection = new CloudConnectionLifecycle();
  const stale = jest.fn(async () => { throw new CloudConnectionChangedError(); });
  const fresh = jest.fn(async () => ({ pulled: 1, pushed: 0 }));
  const createEngine = jest.fn()
    .mockResolvedValueOnce({ provider: { kind: 'google-drive' }, sync: stale })
    .mockResolvedValue({ provider: { kind: 'google-drive' }, sync: fresh });
  const runtime = new SyncRuntime({
    platform: {
      getNetworkOnline: async () => true,
      addAppStateListener: () => ({ remove() {} }),
      addNetworkListener: () => ({ remove() {} }),
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: timer => clearTimeout(timer),
    },
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine,
    waitForConnectionChange: () => connection.waitForChanges(),
  });
  return { runtime, connection, stale, fresh, createEngine };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('waits for the connection change and rebuilds before retrying a foreground pass', async () => {
  const app = setup();
  const finish = deferred();
  const change = app.connection.change(() => finish.promise);
  const start = app.runtime.start();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.stale).toHaveBeenCalledTimes(1);
  expect(app.createEngine).toHaveBeenCalledTimes(1);
  finish.resolve();
  await Promise.all([change, start]);
  expect(app.fresh).toHaveBeenCalledTimes(1);
  expect(app.runtime.getLastFailureCategory()).toBeNull();
  app.runtime.stop();
});

test('does not resume a runtime stopped while waiting for a connection change', async () => {
  const app = setup();
  const finish = deferred();
  const change = app.connection.change(() => finish.promise);
  const start = app.runtime.start();
  await jest.advanceTimersByTimeAsync(0);
  app.runtime.stop();
  finish.resolve();
  await Promise.all([change, start]);
  expect(app.createEngine).toHaveBeenCalledTimes(1);
  expect(app.fresh).not.toHaveBeenCalled();
});

test('does not sync if reloading finds a disabled or paused connection', async () => {
  const app = setup();
  app.createEngine.mockResolvedValue(null);
  await app.runtime.start();
  expect(app.createEngine).toHaveBeenCalledTimes(2);
  expect(app.fresh).not.toHaveBeenCalled();
  app.runtime.stop();
});

test('retries connection rejection only once per pass', async () => {
  const app = setup();
  app.fresh.mockRejectedValue(new CloudConnectionChangedError());
  await app.runtime.start();
  expect(app.createEngine).toHaveBeenCalledTimes(2);
  expect(app.stale).toHaveBeenCalledTimes(1);
  expect(app.fresh).toHaveBeenCalledTimes(1);
  expect(app.runtime.getLastFailureCategory()).not.toBeNull();
  app.runtime.stop();
});

test('ordinary failures do not rebuild or retry the engine', async () => {
  const app = setup();
  app.stale.mockRejectedValue(new Error('network failed'));
  await app.runtime.start();
  expect(app.createEngine).toHaveBeenCalledTimes(1);
  expect(app.runtime.getLastFailureCategory()).not.toBeNull();
  app.runtime.stop();
});
