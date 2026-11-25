import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import WelcomeScreen from './WelcomeScreen';

const mockPush = jest.fn((_href: string) => {});
const mockRunPending = jest.fn(async (_mode: string) => {});
const mockHasAnyEntries = jest.fn<Promise<boolean>, []>();
let mockPending: { source: 'tackbok' | 'gratitudeApp'; uri: string } | null = null;
let mockOnImportDone: (source: string) => void = () => {};

jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
  useFocusEffect: jest.fn(),
}));
jest.mock('@lodev09/react-native-true-sheet', () => ({ TrueSheet: 'TrueSheet' }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'LucideIcon' }));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '8', '#999'] }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, isRTL: false }),
}));
jest.mock('~/lib/settings', () => {
  const state = { bodyFontSize: 'default', setBodyFontSize: () => {} };
  const useSettingsStore = (select: (s: typeof state) => unknown) => select(state);
  useSettingsStore.getState = () => state;
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
    children,
  }: {
    overlays: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {overlays}
      {children}
    </>
  ),
}));
jest.mock('./useOnboardingStepView', () => ({ useOnboardingStepView: jest.fn() }));

let root: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockPending = null;
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

test('when the journal cannot be checked, it asks rather than guessing', async () => {
  mockHasAnyEntries.mockRejectedValue(new Error('db'));
  await renderWithPendingZip();
  expect(mockRunPending).not.toHaveBeenCalled();
  expect(modeModal().props.visible).toBe(true);
});

test('after a Tackbok backup import the flow continues on Theme, not Privacy', async () => {
  await act(async () => {
    root = create(<WelcomeScreen />);
  });
  act(() => mockOnImportDone('tackbok'));
  expect(mockPush).toHaveBeenLastCalledWith('/onboarding/theme');
  act(() => mockOnImportDone('presently'));
  expect(mockPush).toHaveBeenLastCalledWith('/onboarding/name');
});
