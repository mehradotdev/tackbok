import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { HomeCoachMarks } from './HomeCoachMarks';
import type { TargetRect } from './coachMarkTargets';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockSettings = {
  hasCompletedOnboarding: true,
  hasSeenHomeCoachMarks: false,
  sampleEntryIds: [] as string[],
  setHasSeenHomeCoachMarks: jest.fn((seen: boolean) => {
    mockSettings.hasSeenHomeCoachMarks = seen;
  }),
};
let mockScreenReader = false;
let mockEntries = new Map<string, unknown>();
let mockTargets: Record<string, TargetRect | null> = {};
let mockBackHandler: (() => boolean) | null = null;
let mockReduceMotion = false;

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  AccessibilityInfo: { isScreenReaderEnabled: async () => mockScreenReader },
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      mockBackHandler = handler;
      return {
        remove: () => {
          mockBackHandler = null;
        },
      };
    },
  },
}));
jest.mock('expo-router', () => ({
  // Home stays focused in these tests.
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  cancelAnimation: jest.fn(),
  Easing: { linear: (t: number) => t },
  Extrapolation: { CLAMP: 'clamp' },
  interpolate: () => 0,
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => mockReduceMotion,
  useSharedValue: (value: number) => ({ value }),
  withRepeat: (animation: unknown) => animation,
  withTiming: (value: number) => value,
}));
jest.mock('lucide-react-native', () => ({
  ArrowUpDown: 'ArrowUpDown',
  Pointer: 'Pointer',
}));
jest.mock('tailwind-variants', () => ({ cn: (...names: string[]) => names.join(' ') }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/hooks/useGratitude', () => ({
  useEntriesGroupByDate: () => ({ data: mockEntries, isPending: false }),
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: (select: (state: typeof mockSettings) => unknown) =>
    select(mockSettings),
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn, params?: Record<string, number>) =>
      mockTranslate('en', key, params),
    isRTL: false,
  }),
}));
jest.mock('./coachMarkTargets', () => ({
  measureCoachMarkTarget: async (key: string) => mockTargets[key] ?? null,
}));

const SCREEN = { x: 0, y: 0, width: 400, height: 800 };
const DOCK = { x: 340, y: 600, width: 52, height: 150 };
const SEARCH = { x: 16, y: 60, width: 40, height: 40 };

// Measure straight away instead of on the next frame.
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
  callback(0);
  return 0;
};

let root: ReactTestRenderer;
async function render() {
  await act(async () => {
    root = create(<HomeCoachMarks />, {
      // The overlay fills the screen.
      createNodeMock: () => ({
        measureInWindow: (
          callback: (x: number, y: number, width: number, height: number) => void,
        ) => callback(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height),
      }),
    });
  });
}
const json = () => JSON.stringify(root.toJSON());
const showsTour = () => json().includes(mockEn['onboarding.skip']);
const bubble = () =>
  root.root.find(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.className === 'string' &&
      node.props.className.includes('bg-card border border-border rounded-lg'),
  );
async function pressNext() {
  const next = root.root.find(
    (node) => typeof node.type === 'string' && node.props.variant === 'primary',
  );
  await act(async () => next.props.onPress());
}

beforeEach(() => {
  mockSettings.hasSeenHomeCoachMarks = false;
  mockSettings.setHasSeenHomeCoachMarks.mockClear();
  mockScreenReader = false;
  mockEntries = new Map();
  mockTargets = { dock: DOCK, search: SEARCH };
  mockBackHandler = null;
  mockReduceMotion = false;
});
afterEach(() => act(() => root?.unmount()));

test('the tour counts as seen once shown, so an unfinished tour never returns', async () => {
  await render();
  expect(showsTour()).toBe(true);
  expect(mockSettings.setHasSeenHomeCoachMarks).toHaveBeenCalledWith(true);

  // The next launch, after leaving mid-tour.
  act(() => root.unmount());
  await render();
  expect(showsTour()).toBe(false);
});

test('screen-reader users skip the tour', async () => {
  mockScreenReader = true;
  await render();
  expect(showsTour()).toBe(false);
  expect(mockSettings.setHasSeenHomeCoachMarks).toHaveBeenCalledWith(true);
});

test('Android back closes the tips', async () => {
  await render();
  expect(showsTour()).toBe(true);

  let handled = false;
  await act(async () => {
    handled = mockBackHandler?.() ?? false;
  });
  expect(handled).toBe(true);
  expect(showsTour()).toBe(false);
  expect(mockBackHandler).toBeNull();
});

test('the bubble points at the control it describes', async () => {
  await render();
  // The dock is low on the screen, so the bubble sits above it.
  expect(bubble().props.style).toMatchObject({ bottom: expect.any(Number) });
  expect(bubble().props.style.top).toBeUndefined();

  await pressNext(); // move the dock
  await pressNext(); // search, high on the screen: the bubble goes below it
  expect(json()).toContain(mockEn['onboarding.findMemoriesByTextOrTag']);
  expect(bubble().props.style).toMatchObject({ top: expect.any(Number) });
});

test('a control that is not on screen falls back to a fixed bubble', async () => {
  mockTargets = {};
  await render();
  expect(bubble().props.className).toContain('bottom-32 right-4');
});

test('the entry tip appears only when there are entries', async () => {
  await render();
  expect(json()).toContain('Step 1 of 3');

  act(() => root.unmount());
  mockSettings.hasSeenHomeCoachMarks = false;
  mockEntries = new Map([['2026-11-26', []]]);
  await render();
  expect(json()).toContain('Step 1 of 4');
});

test('the dock tip loops a press and drag, or holds still under Reduce Motion', async () => {
  await render();
  await pressNext();
  expect(root.root.findAll((node) => String(node.type) === 'Animated.View')).toHaveLength(
    2,
  );
  expect(json()).not.toContain('ArrowUpDown');

  act(() => root.unmount());
  mockSettings.hasSeenHomeCoachMarks = false;
  mockReduceMotion = true;
  await render();
  await pressNext();
  expect(root.root.findAll((node) => String(node.type) === 'Animated.View')).toHaveLength(
    0,
  );
  expect(json()).toContain('ArrowUpDown');
});

test('the ring follows its control when it moves', async () => {
  await render();
  const ringTop = () =>
    root.root.find(
      (node) =>
        typeof node.props.className === 'string' &&
        node.props.className.includes('border-white') &&
        !node.props.className.includes('rounded-full'),
    ).props.style.top;
  expect(ringTop()).toBe(DOCK.y - 6);

  mockTargets = { ...mockTargets, dock: { ...DOCK, y: 400 } };
  await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
  expect(ringTop()).toBe(400 - 6);
});
