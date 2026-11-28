import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { WhatsNewSheet } from './WhatsNewSheet';
import { whatsNewFirst } from './homePrompts';

jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '2.0.0' } }));

const mockPush = jest.fn();
let mockFocusEffect: (() => void | (() => void)) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocusEffect = effect;
  },
  useRouter: () => ({ push: mockPush }),
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
    return [props.children, props.footer];
  });
  return { TrueSheet };
});

jest.mock('~/lib/settings', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return {
    useSettingsStore: createStore((set: (state: object) => void) => ({
      biometricUnlockEnabled: false,
      hasCompletedOnboarding: true,
      hasSeenHomeCoachMarks: true,
      pendingAchievement: null,
      lastSeenAppVersion: null as string | null,
      setLastSeenAppVersion: (lastSeenAppVersion: string | null) =>
        set({ lastSeenAppVersion }),
    })),
  };
});
jest.mock('~/lib/splash', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return { useSplashActive: createStore(() => ({ active: true })) };
});
jest.mock('~/lib/appLock', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return { useAppLockStore: createStore(() => ({ isLocked: false })) };
});
jest.mock('~/lib/achievement-dialog', () => {
  const { create: createStore } = jest.requireActual('zustand');
  return { useAchievementDialogStore: createStore(() => ({ manualAchievement: null })) };
});
jest.mock('./HomeCoachMarks', () => ({ homeTipsShowing: () => false }));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '8', '#999'] }));
jest.mock('~/lib/theme/themes', () => ({ DEFAULT_THEME_SHEET_RADIUS: 16 }));
jest.mock('~/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('lucide-react-native', () => ({}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { useSettingsStore } = require('~/lib/settings');
const { useSplashActive } = require('~/lib/splash');
/* eslint-enable @typescript-eslint/no-require-imports */

let tree: ReactTestRenderer;

async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(800);
  });
}
const isOpen = () =>
  mockSheetOpen && tree.root.findAllByType('Button' as never).length > 0;

beforeEach(async () => {
  jest.useFakeTimers();
  mockSheetOpen = false;
  mockPush.mockClear();
  useSettingsStore.setState({ lastSeenAppVersion: null, pendingAchievement: null });
  useSplashActive.setState({ active: true });
  await act(async () => {
    tree = create(<WhatsNewSheet blocked={false} />);
  });
  await act(async () => {
    mockFocusEffect?.();
  });
});

afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

it('waits for the launch animation, then shows once and counts as seen', async () => {
  await settle();
  expect(isOpen()).toBe(false);
  await act(async () => useSplashActive.setState({ active: false }));
  await settle();
  expect(isOpen()).toBe(true);
  expect(useSettingsStore.getState().lastSeenAppVersion).toBe('2.0.0');
  // Other Home sheets keep waiting while it is up.
  expect(whatsNewFirst()).toBe(true);

  await act(async () => tree.root.findAllByType('Button' as never)[0]!.props.onPress());
  expect(isOpen()).toBe(false);
  expect(whatsNewFirst()).toBe(false);
  await settle();
  expect(isOpen()).toBe(false);
});

it('stays away for someone already past this version', async () => {
  useSettingsStore.setState({ lastSeenAppVersion: '2.0.0' });
  await act(async () => useSplashActive.setState({ active: false }));
  await settle();
  expect(isOpen()).toBe(false);
});

it('waits for an achievement to be closed', async () => {
  useSettingsStore.setState({ pendingAchievement: { id: 'day-1' } });
  await act(async () => useSplashActive.setState({ active: false }));
  await settle();
  expect(isOpen()).toBe(false);
  await act(async () => useSettingsStore.setState({ pendingAchievement: null }));
  await settle();
  expect(isOpen()).toBe(true);
});

it('opens the theme picker from "See the new themes"', async () => {
  await act(async () => useSplashActive.setState({ active: false }));
  await settle();
  await act(async () => tree.root.findAllByType('Button' as never)[1]!.props.onPress());
  expect(isOpen()).toBe(false);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/appearance',
    params: { open: 'themes' },
  });
  expect(tree.root.findByType(TrueSheet)).toBeTruthy();
});
