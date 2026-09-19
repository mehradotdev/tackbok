/* eslint-disable @typescript-eslint/no-require-imports */
let mockFocused = true;
let mockReduced = false;
const mockListeners = new Set<(state: string) => void>();
const mockTiming = jest.fn((value: number) => value);
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
jest.mock('expo-sqlite/kv-store', () => ({
  getItemSync: () => null,
  setItemSync: jest.fn(),
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ _hasHydrated: true, profileName: 'Maya' }),
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({ isReady: true, t: mockTranslate }),
}));
function mockTranslate(key: string, params?: Record<string, string>) {
  return key === 'Greeting with name' ? `${params?.greeting}, ${params?.name}` : key;
}
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      mockListeners.add(listener);
      return { remove: () => mockListeners.delete(listener) };
    },
  },
}));
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => mockReduced,
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  cancelAnimation: jest.fn(),
  withTiming: (value: number) => mockTiming(value),
  Easing: { linear: 'linear' },
}));

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockListeners.clear();
  mockFocused = true;
  mockReduced = false;
});
afterEach(() => jest.useRealTimers());

function mountGreeting() {
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  const { useHeaderGreeting } = require('./header-greeting');
  let result: ReturnType<typeof import('./header-greeting').useHeaderGreeting>;
  function Probe() {
    const value = useHeaderGreeting(false);
    React.useEffect(() => {
      result = value;
    });
    return null;
  }
  let root: { update: (element: unknown) => void; unmount: () => void };
  act(() => {
    root = create(React.createElement(Probe));
  });
  return {
    get current() {
      return result!;
    },
    tick: (ms: number) => act(() => jest.advanceTimersByTime(ms)),
    layout: (measure = true) =>
      act(() => {
        result!.onLayout();
        if (measure) {
          result!.onMessageReady(0);
          result!.onMessageReady(1);
        }
      }),
    measure: (index: number) => act(() => result!.onMessageReady(index)),
    state: (state: string) =>
      act(() => {
        for (const listener of mockListeners) listener(state);
      }),
    render: () => act(() => root!.update(React.createElement(Probe))),
    unmount: () => act(() => root!.unmount()),
  };
}

it('waits for layout, restores controls, and does not replay on route remount', () => {
  const hook = mountGreeting();
  hook.tick(5000);
  expect(hook.current.greeting).toBeNull();
  expect(hook.current.active).toBe(true);
  hook.layout();
  hook.tick(0);
  expect(hook.current.greeting?.label).toBe('Welcome back, Maya!');
  hook.tick(2340);
  expect(hook.current.greeting?.label).not.toContain('Maya');
  expect(hook.current.greeting?.label).not.toContain('Welcome back');
  hook.tick(4480);
  expect(hook.current.greeting).toBeNull();
  // The UI thread must retain the fully visible final frame during React cleanup.
  expect(hook.current.progress.value).toBe(4480);
  expect(hook.current.active).toBe(false);
  hook.unmount();
  const remount = mountGreeting();
  remount.layout();
  remount.tick(5000);
  expect(remount.current.greeting).toBeNull();
  remount.unmount();
});
it('ends on background without replaying on foreground', () => {
  const hook = mountGreeting();
  hook.layout();
  hook.tick(0);
  hook.state('background');
  expect(hook.current.greeting).toBeNull();
  hook.state('active');
  hook.tick(5000);
  expect(hook.current.greeting).toBeNull();
  hook.unmount();
});
it('ends on navigation and stays ended when Home regains focus', () => {
  const hook = mountGreeting();
  hook.layout();
  hook.tick(0);
  mockFocused = false;
  hook.render();
  expect(hook.current.greeting).toBeNull();
  mockFocused = true;
  hook.render();
  hook.tick(5000);
  expect(hook.current.greeting).toBeNull();
  hook.unmount();
});
it('holds each static greeting for two seconds with reduced motion', () => {
  mockReduced = true;
  const hook = mountGreeting();
  hook.layout();
  hook.tick(0);
  expect(hook.current.greeting).not.toBeNull();
  expect(mockTiming).not.toHaveBeenCalled();
  hook.tick(2249);
  expect(hook.current.greeting).not.toBeNull();
  hook.tick(1);
  expect(hook.current.greeting?.label).not.toContain('Maya');
  hook.tick(1999);
  expect(hook.current.greeting).not.toBeNull();
  hook.tick(1);
  expect(hook.current.greeting).toBeNull();
  hook.unmount();
});

it('does not spend the reading time while native text measurement is pending', () => {
  const hook = mountGreeting();
  hook.layout(false);
  hook.tick(0);
  hook.tick(1000);
  expect(hook.current.greeting?.label).toBe('Welcome back, Maya!');
  expect(mockTiming).not.toHaveBeenCalled();
  hook.layout();
  hook.tick(250);
  expect(mockTiming).toHaveBeenCalled();
  hook.tick(4480);
  expect(hook.current.greeting).toBeNull();
  hook.unmount();
});

it.each([false, true])(
  'restores controls if measurement stalls (partial: %s)',
  (partial) => {
    const hook = mountGreeting();
    hook.layout(false);
    hook.tick(0);
    if (partial) hook.measure(0);
    hook.tick(1499);
    expect(hook.current.active).toBe(true);
    hook.tick(1);
    expect(hook.current.active).toBe(false);
    expect(hook.current.greeting).toBeNull();
    expect(hook.current.progress.value).toBe(4480);
    expect(mockTiming).not.toHaveBeenCalled();
    hook.unmount();
  },
);

it('clears the measurement fallback when unmounted', () => {
  const scheduled = jest.spyOn(global, 'setTimeout');
  const cleared = jest.spyOn(global, 'clearTimeout');
  const hook = mountGreeting();
  hook.layout(false);
  hook.tick(0);
  const fallbackIndex = scheduled.mock.calls.findIndex((call) => call[1] === 1500);
  expect(fallbackIndex).toBeGreaterThanOrEqual(0);
  const fallback = scheduled.mock.results[fallbackIndex].value;
  hook.unmount();
  expect(cleared).toHaveBeenCalledWith(fallback);
  scheduled.mockRestore();
  cleared.mockRestore();
});
