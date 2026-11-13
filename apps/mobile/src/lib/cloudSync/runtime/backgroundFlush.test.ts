import { SyncCancelledError } from '../snapshot/sync/errors';
import {
  SyncRuntime,
  type RuntimeBackgroundExecution,
  type RuntimePlatform,
} from './SyncRuntime';

type AppState = 'active' | 'background' | 'inactive';

interface Pass {
  signal: AbortSignal | undefined;
  finish(): void;
}

/** Passes stay open until finished, and reject like the engine once aborted. */
function setup(options: { osTime?: { remainingMs: number | null } | null } = {}) {
  let appState: AppState = 'active';
  let onAppState: (state: AppState) => void = () => {};
  let onMutation: () => void = () => {};
  let onExpire: () => void = () => {};
  const passes: Pass[] = [];
  const sync = jest.fn(
    (signal?: AbortSignal) =>
      new Promise<{ pulled: number; pushed: number }>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new SyncCancelledError()));
        passes.push({ signal, finish: () => resolve({ pulled: 0, pushed: 1 }) });
      }),
  );
  const end = jest.fn();
  const begin = jest.fn(
    async (expire: () => void): Promise<RuntimeBackgroundExecution | null> => {
      onExpire = expire;
      const osTime =
        options.osTime === undefined ? { remainingMs: 30_000 } : options.osTime;
      return osTime && { remainingMs: osTime.remainingMs, end };
    },
  );
  const failed = jest.fn();
  const platform: RuntimePlatform = {
    getAppState: () => appState,
    beginBackgroundExecution: begin,
    getNetworkOnline: async () => true,
    addAppStateListener: (listener) => {
      onAppState = listener;
      return { remove: () => {} };
    },
    addNetworkListener: () => ({ remove: () => {} }),
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
  };
  const runtime = new SyncRuntime({
    platform,
    readiness: { isReady: async () => true, retryBackfill: async () => {} },
    createEngine: async () => ({ provider: { kind: 'google-drive' }, sync }),
    addMutationListener: (listener) => {
      onMutation = listener;
      return { remove: () => {} };
    },
    analytics: { connected: () => {}, started: () => {}, succeeded: () => {}, failed },
  });
  return {
    runtime,
    sync,
    passes,
    begin,
    end,
    failed,
    expire: () => onExpire(),
    state: (next: AppState) => {
      appState = next;
      onAppState(next);
    },
    mutate: () => onMutation(),
    /** Finishes the newest open pass and lets the runtime react. */
    finish: async () => {
      passes.at(-1)!.finish();
      await jest.advanceTimersByTimeAsync(0);
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function startedIdle(app: ReturnType<typeof setup>) {
  const starting = app.runtime.start();
  await jest.advanceTimersByTimeAsync(0);
  await app.finish(); // The launch pass.
  await starting;
}

test('backgrounding with an unpublished edit publishes it at once under OS background time', async () => {
  const app = setup();
  await startedIdle(app);
  app.mutate();
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  // No 30 s debounce wait.
  expect(app.sync).toHaveBeenCalledTimes(2);
  expect(app.begin).toHaveBeenCalledTimes(1);
  expect(app.end).not.toHaveBeenCalled();

  await app.finish();
  // The OS time ends only once the pass settled.
  expect(app.end).toHaveBeenCalledTimes(1);
  // The cleared debounce never runs a later pass.
  await jest.advanceTimersByTimeAsync(60_000);
  expect(app.sync).toHaveBeenCalledTimes(2);
  app.runtime.stop();
});

test('an edit committed during the background pass gets a follow-up pass', async () => {
  const app = setup();
  await startedIdle(app);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(2);

  app.mutate();
  await app.finish();
  expect(app.sync).toHaveBeenCalledTimes(3);
  expect(app.end).not.toHaveBeenCalled();

  await app.finish();
  expect(app.sync).toHaveBeenCalledTimes(3);
  expect(app.end).toHaveBeenCalledTimes(1);
  app.runtime.stop();
});

test('an edit made during a foreground pass still in flight at backgrounding is published', async () => {
  const app = setup();
  await startedIdle(app);
  const manual = app.runtime.run('manual');
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(2);
  app.mutate(); // Debounce armed, then cleared by backgrounding.
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  // Backgrounding joins the running pass rather than overlapping it.
  expect(app.sync).toHaveBeenCalledTimes(2);

  await app.finish();
  expect(app.sync).toHaveBeenCalledTimes(3);
  await app.finish();
  await manual;
  expect(app.end).toHaveBeenCalledTimes(1);
  app.runtime.stop();
});

test('a background pass is cancelled before the OS deadline and is not a failure', async () => {
  const app = setup({ osTime: { remainingMs: 30_000 } });
  await startedIdle(app);
  app.mutate();
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  const pass = app.passes.at(-1)!;
  // An edit during the pass must not extend past the deadline.
  app.mutate();

  await jest.advanceTimersByTimeAsync(24_999);
  expect(pass.signal?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(pass.signal?.aborted).toBe(true);
  expect(app.end).toHaveBeenCalledTimes(1);
  expect(app.sync).toHaveBeenCalledTimes(2);
  expect(app.failed).not.toHaveBeenCalled();
  expect(app.runtime.getLastFailureCategory()).toBeNull();
  app.runtime.stop();
});

test('the deadline defaults to 25 s when the OS does not say how much time it grants', async () => {
  const app = setup({ osTime: { remainingMs: null } });
  await startedIdle(app);
  app.state('background');
  await jest.advanceTimersByTimeAsync(24_999);
  expect(app.passes.at(-1)!.signal?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(app.passes.at(-1)!.signal?.aborted).toBe(true);
  app.runtime.stop();
});

test('an OS expiration cancels the pass at once', async () => {
  const app = setup();
  await startedIdle(app);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  app.expire();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.passes.at(-1)!.signal?.aborted).toBe(true);
  // iOS ended that time itself.
  expect(app.end).not.toHaveBeenCalled();
  expect(app.failed).not.toHaveBeenCalled();
  app.runtime.stop();
});

test('returning to the foreground ends the OS time without cancelling the pass', async () => {
  const app = setup();
  await startedIdle(app);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  const pass = app.passes.at(-1)!;
  app.state('active');
  expect(app.end).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(pass.signal?.aborted).toBe(false);
  app.runtime.stop();
});

test('a foreground pass that joined a deadline-cancelled pass still runs', async () => {
  const app = setup();
  let releaseCancelled!: () => void;
  await startedIdle(app);
  // The cancelled pass takes a while to settle its local state.
  app.sync.mockImplementationOnce(
    (signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          releaseCancelled = () => reject(new SyncCancelledError());
        });
      }),
  );
  app.state('background');
  await jest.advanceTimersByTimeAsync(25_000);
  app.state('active');
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(2);
  // Sync now while the cancelled pass is still settling.
  const manual = app.runtime.run('manual');

  releaseCancelled();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(3);
  // Sync now reports the replacement pass, not the cancellation.
  await app.finish();
  await expect(manual).resolves.toEqual({ pulled: 0, pushed: 1 });
  app.runtime.stop();
});

