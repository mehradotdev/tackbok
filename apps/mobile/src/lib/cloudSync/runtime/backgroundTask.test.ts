import { PERIODIC_PASS_BUDGET_MS, runCloudSyncBackgroundTask } from './backgroundTask';

jest.mock('expo-task-manager', () => ({
  isTaskDefined: () => true,
  defineTask: jest.fn(),
}));
jest.mock('expo-background-task', () => {
  const listeners = new Set<() => void>();
  return {
    listeners,
    BackgroundTaskResult: { Success: 1, Failed: 2 },
    addExpirationListener: (listener: () => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
});

const mockExpirationListeners = (
  jest.requireMock('expo-background-task') as { listeners: Set<() => void> }
).listeners;
const SUCCESS = 1;
const FAILED = 2;

/** A pass that settles its local state a moment after it is cancelled. */
function cancellablePass(settled: jest.Mock) {
  return (signal: AbortSignal) =>
    new Promise<boolean>((resolve) => {
      signal.addEventListener('abort', () => {
        void Promise.resolve().then(() => {
          settled();
          resolve(true);
        });
      });
    });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockExpirationListeners.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

test('expiration aborts the pass and the task reports success once it settled', async () => {
  const settled = jest.fn();
  const task = runCloudSyncBackgroundTask(cancellablePass(settled));
  expect(mockExpirationListeners.size).toBe(1);

  mockExpirationListeners.forEach((listener) => listener());
  expect(settled).not.toHaveBeenCalled();
  await expect(task).resolves.toBe(SUCCESS);
  expect(settled).toHaveBeenCalledTimes(1);
  expect(mockExpirationListeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('a pass that finishes before expiry removes the listener and its budget timer', async () => {
  let signal: AbortSignal | undefined;
  await expect(
    runCloudSyncBackgroundTask(async (passSignal) => {
      signal = passSignal;
      return true;
    }),
  ).resolves.toBe(SUCCESS);
  expect(signal?.aborted).toBe(false);
  expect(mockExpirationListeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('without an expiration event the budget cancels the pass', async () => {
  const settled = jest.fn();
  const remove = jest.fn();
  const task = runCloudSyncBackgroundTask(cancellablePass(settled), {
    addExpirationListener: () => ({ remove }),
  });

  jest.advanceTimersByTime(PERIODIC_PASS_BUDGET_MS - 1);
  expect(settled).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await expect(task).resolves.toBe(SUCCESS);
  expect(settled).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('a platform without expiration support still gets the budget', async () => {
  const task = runCloudSyncBackgroundTask(cancellablePass(jest.fn()), {
    budgetMs: 1_000,
    addExpirationListener: () => {
      throw new Error('unavailable');
    },
  });
  jest.advanceTimersByTime(1_000);
  await expect(task).resolves.toBe(SUCCESS);
});

test('a failed or throwing pass reports failure and still cleans up', async () => {
  await expect(runCloudSyncBackgroundTask(async () => false)).resolves.toBe(FAILED);
  await expect(
    runCloudSyncBackgroundTask(async () => {
      throw new Error('boom');
    }),
  ).resolves.toBe(FAILED);
  expect(mockExpirationListeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
