import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import BackupHistoryScreen from './index';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockQuery = jest.fn();
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
const mockToastSuccess = jest.fn();
const mockDismissTo = jest.fn();
const mockExport = jest.fn(async (_id: string, _day: string) => ({ missingMedia: 0 }));
const mockBuild = jest.fn(async (_id: string) => ({
  file: { uri: 'file:///cache/archive.zip' },
  fileName: 'archive.zip',
  missingMedia: 0,
}));
const mockDiscard = jest.fn();
const mockSelectArchive = jest.fn();
const mockClearPending = jest.fn();
const mockRunPending = jest.fn();
let mockPending: { source: 'tackbok'; uri: string } | null = null;

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
  RefreshControl: 'RefreshControl',
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    data: unknown[];
    renderItem: Function;
    ListHeaderComponent?: unknown;
    ListEmptyComponent?: unknown;
  }) => [
    ListHeaderComponent,
    ...(data.length ? data.map((item) => renderItem({ item })) : [ListEmptyComponent]),
  ],
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), dismissTo: mockDismissTo }),
}));
jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/toast', () => ({
  toast: {
    error: (message: string) => mockToastError(message),
    info: (message: string) => mockToastInfo(message),
    success: (message: string) => mockToastSuccess(message),
  },
}));
jest.mock('~/components/ui/alert-dialog', () => ({
  AlertDialog: 'AlertDialog',
  AlertDialogCancel: 'AlertDialogCancel',
  AlertDialogContent: 'AlertDialogContent',
  AlertDialogDescription: 'AlertDialogDescription',
  AlertDialogAction: 'AlertDialogAction',
  AlertDialogFooter: 'AlertDialogFooter',
  AlertDialogHeader: 'AlertDialogHeader',
  AlertDialogTitle: 'AlertDialogTitle',
}));
jest.mock('~/components/ui/safe-area-view', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('~/components/backdrops/ThemeBackdrop', () => ({
  ThemeBackdrop: 'ThemeBackdrop',
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
jest.mock('@tanstack/react-query', () => ({ useQuery: () => mockQuery() }));
jest.mock('~/hooks/useBackupImportFlow', () => ({
  useBackupImportFlow: () => ({
    importProgress: null,
    importSummary: null,
    pendingImportSelection: mockPending,
    selectTackbokArchive: (uri: string) => mockSelectArchive(uri),
    runPendingImport: mockRunPending,
    clearPendingImport: mockClearPending,
    closeImportSummary: jest.fn(),
  }),
}));
jest.mock('~/lib/cloudSync/ui/backupHistory', () => ({
  BackupHistoryError: class BackupHistoryError extends Error {
    reason: string;
    constructor(mockReason: string) {
      super(mockReason);
      this.reason = mockReason;
    }
  },
  listBackupHistory: jest.fn(),
  exportBackupFromHistory: (id: string, day: string) => mockExport(id, day),
  buildBackupHistoryArchive: (id: string) => mockBuild(id),
  discardBackupHistoryArchive: (uri: string) => mockDiscard(uri),
}));
jest.mock('~/lib/i18n/dateFormatting', () => ({
  ...jest.requireActual('~/lib/i18n/dateFormatting'),
  formatLocalizedDate: (date: number) => `date:${date}`,
  formatLocalizedTime: (date: Date) => `time:${date.getTime()}`,
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    isRTL: false,
    t: Object.assign(
      (key: keyof typeof mockEn, params?: Record<string, unknown>) =>
        mockTranslate('en', key, params as never),
      { locale: 'en' },
    ),
  }),
}));

const items = [
  { snapshotId: 'b'.repeat(64), createdAt: 2_000 },
  { snapshotId: 'a'.repeat(64), createdAt: 1_000 },
];

let root: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockPending = null;
});
afterEach(() => act(() => root?.unmount()));

function render(query: Record<string, unknown>) {
  mockQuery.mockReturnValue({
    data: undefined,
    isError: false,
    refetch: jest.fn(async () => ({})),
    ...query,
  });
  act(() => {
    root = create(<BackupHistoryScreen />);
  });
}
const content = () => JSON.stringify(root.toJSON());
const buttons = (label: string) =>
  root.root.findAll(
    (node) =>
      (node.type as unknown) === 'Button' &&
      node.findAllByType('Text' as never)[0]?.props.children === label,
  );
