import type { AppStateStatus } from 'react-native';

const listeners: ((state: AppStateStatus) => void)[] = [];
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: AppStateStatus) => void) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    },
  },
}));

const christmas = new Date(2026, 11, 25, 9, 30);
const ordinaryDay = new Date(2026, 11, 20, 9, 30);

function load() {
  listeners.length = 0;
  let claim!: typeof import('./celebration').claimCelebration;
  jest.isolateModules(() => {
    claim =
      jest.requireActual<typeof import('./celebration')>(
        './celebration',
      ).claimCelebration;
  });
  const appState = (state: AppStateStatus) =>
    listeners.forEach((listener) => listener(state));
  return { claim, appState };
}

describe('claimCelebration', () => {
  test('plays once per opening on a special day', () => {
    const { claim } = load();
    expect(claim(christmas)).toBe(true);
    // Back on the home screen from an entry: same opening.
    expect(claim(christmas)).toBe(false);
  });

  test('never plays on an ordinary day', () => {
    const { claim } = load();
    expect(claim(ordinaryDay)).toBe(false);
    expect(claim(new Date(2026, 6, 1))).toBe(false);
  });

  test('returning from the background is a new opening', () => {
    const { claim, appState } = load();
    expect(claim(christmas)).toBe(true);
    appState('inactive');
    appState('background');
    appState('active');
    expect(claim(christmas)).toBe(true);
  });

  test('a brief inactive state (Control Centre, a system alert) is not', () => {
    const { claim, appState } = load();
    expect(claim(christmas)).toBe(true);
    appState('inactive');
    appState('active');
    expect(claim(christmas)).toBe(false);
  });

  test('an opening on an ordinary day stays unclaimed until a special day', () => {
    const { claim } = load();
    expect(claim(ordinaryDay)).toBe(false);
    // Still the same opening after midnight into Christmas Eve.
    expect(claim(new Date(2026, 11, 24, 0, 1))).toBe(true);
  });
});
