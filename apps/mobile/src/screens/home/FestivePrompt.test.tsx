import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
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

jest.mock('react-native', () => ({
  View: 'View',
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active' },
}));
/** Open as the native sheet sees it; dismiss() reports back like a swipe down. */
let mockSheetOpen = false;
jest.mock('@lodev09/react-native-true-sheet', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual('react');
  const TrueSheet = forwardRef(function TrueSheet(
    props: { children: React.ReactNode; onDidDismiss: () => void },
    ref: React.Ref<unknown>,
  ) {
    useImperativeHandle(ref, () => ({
      present: async () => {
        mockSheetOpen = true;
      },
      dismiss: async () => {
        if (!mockSheetOpen) throw new Error('not presented');
        mockSheetOpen = false;
        props.onDidDismiss();
      },
    }));
    return props.children ?? null;
  });
  return { TrueSheet };
});
jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '8', '#999'] }));
jest.mock('~/lib/theme/themes', () => ({ DEFAULT_THEME_SHEET_RADIUS: 16 }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
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
let mockTipsShowing = false;
jest.mock('./HomeCoachMarks', () => ({ homeTipsShowing: () => mockTipsShowing }));

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
const isOpen = () =>
  mockSheetOpen && tree.root.findAllByType('Button' as never).length > 0;
/** The first button answers yes (Take a look, Switch back); the second declines. */
async function press(which: 'yes' | 'no') {
  const buttons = tree.root.findAllByType('Button' as never);
  await act(async () => {
    buttons[which === 'yes' ? 0 : 1].props.onPress();
  });
}
async function swipeDown() {
  await act(async () => {
    tree.root.findByType(TrueSheet).props.onDidDismiss();
    mockSheetOpen = false;
  });
}
const lastSeason: FestiveSwitch = {
  season: 'winter-holidays-2026',
  theme: 'ocean',
  icon: 'Sage',
  offerFrom: new Date(2027, 0, 2).getTime(),
};
async function inJanuaryOnPineNight() {
  jest.setSystemTime(new Date(2027, 0, 3, 12));
  Object.assign(mockSettings, {
    festivePromptSeason: 'winter-holidays-2026',
    festiveSwitch: lastSeason,
    theme: 'pine-night',
  });
  mockIcon.current = 'Christmas';
  await focus();
  leave();
  await focus();
}
const text = () =>
  tree.root.findAllByType('Text' as never).map((node) => node.props.children);
const labels = () =>
  tree.root
    .findAllByType('Button' as never)
    .map((button) => button.findByType('Text' as never).props.children);

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date(2026, 11, 10, 12) });
  Object.assign(mockSettings, {
    festivePromptSeason: null,
    festiveSwitch: null,
    theme: 'ocean',
    pendingAchievement: null,
  });
  mockIcon.current = 'Sage';
  mockTipsShowing = false;
  mockSheetOpen = false;
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
  expect(isOpen()).toBe(false);
  leave();
  await focus();
  expect(isOpen()).toBe(true);
  expect(mockSettings.festivePromptSeason).toBe('winter-holidays-2026');
  expect(labels()).toEqual(['festive.takeALook', 'festive.notNow']);
});

it('stays back while an achievement is waiting', async () => {
  mockSettings.pendingAchievement = { id: 'day-1' };
  await focus();
  leave();
  await focus();
  expect(isOpen()).toBe(false);
  expect(mockSettings.festivePromptSeason).toBeNull();
});

it('stays back while the Home tips are showing', async () => {
  mockTipsShowing = true;
  await focus();
  leave();
  await focus();
  expect(isOpen()).toBe(false);
});

it('closes when another screen opens over Home', async () => {
  await focus();
  leave();
  await focus();
  expect(isOpen()).toBe(true);
  leave();
  expect(isOpen()).toBe(false);
});

it('"Take a look" remembers the usual look and opens Appearance', async () => {
  await focus();
  leave();
  await focus();
  const yes = tree.root.findAllByType('Button' as never)[0].props.onPress;
  // A second tap while the sheet slides away does nothing more.
  await act(async () => {
    yes();
    yes();
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockSettings.festiveSwitch).toMatchObject({
    season: 'winter-holidays-2026',
    theme: 'ocean',
    icon: 'Sage',
  });
  expect(mockPush).toHaveBeenCalledWith('/appearance');
  expect(isOpen()).toBe(false);
});

it('switches back in January, saving the theme before the icon closes the app', async () => {
  await inJanuaryOnPineNight();
  expect(isOpen()).toBe(true);
  expect(labels()).toEqual(['festive.switchBack', 'festive.keepIt']);
  await press('yes');
  expect(mockCalls).toEqual(['theme:ocean', 'flush', 'icon:Sage']);
  // Forgotten on the next return, once the festive look is really gone.
  expect(mockSettings.festiveSwitch).toBe(lastSeason);
  mockIcon.current = 'Sage';
  leave();
  await focus();
  expect(mockSettings.festiveSwitch).toBeNull();
  expect(isOpen()).toBe(false);
});

it('restores only the theme when the icon is no longer festive', async () => {
  mockIcon.current = 'Sage';
  jest.setSystemTime(new Date(2027, 0, 3, 12));
  Object.assign(mockSettings, {
    festivePromptSeason: 'winter-holidays-2026',
    festiveSwitch: lastSeason,
    theme: 'velvet',
  });
  await focus();
  leave();
  await focus();
  expect(text()).toContainEqual(['festive.switchBackMessage', '']);
  await press('yes');
  expect(mockCalls).toEqual(['theme:ocean']);
});

it('skips a check that fires late, as the app reopens', async () => {
  await focus();
  leave();
  await act(async () => {
    blur = mockFocusEffect?.();
    // Timers paused in the background: the clock moves on, the timer fires later.
    jest.setSystemTime(Date.now() + 60_000);
    jest.advanceTimersByTime(800);
  });
  expect(isOpen()).toBe(false);
  expect(mockSettings.festivePromptSeason).toBeNull();
});

it('"Keep it" forgets the usual look; swiping the sheet away keeps the offer', async () => {
  await inJanuaryOnPineNight();
  await swipeDown();
  expect(isOpen()).toBe(false);
  expect(mockSettings.festiveSwitch).toBe(lastSeason);
  leave();
  await focus();
  await press('no');
  expect(mockSettings.festiveSwitch).toBeNull();
  expect(mockCalls).toEqual([]);
});

it("drops last season's look and suggests this season's", async () => {
  jest.setSystemTime(new Date(2027, 11, 5, 12));
  Object.assign(mockSettings, {
    festivePromptSeason: 'winter-holidays-2026',
    festiveSwitch: lastSeason,
  });
  await focus();
  leave();
  await focus();
  expect(mockSettings.festiveSwitch).toBeNull();
  expect(mockSettings.festivePromptSeason).toBe('winter-holidays-2027');
  expect(labels()).toEqual(['festive.takeALook', 'festive.notNow']);
});
