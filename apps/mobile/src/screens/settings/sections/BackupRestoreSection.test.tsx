import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { BackupRestoreSection } from './BackupRestoreSection';

const mockToast = {
  loading: jest.fn(() => 'toast-1'),
  finish: jest.fn(),
  dismiss: jest.fn(),
};
jest.mock('~/components/ui/toast', () => ({
  get toast() {
    return mockToast;
  },
}));
const mockTrack = jest.fn();
jest.mock('~/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

let mockExport: () => Promise<void> = async () => {};
jest.mock('~/lib/backupExport', () => ({
  exportToBackupZip: () => mockExport(),
  NothingToExportError: class NothingToExportError extends Error {},
  isAndroidSaveCancelled: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code).includes('CANCELLED'),
}));

jest.mock('react-native', () => ({ Platform: { OS: 'android' }, View: 'View' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }),
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'LucideIcon' }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn) => mockEn[key],
  }),
}));
jest.mock('~/lib/cloudSync/ui', () => ({
  useCloudSyncSnapshot: () => ({ snapshot: { configured: false } }),
}));
jest.mock('~/hooks/useBackupImportFlow', () => ({
  useBackupImportFlow: () => ({
    importProgress: null,
    importSummary: null,
    pendingImportSelection: null,
    selectImportFile: jest.fn(),
    runPendingImport: jest.fn(),
    startPresentlyImport: jest.fn(),
    clearPendingImport: jest.fn(),
    closeImportSummary: jest.fn(),
  }),
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ImportSourceIcons', () => ({
  GratitudeJournalLogoIcon: 'Icon',
  PresentlyLogoIcon: 'Icon',
}));
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
jest.mock('../SettingsSection', () => ({
  SettingsSection: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('~/components/SettingsRow', () => ({ SettingsRow: 'SettingsRow' }));
jest.mock('../SettingsImportModeModal', () => ({ SettingsImportModeModal: 'Modal' }));
jest.mock('../SettingsImportProgressModal', () => ({
  SettingsImportProgressModal: 'Modal',
}));
jest.mock('../SettingsImportSummaryModal', () => ({
  SettingsImportSummaryModal: 'Modal',
}));

let renderer: ReactTestRenderer;
const exportRow = () =>
  renderer.root.find(
    (node) =>
      (node.type as unknown) === 'SettingsRow' &&
      node.props.label === mockEn['backup.exportAsZip'],
  );

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    renderer = create(<BackupRestoreSection />);
  });
});
afterEach(() => act(() => renderer.unmount()));

test('an export shows a spinner, then its outcome', async () => {
  mockExport = async () => {};
  await act(async () => exportRow().props.onPress());
  expect(mockToast.loading).toHaveBeenCalledWith(mockEn['backup.preparingBackup']);
  expect(mockToast.finish).toHaveBeenCalledWith(
    'toast-1',
    'success',
    mockEn['backup.backupExportedSuccessfully'],
  );
  expect(mockTrack).toHaveBeenCalledWith('backup_exported');
});

test('closing the save dialog only removes the spinner', async () => {
  mockExport = async () => {
    throw new Error('Export cancelled or failed: cancelled', {
      cause: { code: 'ERR_SAVE_CANCELLED' },
    });
  };
  await act(async () => exportRow().props.onPress());
  expect(mockToast.dismiss).toHaveBeenCalledWith('toast-1');
  expect(mockToast.finish).not.toHaveBeenCalled();
  expect(mockTrack).not.toHaveBeenCalled();
});

test('an empty journal and a real failure each say so', async () => {
  mockExport = async () => {
    const { NothingToExportError } = jest.requireMock('~/lib/backupExport') as {
      NothingToExportError: new () => Error;
    };
    throw new NothingToExportError();
  };
  await act(async () => exportRow().props.onPress());
  expect(mockToast.finish).toHaveBeenLastCalledWith(
    'toast-1',
    'error',
    mockEn['backup.nothingToExport'],
  );
  mockExport = async () => {
    throw new Error('disk full');
  };
  await act(async () => exportRow().props.onPress());
  expect(mockToast.finish).toHaveBeenLastCalledWith(
    'toast-1',
    'error',
    mockEn['backup.exportFailed'],
  );
});

test('a second tap during an export starts nothing', async () => {
  let finish: () => void = () => {};
  mockExport = () => new Promise<void>((resolve) => (finish = resolve));
  let first: Promise<void> = Promise.resolve();
  act(() => {
    first = exportRow().props.onPress();
  });
  await act(async () => exportRow().props.onPress());
  expect(mockToast.loading).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await first;
  });
  expect(mockToast.finish).toHaveBeenCalledTimes(1);
});
