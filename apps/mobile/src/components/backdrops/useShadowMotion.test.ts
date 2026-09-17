import { useShadowMotion } from './useShadowMotion';

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
jest.mock('./PetInteraction', () => ({
  usePetInteraction: () => ({ register: mockRegister, setBusy: mockBusy }),
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
  useShadowMotion(false);
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
  const motion = useShadowMotion(false);
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
  const motion = useShadowMotion(false);
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
  const motion = useShadowMotion(false);
  mockPlay!();
  mockCleanup();
  expect(jest.getTimerCount()).toBe(0);
  expect(motion.performance.value).toBe(0);
  expect(mockRemove).toHaveBeenCalled();
  jest.clearAllMocks();
  useShadowMotion(true);
  expect(mockRegister).not.toHaveBeenCalled();
  expect(mockTiming).not.toHaveBeenCalled();
});

it('selects either performance with equal probability and permits repeats', () => {
  const random = jest.spyOn(Math, 'random').mockReturnValue(0.2);
  try {
    const motion = useShadowMotion(false);
    mockPlay!();
    expect(motion.variant.value).toBe(0);
    mockCompletions[0](true);
    random.mockReturnValue(0.8);
    mockPlay!();
    expect(motion.variant.value).toBe(1);
    mockCompletions[1](true);
    mockPlay!();
    expect(motion.variant.value).toBe(1);
  } finally {
    random.mockRestore();
  }
});