test('without OS background time the pass runs unbounded, as before', async () => {
  const app = setup({ osTime: null });
  await startedIdle(app);
  app.mutate();
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  expect(app.sync).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(10 * 60_000);
  expect(app.passes.at(-1)!.signal?.aborted).toBe(false);
  // Edits still get their follow-up.
  app.mutate();
  await app.finish();
  expect(app.sync).toHaveBeenCalledTimes(3);
  app.runtime.stop();
});

test('stop() in background keeps the OS time until the cancelled pass settled', async () => {
  const app = setup();
  let releaseCancelled!: () => void;
  await startedIdle(app);
  app.sync.mockImplementationOnce(
    (signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          releaseCancelled = () => reject(new SyncCancelledError());
        });
      }),
  );
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  app.runtime.stop();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.end).not.toHaveBeenCalled();
  releaseCancelled();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.end).toHaveBeenCalledTimes(1);
});

test('the deadline of a stopped window does not cancel a pass after restart', async () => {
  const app = setup();
  await startedIdle(app);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  const stoppedPasses = app.passes.length;
  app.runtime.stop();
  await jest.advanceTimersByTimeAsync(0);
  // A resume restarts the runtime (for example after a connection change).
  app.state('active');
  const restarting = app.runtime.start();
  await jest.advanceTimersByTimeAsync(0);
  expect(app.passes).toHaveLength(stoppedPasses + 1);
  const restartedPass = app.passes.at(-1)!;
  await jest.advanceTimersByTimeAsync(60_000);
  expect(restartedPass.signal?.aborted).toBe(false);
  restartedPass.finish();
  await restarting;
  app.runtime.stop();
});

test('OS time granted after the app already returned to the foreground is ended at once', async () => {
  const app = setup();
  let grant!: (execution: RuntimeBackgroundExecution) => void;
  app.begin.mockImplementationOnce(
    () => new Promise<RuntimeBackgroundExecution | null>((resolve) => (grant = resolve)),
  );
  await startedIdle(app);
  app.state('background');
  await jest.advanceTimersByTimeAsync(0);
  app.state('active');
  grant({ remainingMs: 30_000, end: app.end });
  await jest.advanceTimersByTimeAsync(0);
  expect(app.end).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(app.passes[1]!.signal?.aborted).toBe(false);
  app.runtime.stop();
});

test('a caller of a stopped, cancelled pass is not carried into the restarted runtime', async () => {
  const app = setup();
  let releaseCancelled!: () => void;
  await startedIdle(app);
  app.sync.mockImplementationOnce(
    (signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          releaseCancelled = () => reject(new SyncCancelledError());
        });
      }),
  );
  const oldManual = app.runtime.run('manual');
  await jest.advanceTimersByTimeAsync(0);
  app.runtime.stop();
  const restarting = app.runtime.start();
  await jest.advanceTimersByTimeAsync(0);
  const passesAfterRestart = app.passes.length;
  // Sync now on the restarted runtime joins its launch pass.
  const newManual = app.runtime.run('manual');

  releaseCancelled();
  await expect(oldManual).resolves.toBeNull();
  // Only the restarted runtime's own follow-up runs, once.
  await app.finish();
  await app.finish();
  await restarting;
  await expect(newManual).resolves.not.toBeNull();
  expect(app.passes).toHaveLength(passesAfterRestart + 1);
  app.runtime.stop();
});
