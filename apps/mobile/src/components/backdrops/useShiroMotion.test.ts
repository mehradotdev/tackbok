import { useShiroMotion } from './useShiroMotion';

let mockReducedMotion = false;
let mockCleanup: () => void;
let mockAppState: (state: string) => void;
let mockPlay: (() => void) | undefined;
let mockCompletions: ((finished: boolean) => void)[] = [];
const mockBusy = jest.fn();
const mockUnregister = jest.fn(() => {
  mockPlay = undefined;
});
const mockRegister = jest.fn((play: () => void) => {
  mockPlay = play;
  return mockUnregister;
});
const mockTiming = jest.fn(
  (target: number, _config: unknown, callback?: (finished: boolean) => void) => {
    if (callback) mockCompletions.push(callback);
    return target;
  },
);
const mockCancel = jest.fn();
const mockRemove = jest.fn();

jest.mock('react', () => ({ useCallback: (callback: unknown) => callback }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => {
    mockCleanup = effect();
  },
}));
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, callback: (state: string) => void) => {
      mockAppState = callback;
      return { remove: mockRemove };
    },
  },
}));
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => mockReducedMotion,
  useSharedValue: (value: number) => ({ value }),
  cancelAnimation: (value: unknown) => mockCancel(value),
  withTiming: (...args: Parameters<typeof mockTiming>) => mockTiming(...args),
  withRepeat: (value: unknown) => value,
  Easing: { linear: 'linear' },
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));
jest.mock('./ShiroInteraction', () => ({
  useShiroInteraction: () => ({ register: mockRegister, setBusy: mockBusy }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockReducedMotion = false;
  mockPlay = undefined;
  mockCompletions = [];
});
afterEach(() => {
  mockCleanup?.();
  jest.useRealTimers();
});

it('ignores repeated presses until the performance finishes', () => {
  useShiroMotion(false);
  mockPlay!();
  mockPlay!();
  mockPlay!();
  expect(mockCompletions).toHaveLength(1);
  expect(mockBusy).toHaveBeenLastCalledWith(true);
  mockCompletions[0](true);
  expect(mockBusy).toHaveBeenLastCalledWith(false);
  mockPlay!();
  expect(mockCompletions).toHaveLength(2);
});

it('cancels on background, rejects stale completion, and does not replay on resume', () => {
  const motion = useShiroMotion(false);
  mockPlay!();
  const stalePlay = mockPlay!;
  mockAppState('background');
  expect(mockPlay).toBeUndefined();
  expect(motion.performance.value).toBe(0);
  stalePlay();
  expect(mockCompletions).toHaveLength(1);
  mockAppState('active');
  expect(motion.performance.value).toBe(0);
  mockPlay!();
  mockCompletions[0](true);
  expect(mockBusy).toHaveBeenLastCalledWith(true);
  mockCompletions[1](true);
  expect(mockBusy).toHaveBeenLastCalledWith(false);
});

it('shows only a timed still expression in reduced motion, then restores rest', () => {
  mockReducedMotion = true;
  const motion = useShiroMotion(false);
  mockPlay!();
  mockPlay!();
  expect(mockTiming).not.toHaveBeenCalled();
  expect(motion.idle.value).toBe(0);
  expect(motion.performance.value).toBe(-1);
  jest.advanceTimersByTime(1800);
  expect(motion.performance.value).toBe(0);
  expect(mockBusy).toHaveBeenLastCalledWith(false);
});

it('cleans up a still timer on blur and keeps previews unregistered and frozen', () => {
  mockReducedMotion = true;
  const motion = useShiroMotion(false);
  mockPlay!();
  mockCleanup();
  expect(jest.getTimerCount()).toBe(0);
  expect(motion.performance.value).toBe(0);
  expect(mockRemove).toHaveBeenCalled();
  jest.clearAllMocks();
  useShiroMotion(true);
  expect(mockRegister).not.toHaveBeenCalled();
  expect(mockTiming).not.toHaveBeenCalled();
});

it('schedules random single/double bursts with a fresh quiet pause after completion', () => {
  const random = jest.spyOn(Math, 'random').mockReturnValue(0);
  try {
    const motion = useShiroMotion(false);
    jest.advanceTimersByTime(1999);
    expect(mockCompletions).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(motion.barkCount.value).toBe(1);
    expect(mockTiming).toHaveBeenLastCalledWith(
      0.4,
      expect.objectContaining({ duration: 400 }),
      expect.any(Function),
    );
    random.mockReturnValue(0.9999);
    mockCompletions[0](true);
    expect(motion.bark.value).toBe(0);
    jest.advanceTimersByTime(4998);
    expect(mockCompletions).toHaveLength(1);
    jest.advanceTimersByTime(2);
    expect(motion.barkCount.value).toBe(2);
    expect(mockTiming).toHaveBeenLastCalledWith(
      0.85,
      expect.objectContaining({ duration: 850 }),
      expect.any(Function),
    );
    mockPlay!(); // Paw performance preempts the idle burst.
    expect(motion.bark.value).toBe(0);
    mockCompletions[1](true); // Stale idle completion cannot schedule another burst.
    expect(jest.getTimerCount()).toBe(0);
    mockAppState('background');
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    random.mockRestore();
  }
});
