import { beginBackgroundExecution } from './backgroundExecution';

type MockExpireListener = (event: { id: number }) => void;

interface FakeModule {
  listeners: Set<MockExpireListener>;
  begin: jest.Mock;
  end: jest.Mock;
}

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
// Built inside the factory: the wrapper reads the module when it is imported.
jest.mock('expo', () => {
  const listeners = new Set<MockExpireListener>();
  const fake = {
    listeners,
    begin: jest.fn(),
    end: jest.fn(async () => {}),
    addListener: (_event: 'onExpire', listener: MockExpireListener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  return { requireOptionalNativeModule: () => fake, fake };
});

const mockModule = (jest.requireMock('expo') as { fake: FakeModule }).fake;
const mockListeners = mockModule.listeners;

beforeEach(() => {
  mockListeners.clear();
  mockModule.begin.mockReset();
  mockModule.end.mockClear();
});

test('a refused background task is no time at all, so no deadline is armed', async () => {
  mockModule.begin.mockResolvedValue({ granted: false });
  await expect(beginBackgroundExecution(jest.fn())).resolves.toBeNull();
  expect(mockListeners.size).toBe(0);
});

test('granted time reports what iOS said and ends its own task', async () => {
  mockModule.begin.mockResolvedValue({ granted: true, id: 7, remainingSeconds: 29.5 });
  const onExpire = jest.fn();
  const execution = await beginBackgroundExecution(onExpire);
  expect(execution?.remainingMs).toBe(29_500);

  // Another task's expiration is not this one's.
  mockListeners.forEach((listener) => listener({ id: 8 }));
  expect(onExpire).not.toHaveBeenCalled();
  mockListeners.forEach((listener) => listener({ id: 7 }));
  expect(onExpire).toHaveBeenCalledTimes(1);

  execution?.end();
  expect(mockModule.end).toHaveBeenCalledWith(7);
  expect(mockListeners.size).toBe(0);
});

test('unknown remaining time is reported as null', async () => {
  mockModule.begin.mockResolvedValue({ granted: true, id: 3 });
  await expect(beginBackgroundExecution(jest.fn())).resolves.toMatchObject({
    remainingMs: null,
  });
});

test('a failed request removes its listener and rejects', async () => {
  mockModule.begin.mockRejectedValue(new Error('native failure'));
  await expect(beginBackgroundExecution(jest.fn())).rejects.toThrow('native failure');
  expect(mockListeners.size).toBe(0);
});
