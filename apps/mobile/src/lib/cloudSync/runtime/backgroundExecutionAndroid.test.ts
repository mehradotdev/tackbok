import {
  ANDROID_BACKGROUND_PASS_BUDGET_MS,
  addBackgroundRunListener,
  beginBackgroundExecution,
  requestBackgroundRun,
} from './backgroundExecution';
import { PERIODIC_PASS_BUDGET_MS } from './backgroundTask';

type MockListener = (event: { id: number }) => void;

interface FakeModule {
  listeners: Map<string, Set<MockListener>>;
  begin: jest.Mock;
  end: jest.Mock;
  requestRun: jest.Mock;
}

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppRegistry: { registerHeadlessTask: jest.fn() },
}));
jest.mock('expo-background-task', () => ({ BackgroundTaskResult: {} }));
jest.mock('expo-task-manager', () => ({
  isTaskDefined: () => true,
}));
jest.mock('expo', () => {
  const listeners = new Map<string, Set<MockListener>>();
  const fake = {
    listeners,
    begin: jest.fn(),
    end: jest.fn(async () => {}),
    requestRun: jest.fn(async () => {}),
    addListener: (event: string, listener: MockListener) => {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      set.add(listener);
      return { remove: () => set.delete(listener) };
    },
  };
  return { requireOptionalNativeModule: () => fake, fake };
});

const mockModule = (jest.requireMock('expo') as { fake: FakeModule }).fake;

beforeEach(() => {
  mockModule.listeners.clear();
  mockModule.begin.mockReset();
  mockModule.end.mockClear();
  mockModule.requestRun.mockClear();
});

test('Android work gets the periodic pass budget, not a 25 s guess', async () => {
  expect(ANDROID_BACKGROUND_PASS_BUDGET_MS).toBe(PERIODIC_PASS_BUDGET_MS);
  mockModule.begin.mockResolvedValue({ granted: true, id: 4 });
  const onExpire = jest.fn();
  const execution = await beginBackgroundExecution(onExpire);
  expect(execution?.remainingMs).toBe(ANDROID_BACKGROUND_PASS_BUDGET_MS);

  // The OS stopped the job.
  mockModule.listeners.get('onExpire')?.forEach((listener) => listener({ id: 4 }));
  expect(onExpire).toHaveBeenCalledTimes(1);
  execution?.end();
  expect(mockModule.end).toHaveBeenCalledWith(4);
});

test('a wake-up request reaches the module and its event the listener', () => {
  requestBackgroundRun();
  expect(mockModule.requestRun).toHaveBeenCalledTimes(1);

  const listener = jest.fn();
  const subscription = addBackgroundRunListener(listener);
  mockModule.listeners.get('onRun')?.forEach((run) => run({ id: 0 }));
  expect(listener).toHaveBeenCalledTimes(1);
  subscription.remove();
  expect(mockModule.listeners.get('onRun')?.size).toBe(0);
});

test('registers the no-op task that keeps JS timers running in background', () => {
  const { AppRegistry } = jest.requireMock('react-native') as {
    AppRegistry: { registerHeadlessTask: jest.Mock };
  };
  expect(AppRegistry.registerHeadlessTask).toHaveBeenCalledWith(
    'TackbokBackgroundExecution',
    expect.any(Function),
  );
});

test('the timer task never finishes on its own; native ends it', async () => {
  const { AppRegistry } = jest.requireMock('react-native') as {
    AppRegistry: { registerHeadlessTask: jest.Mock };
  };
  const provider = AppRegistry.registerHeadlessTask.mock.calls[0][1] as () => (
    data: unknown,
  ) => Promise<void>;
  const settled = jest.fn();
  void provider()({}).then(settled, settled);
  await new Promise((resolve) => setImmediate(resolve));
  // Resolving would let React Native pause JS timers again mid-pass.
  expect(settled).not.toHaveBeenCalled();
});
