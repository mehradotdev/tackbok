import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FestivePrompt } from './FestivePrompt';
import type { FestiveSwitch } from '~/lib/seasonal/festivePrompt';

const mockCalls: string[] = [];
const mockSettings = {
  festiveTouchesEnabled: true,
  festivePromptSeason: null as string | null,
  festiveSwitch: null as FestiveSwitch | null,
  theme: 'ocean',
  biometricUnlockEnabled: false,
  hasCompletedOnboarding: true,
  hasSeenHomeCoachMarks: true,
  pendingAchievement: null as unknown,
  setFestivePromptSeason: (season: string | null) => {
    mockSettings.festivePromptSeason = season;
  },
  setFestiveSwitch: (festiveSwitch: FestiveSwitch | null) => {
    mockSettings.festiveSwitch = festiveSwitch;
  },
  setTheme: (theme: string) => {
    mockCalls.push(`theme:${theme}`);
    mockSettings.theme = theme;
  },
};
const mockIcon = { current: 'Sage' };
const mockPush = jest.fn();
let mockFocusEffect: (() => void | (() => void)) | null = null;

jest.mock('react-native', () => ({ View: 'View', AppState: { currentState: 'active' } }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocusEffect = effect;
  },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: { getState: () => mockSettings },
  flushSettings: async () => {
    mockCalls.push('flush');
  },
}));
jest.mock('~/lib/appIcon', () => ({
  appIconChangeClosesApp: true,
  useAppIconStore: {
    getState: () => ({
      current: mockIcon.current,
      refresh: async () => {},
      setIcon: async (name: string) => {
        mockCalls.push(`icon:${name}`);
      },
    }),
  },
}));
jest.mock('~/lib/appLock', () => ({
  useAppLockStore: { getState: () => ({ isLocked: false }) },
}));
jest.mock('~/lib/splash', () => ({
  useSplashActive: { getState: () => ({ active: false }) },
}));
jest.mock('~/lib/achievement-dialog', () => ({
  useAchievementDialogStore: { getState: () => ({ manualAchievement: null }) },
}));
jest.mock('~/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('~/screens/settings/AppIconPickerSheet', () => ({
  AppIconTile: 'AppIconTile',
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/alert-dialog', () => ({
  AlertDialog: 'AlertDialog',
  AlertDialogAction: 'AlertDialogAction',
  AlertDialogCancel: 'AlertDialogCancel',
  AlertDialogContent: 'AlertDialogContent',
  AlertDialogDescription: 'AlertDialogDescription',
  AlertDialogFooter: 'AlertDialogFooter',
  AlertDialogHeader: 'AlertDialogHeader',
  AlertDialogTitle: 'AlertDialogTitle',
}));

let tree: ReactTestRenderer;
let blur: (() => void) | void;

async function focus() {
  await act(async () => {
    blur = mockFocusEffect?.();
    jest.advanceTimersByTime(800);
  });
}
function leave() {
  act(() => blur?.());
}
const dialog = () => tree.root.findByType('AlertDialog' as never);
const text = () =>
  tree.root.findAllByType('Text' as never).map((node) => node.props.children);

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date(2026, 11, 10, 12) });
  Object.assign(mockSettings, {
    festivePromptSeason: null,
    festiveSwitch: null,
    theme: 'ocean',
    pendingAchievement: null,
  });
  mockIcon.current = 'Sage';
  mockCalls.length = 0;
  mockPush.mockClear();
  await act(async () => {
    tree = create(<FestivePrompt />);
  });
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

it('waits for a return to Home, never the app opening', async () => {
  await focus();
  expect(dialog().props.open).toBe(false);
  leave();
  await focus();
  expect(dialog().props.open).toBe(true);
  expect(mockSettings.festivePromptSeason).toBe('winter-holidays-2026');
  expect(text()).toEqual(['festive.notNow', 'festive.takeALook']);
});

it('stays back while an achievement is waiting', async () => {
  mockSettings.pendingAchievement = { id: 'day-1' };
  await focus();
  leave();
  await focus();
  expect(dialog().props.open).toBe(false);
  expect(mockSettings.festivePromptSeason).toBeNull();
});

it('"Take a look" remembers the usual look and opens Appearance', async () => {
  await focus();
  leave();
  await focus();
  act(() => tree.root.findByType('AlertDialogAction' as never).props.onPress());
  expect(mockSettings.festiveSwitch).toMatchObject({
    season: 'winter-holidays-2026',
    theme: 'ocean',
    icon: 'Sage',
  });
  expect(mockPush).toHaveBeenCalledWith('/appearance');
  expect(dialog().props.open).toBe(false);
});

it('switches back in January, saving the theme before the icon closes the app', async () => {
  jest.setSystemTime(new Date(2027, 0, 3, 12));
  Object.assign(mockSettings, {
    festivePromptSeason: 'winter-holidays-2026',
    festiveSwitch: {
      season: 'winter-holidays-2026',
      theme: 'ocean',
      icon: 'Sage',
      offerFrom: new Date(2027, 0, 2).getTime(),
    },
    theme: 'pine-night',
  });
  mockIcon.current = 'Christmas';
  await focus();
  leave();
  await focus();
  expect(dialog().props.open).toBe(true);
  expect(text()).toEqual(['festive.keepIt', 'festive.switchBack']);
  await act(async () => {
    tree.root.findByType('AlertDialogAction' as never).props.onPress();
  });
  expect(mockCalls).toEqual(['theme:ocean', 'flush', 'icon:Sage']);
  expect(mockSettings.festiveSwitch).toBeNull();
});
