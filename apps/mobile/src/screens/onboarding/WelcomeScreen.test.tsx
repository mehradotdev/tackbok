import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import WelcomeScreen from './WelcomeScreen';

const mockPush = jest.fn((_href: string) => {});
const mockRunPending = jest.fn(async (_mode: string) => {});
const mockHasAnyEntries = jest.fn<Promise<boolean>, []>();
let mockPending: { source: 'tackbok' | 'gratitudeApp'; uri: string } | null = null;
let mockOnImportDone: (source: string) => void = () => {};
let mockFocusEffect: () => void = () => {};
const mockPresent = jest.fn();
const mockSettings = {
  bodyFontSize: 'default',
  setBodyFontSize: () => {},
  hasCompletedOnboarding: false,
  profileName: null as string | null,
  profileImageUri: null as string | null,
};

jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
  useFocusEffect: (effect: () => void) => {
    mockFocusEffect = effect;
  },
}));
jest.mock('@lodev09/react-native-true-sheet', () => {
  const TrueSheet = () => null;
  TrueSheet.present = (name: string) => mockPresent(name);
  TrueSheet.dismiss = async () => {};
  return { TrueSheet };
});
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'LucideIcon' }));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '8', '#999'] }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
    isRTL: false,
  }),
}));
jest.mock('~/lib/settings', () => {
  const useSettingsStore = (select: (s: typeof mockSettings) => unknown) =>
    select(mockSettings);
  useSettingsStore.getState = () => mockSettings;
  return { useSettingsStore };
});
jest.mock('~/db/queries', () => ({ hasAnyEntries: () => mockHasAnyEntries() }));
jest.mock('~/hooks/useBackupImportFlow', () => ({
  useBackupImportFlow: (onImportDone: (source: string) => void) => {
    mockOnImportDone = onImportDone;
    return {
      importProgress: null,
      importSummary: null,
      pendingImportSelection: mockPending,
      selectImportFile: jest.fn(),
      runPendingImport: mockRunPending,
      startPresentlyImport: jest.fn(),
      clearPendingImport: jest.fn(),
      closeImportSummary: jest.fn(),
    };
  },
}));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/TackbokLogo', () => ({ TackbokLogo: 'TackbokLogo' }));
jest.mock('~/components/LanguageSelectControl', () => ({
  LanguageSelectControl: 'LanguageSelectControl',
}));
jest.mock('~/components/ImportSourceIcons', () => ({
  GratitudeJournalLogoIcon: 'GratitudeJournalLogoIcon',
  PresentlyLogoIcon: 'PresentlyLogoIcon',
}));
jest.mock('~/screens/settings/SettingsImportModeModal', () => ({
  SettingsImportModeModal: 'SettingsImportModeModal',
}));
jest.mock('~/screens/settings/SettingsImportProgressModal', () => ({
  SettingsImportProgressModal: 'SettingsImportProgressModal',
}));
jest.mock('~/screens/settings/SettingsImportSummaryModal', () => ({
  SettingsImportSummaryModal: 'SettingsImportSummaryModal',
}));
jest.mock('./OnboardingScaffold', () => ({
  OnboardingScaffold: ({
    overlays,
    footer,
    children,
  }: {
    overlays: React.ReactNode;
    footer: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {overlays}
      {children}
      {footer}
    </>
  ),
}));
jest.mock('./useOnboardingStepView', () => ({ useOnboardingStepView: jest.fn() }));
jest.mock('./useNavigateOnce', () => ({
  useNavigateOnce: () => (action: () => unknown) => action(),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '2.0.0' }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.9.0' } }));

let root: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockPending = null;
  Object.assign(mockSettings, {
    hasCompletedOnboarding: false,
    profileName: null,
    profileImageUri: null,
  });
});
afterEach(() => act(() => root?.unmount()));

async function renderWithPendingZip() {
  mockPending = { source: 'tackbok', uri: 'file:///backup.zip' };
  await act(async () => {
    root = create(<WelcomeScreen />);
  });
}
const modeModal = () => root.root.findByType('SettingsImportModeModal' as never);

test('a first-run import of an empty journal skips the Skip/Overwrite question', async () => {
  mockHasAnyEntries.mockResolvedValue(false);
  await renderWithPendingZip();
  expect(mockRunPending.mock.calls).toEqual([['skip']]);
  expect(modeModal().props.visible).toBe(false);
});

test('a replay with entries still asks how to handle them', async () => {
  mockHasAnyEntries.mockResolvedValue(true);
  await renderWithPendingZip();
  expect(mockRunPending).not.toHaveBeenCalled();
  expect(modeModal().props.visible).toBe(true);
});

test('an empty journal with a saved profile still asks: Skip would keep that profile', async () => {
  mockHasAnyEntries.mockResolvedValue(false);
  mockSettings.profileName = 'Sam';
  await renderWithPendingZip();
  expect(mockRunPending).not.toHaveBeenCalled();
  expect(modeModal().props.visible).toBe(true);
});

test('when the journal cannot be checked, it asks rather than guessing', async () => {
  mockHasAnyEntries.mockRejectedValue(new Error('db'));
  await renderWithPendingZip();
  expect(mockRunPending).not.toHaveBeenCalled();
  expect(modeModal().props.visible).toBe(true);
});

test('after a Tackbok backup import the flow continues on Theme, or Name without one', async () => {
  await act(async () => {
    root = create(<WelcomeScreen />);
  });
  mockSettings.profileName = 'Sam';
  act(() => mockOnImportDone('tackbok'));
  expect(mockPush).toHaveBeenLastCalledWith('/onboarding/theme');
  mockSettings.profileName = null;
  act(() => mockOnImportDone('tackbok'));
  expect(mockPush).toHaveBeenLastCalledWith('/onboarding/name');
  act(() => mockOnImportDone('presently'));
  expect(mockPush).toHaveBeenLastCalledWith('/onboarding/name');
});

describe('returning from Google Drive setup', () => {
  async function leaveForDrive() {
    await act(async () => {
      root = create(<WelcomeScreen />);
    });
    const sheet = root.root.find(
      (node) => typeof node.props.onSelectSource === 'function',
    );
    await act(async () => sheet.props.onSelectSource('google-drive'));
    expect(mockPush).toHaveBeenCalledWith('/cloud-backup?origin=onboarding');
  }

  test('reopens the import sheet when the user backed out', async () => {
    await leaveForDrive();
    act(() => mockFocusEffect());
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  test('stays closed once a restore has completed onboarding', async () => {
    await leaveForDrive();
    mockSettings.hasCompletedOnboarding = true;
    act(() => mockFocusEffect());
    expect(mockPresent).not.toHaveBeenCalled();
  });
});

test('shows the app version under the import link', async () => {
  await act(async () => {
    root = create(<WelcomeScreen />);
  });
  const version = root.root.findAll(
    (node) => node.props.children === 'onboarding.welcome.version {"version":"2.0.0"}',
  );
  expect(version).toHaveLength(1);
});