const flush = () => act(async () => {});

test('lists one backup a day with its date and time', () => {
  render({ data: items });
  expect(content()).toContain('date:2000');
  expect(content()).toContain('Saved at time:2000');
  expect(content()).toContain('date:1000');
  expect(buttons(mockEn['cloud.history.export'])).toHaveLength(2);
  expect(buttons(mockEn['cloud.history.restore'])[1].props.accessibilityLabel).toBe(
    'Restore the backup from date:1000',
  );
});

test('an empty history and a failed load say so', () => {
  render({ data: [] });
  expect(content()).toContain(mockEn['cloud.history.empty']);
  const refetch = jest.fn();
  act(() => root.unmount());
  render({ isError: true, refetch });
  expect(content()).toContain(mockEn['cloud.history.loadFailed']);
  act(() => buttons(mockEn['common.retry'])[0].props.onPress());
  expect(refetch).toHaveBeenCalled();
});

test('export saves the chosen backup, and says when media was left out', async () => {
  mockExport.mockResolvedValueOnce({ missingMedia: 2 });
  render({ data: items });
  await act(async () => buttons(mockEn['cloud.history.export'])[1].props.onPress());
  expect(mockExport).toHaveBeenCalledWith('a'.repeat(64), expect.any(String));
  expect(mockToastSuccess).toHaveBeenCalledWith(mockEn['cloud.history.exported']);
  expect(mockToastInfo).toHaveBeenCalledWith(mockEn['cloud.history.missingMedia']);
});

test('restore asks first, and builds nothing if cancelled', () => {
  render({ data: items });
  act(() => buttons(mockEn['cloud.history.restore'])[0].props.onPress());
  const dialog = root.root.findByType('AlertDialog' as never);
  expect(dialog.props.open).toBe(true);
  expect(content()).toContain('Restore the backup from date:2000?');
  expect(content()).toContain(mockEn['cloud.history.restoreDescription']);
  act(() => root.root.findByType('AlertDialogCancel' as never).props.onPress());
  expect(root.root.findByType('AlertDialog' as never).props.open).toBe(false);
  expect(mockBuild).not.toHaveBeenCalled();
});

test('a confirmed restore hands the archive to the import, whose mode choice follows', async () => {
  render({ data: items });
  act(() => buttons(mockEn['cloud.history.restore'])[0].props.onPress());
  act(() => root.root.findByType('AlertDialogAction' as never).props.onPress());
  await flush();
  expect(mockBuild).toHaveBeenCalledWith('b'.repeat(64));
  expect(mockSelectArchive).toHaveBeenCalledWith('file:///cache/archive.zip');
});

test('cancelling the mode choice deletes the archive', async () => {
  render({ data: items });
  act(() => buttons(mockEn['cloud.history.restore'])[0].props.onPress());
  act(() => root.root.findByType('AlertDialogAction' as never).props.onPress());
  await flush();
  act(() => root.root.findByType('SettingsImportModeModal' as never).props.onClose());
  expect(mockClearPending).toHaveBeenCalled();
  expect(mockDiscard).toHaveBeenCalledWith('file:///cache/archive.zip');
});

test('a backup that is gone says so and reloads the list', async () => {
  const { BackupHistoryError } = jest.requireMock('~/lib/cloudSync/ui/backupHistory');
  mockBuild.mockRejectedValueOnce(new BackupHistoryError('backup-gone'));
  const refetch = jest.fn(async () => ({}));
  render({ data: items, refetch });
  act(() => buttons(mockEn['cloud.history.restore'])[0].props.onPress());
  act(() => root.root.findByType('AlertDialogAction' as never).props.onPress());
  await flush();
  expect(mockToastError).toHaveBeenCalledWith(mockEn['cloud.history.gone']);
  expect(refetch).toHaveBeenCalled();
  expect(mockSelectArchive).not.toHaveBeenCalled();
});
