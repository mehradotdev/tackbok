import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { StoreUpdatePrompt as Prompt } from '~/lib/storeUpdate';
import { resetStoreUpdateOffer, StoreUpdatePrompt } from './StoreUpdatePrompt';

jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active' },
  Linking: { openURL: (url: string) => mockOpenURL(url) },
}));
const mockOpenURL = jest.fn(async (_url: string) => {});

let mockBlur: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      const cleanup = effect();
      mockBlur = cleanup;
      return cleanup;
    }, [effect]);
  },
}));

let mockSheetOpen = false;
jest.mock('@lodev09/react-native-true-sheet', () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual('react');
  const TrueSheet = forwardRef(function TrueSheet(
    props: {
      children: React.ReactNode;
      footer: React.ReactNode;
      onDidDismiss: () => void;
    },
    ref: React.Ref<unknown>,
  ) {
    useImperativeHandle(ref, () => ({
      present: async () => {
        mockSheetOpen = true;
      },
      dismiss: async () => {
        mockSheetOpen = false;
        props.onDidDismiss();
      },
    }));
    return (
      <>
        {props.children}
        {props.footer}
      </>
    );
  });
  return { TrueSheet };
});

let mockDue: Prompt | null = null;
const mockNotNow = jest.fn(async (_version: string) => {});
jest.mock('~/lib/storeUpdate', () => ({
  checkForStoreUpdate: async () => mockDue,
  setNotNowVersion: (version: string) => mockNotNow(version),
}));

jest.mock('~/lib/settings', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return {
    useSettingsStore: createStore(() => ({
      biometricUnlockEnabled: false,
      hasCompletedOnboarding: true,
      hasSeenHomeCoachMarks: true,
      pendingAchievement: null,
    })),
  };
});
jest.mock('~/lib/splash', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return { useSplashActive: createStore(() => ({ active: false })) };
});
jest.mock('~/lib/appLock', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return { useAppLockStore: createStore(() => ({ isLocked: false })) };
});
jest.mock('~/lib/achievement-dialog', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return { useAchievementDialogStore: createStore(() => ({ manualAchievement: null })) };
});
jest.mock('~/lib/appIcon', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return { useAppIconStore: createStore(() => ({ current: 'Classic' })) };
});
let mockTipsShowing = false;
let mockSettingsSheet = false;
jest.mock('./HomeCoachMarks', () => ({ homeTipsShowing: () => mockTipsShowing }));
jest.mock('~/components/SettingsBottomSheet', () => ({
  settingsSheetShowing: () => mockSettingsSheet,
}));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '8', '#999'] }));
jest.mock('~/lib/theme/themes', () => ({ DEFAULT_THEME_SHEET_RADIUS: 16 }));
jest.mock('~/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('~/screens/settings/AppIconPickerSheet', () => ({
  AppIconTile: 'AppIconTile',
}));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
const mockToastError = jest.fn();
jest.mock('~/components/ui/toast', () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));

const update: Prompt = {
  latest: '2.0.1',
  storeUrl: 'https://apps.apple.com/us/app/tackbok-gratitude-journal/id6757330507',
  required: false,
};

let tree: ReactTestRenderer;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useSettingsStore } = require('~/lib/settings');

async function mount(blocked = false) {
  await act(async () => {
    tree = create(<StoreUpdatePrompt blocked={blocked} />);
  });
}
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(800);
  });
}
const isOpen = () =>
  mockSheetOpen && tree.root.findAllByType('Button' as never).length > 0;
async function press(which: 'update' | 'notNow') {
  const buttons = tree.root.findAllByType('Button' as never);
  await act(async () => buttons[which === 'update' ? 0 : 1]!.props.onPress());
}

beforeEach(() => {
  jest.useFakeTimers();
  resetStoreUpdateOffer();
  mockDue = update;
  mockSheetOpen = false;
  mockTipsShowing = false;
  mockSettingsSheet = false;
  mockOpenURL.mockClear();
  mockNotNow.mockClear();
  useSettingsStore.setState({ pendingAchievement: null });
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

it('offers the update on the Home the app opened on, and opens the store', async () => {
  await mount();
  await settle();
  expect(isOpen()).toBe(true);
  await press('update');
  expect(isOpen()).toBe(false);
  expect(mockOpenURL).toHaveBeenCalledWith(update.storeUrl);
  expect(mockNotNow).not.toHaveBeenCalled();
});

it('says so when the store cannot be opened', async () => {
  mockOpenURL.mockRejectedValueOnce(new Error('no store'));
  await mount();
  await settle();
  await press('update');
  expect(mockToastError).toHaveBeenCalledWith('appInfo.unableToOpenTheStore');
});

it('remembers "Not now" for this version', async () => {
  await mount();
  await settle();
  await press('notNow');
  expect(mockNotNow).toHaveBeenCalledWith('2.0.1');
  expect(isOpen()).toBe(false);
});

it('does not remember "Not now" below the minimum supported version', async () => {
  mockDue = { ...update, required: true };
  await mount();
  await settle();
  expect(tree.root.findAllByType('Text' as never).map((n) => n.props.children)).toContain(
    'storeUpdate.requiredMessage',
  );
  await press('notNow');
  expect(mockNotNow).not.toHaveBeenCalled();
});

it('stays away once the user has left Home, so never mid-edit', async () => {
  useSettingsStore.setState({ pendingAchievement: { id: 'day-1' } });
  await mount();
  await settle();
  expect(isOpen()).toBe(false);
  // They open an entry; the achievement closes while they write.
  act(() => mockBlur?.());
  await act(async () => useSettingsStore.setState({ pendingAchievement: null }));
  await settle();
  expect(isOpen()).toBe(false);
});

it('closes if something opens over Home while it is up', async () => {
  await mount();
  await settle();
  expect(isOpen()).toBe(true);
  await act(async () => mockBlur?.());
  expect(isOpen()).toBe(false);
  expect(mockNotNow).not.toHaveBeenCalled();
});

it('does not offer it if Home was left just as the timer fired', async () => {
  await mount();
  // The blur's cleanup runs, then the timer, before React re-renders.
  mockBlur?.();
  jest.advanceTimersByTime(800);
  await act(async () => {});
  expect(isOpen()).toBe(false);
});

it('waits while a Home picker is open', async () => {
  await mount(true);
  await settle();
  expect(isOpen()).toBe(false);
  await act(async () => tree.update(<StoreUpdatePrompt blocked={false} />));
  await settle();
  expect(isOpen()).toBe(true);
});

it('waits out the Home tips and the profile sheet, which it cannot watch', async () => {
  mockTipsShowing = true;
  await mount();
  await settle();
  await settle();
  expect(isOpen()).toBe(false);
  // The tour ends; the profile sheet opens (its name field) before the next look.
  mockTipsShowing = false;
  mockSettingsSheet = true;
  await settle();
  expect(isOpen()).toBe(false);
  mockSettingsSheet = false;
  await settle();
  expect(isOpen()).toBe(true);
});

it('asks once per launch, even if Home mounts again', async () => {
  await mount();
  await settle();
  act(() => tree.unmount());
  mockSheetOpen = false;
  await mount();
  await settle();
  expect(isOpen()).toBe(false);
});

it('shows nothing when no update is due', async () => {
  mockDue = null;
  await mount();
  await settle();
  expect(isOpen()).toBe(false);
});
