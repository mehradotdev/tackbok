import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CloudBackupScreen from './index';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';
import { SyncCancelledError as MockSyncCancelledError } from '~/lib/cloudSync/snapshot/sync/errors';
import { toast as mockToast } from '~/components/ui/toast';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  AccessibilityInfo: { announceForAccessibility: jest.fn() },
  ActivityIndicator: 'ActivityIndicator',
  Linking: {},
  ScrollView: 'ScrollView',
  View: 'View',
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@lodev09/react-native-true-sheet', () => ({ TrueSheet: 'TrueSheet' }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: jest.fn() }),
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'LucideIcon' }));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '8', '#999'] }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    isRTL: false,
    t: (key: keyof typeof mockEn, params?: Record<string, string | number>) =>
      mockTranslate('en', key, params),
  }),
}));
jest.mock('~/lib/i18n/dateFormatting', () => ({ formatLocalizedDate: () => 'today' }));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: (select: (state: object) => unknown) =>
    select({
      cloudSyncWifiOnlyMedia: false,
      setCloudSyncWifiOnlyMedia: jest.fn(),
      setHasCompletedOnboarding: jest.fn(),
      resetToDefaults: jest.fn(),
    }),
}));
jest.mock('~/lib/cloudSync/auth', () => ({ CloudAuthError: class {} }));
jest.mock('~/lib/cloudSync/snapshot/sync', () => ({ SnapshotProviderError: class {} }));

const mockSnapshot = {
  configured: true,
  provider: 'google-drive',
  status: 'synced',
  accountLabel: 'owner@example.com',
  activityPhase: null,
  initialRestore: false,
  queuedCount: 0,
  conflictCount: 0,
  lastSuccessAt: null,
  lastVerifiedAt: null,
  revocationKind: null,
  attentionReason: null,
  recoveryAction: null,
};
const mockRefresh = jest.fn(async () => {});
const mockDisconnect = jest.fn<Promise<void>, []>();
const mockSetPaused = jest.fn<Promise<void>, [boolean]>();
const mockSyncNow = jest.fn<Promise<boolean>, []>();
jest.mock('~/lib/cloudSync/ui', () => ({
  acknowledgeCloudConflicts: jest.fn(),
  cancelPreparedGoogleDriveConnection: jest.fn(async () => {}),
  completeGoogleDriveConnection: jest.fn(),
  deleteJournalEverywhere: jest.fn(),
  disconnectGoogleDrive: () => mockDisconnect(),
  listUnacknowledgedCloudConflicts: jest.fn(async () => []),
  prepareGoogleDriveConnection: jest.fn(),
  reconnectGoogleDrive: jest.fn(),
  resetThisDeviceOnly: jest.fn(),
  retrySyncAttentionReason: jest.fn(),
  revokeCloudVault: jest.fn(),
  setCloudSyncPaused: (paused: boolean) => mockSetPaused(paused),
  syncNow: () => mockSyncNow(),
  useCloudSyncSnapshot: () => ({ snapshot: mockSnapshot, refresh: mockRefresh }),
  CloudSyncActionError: class extends Error {},
}));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/spinning-refresh-icon', () => ({
  SpinningRefreshIcon: 'SpinningRefreshIcon',
}));
jest.mock('~/components/SettingsRow', () => ({ SettingsRow: 'SettingsRow' }));
jest.mock('~/components/ui/switch', () => ({ Switch: 'Switch' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock('~/components/ui/alert-dialog', () => ({
  AlertDialog: 'AlertDialog',
  AlertDialogCancel: 'AlertDialogCancel',
  AlertDialogContent: 'AlertDialogContent',
  AlertDialogDescription: 'AlertDialogDescription',
  AlertDialogDestructiveAction: 'AlertDialogDestructiveAction',
  AlertDialogFooter: 'AlertDialogFooter',
  AlertDialogHeader: 'AlertDialogHeader',
  AlertDialogTitle: 'AlertDialogTitle',
}));
jest.mock('./setup-progress', () => ({ SetupProgress: 'SetupProgress' }));
jest.mock('./ConflictsCard', () => ({ ConflictsCard: 'ConflictsCard' }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let root: ReactTestRenderer;
const findHost = (type: string, matches: (props: Record<string, unknown>) => boolean) => {
  const node = root.root.findAllByType(type as never).find((item) => matches(item.props));
  if (!node) throw new Error(`No ${type} found`);
  return node;
};
// The Disconnect row's label changes while it runs; its hint does not.
const disconnectRow = () =>
  findHost(
    'SettingsRow',
    (props) => props.accessibilityHint === mockEn['cloud.keepLocalDataAndTheCloudCopy'],
  );
const pauseRow = () =>
  findHost('SettingsRow', (props) => props.label === mockEn['cloud.pauseSync']);
const syncNowButton = () =>
  findHost('Button', (props) => props.accessibilityLabel === mockEn['cloud.syncNow']);

async function render() {
  await act(async () => {
    root = create(<CloudBackupScreen />);
  });
}

async function confirmDisconnect() {
  act(() => disconnectRow().props.onPress());
  const confirm = root.root.findByType('AlertDialogDestructiveAction' as never);
  await act(async () => confirm.props.onPress());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnapshot.status = 'synced';
});
afterEach(() => act(() => root?.unmount()));

test('Disconnect shows its progress, ignores repeat presses and confirms what is kept', async () => {
  const pending = deferred<void>();
  mockDisconnect.mockReturnValueOnce(pending.promise);
  await render();
  await confirmDisconnect();

  expect(disconnectRow().props.label).toBe(mockEn['cloud.disconnecting']);
  expect(disconnectRow().props.disabled).toBe(true);
  expect(pauseRow().props.disabled).toBe(true);
  expect(syncNowButton().props.disabled).toBe(true);
  await confirmDisconnect();
  expect(mockDisconnect).toHaveBeenCalledTimes(1);

  await act(async () => pending.resolve());
  expect(mockToast.success).toHaveBeenCalledWith(
    mockEn['cloud.disconnectedYourJournalStaysOnThisPhone'],
  );
  expect(disconnectRow().props.label).not.toBe(mockEn['cloud.disconnecting']);
  expect(disconnectRow().props.disabled).toBe(false);
});

test('a failed Disconnect says so specifically', async () => {
  mockDisconnect.mockRejectedValueOnce(new Error('network'));
  await render();
  await confirmDisconnect();
  expect(mockToast.error).toHaveBeenCalledWith(
    mockEn['cloud.couldNotDisconnectTryAgain'],
  );
  expect(mockToast.error).not.toHaveBeenCalledWith(
    mockEn['cloud.cloudBackupCouldNotBeUpdated'],
  );
});

test('Pause shows Pausing… and the switch follows the stored state', async () => {
  const pending = deferred<void>();
  mockSetPaused.mockReturnValueOnce(pending.promise);
  await render();
  await act(async () => pauseRow().props.onPress());

  expect(mockSetPaused).toHaveBeenCalledWith(true);
  expect(pauseRow().props.description).toBe(mockEn['cloud.pausing']);
  expect(pauseRow().props.accessibilityState.checked).toBe(false);
  await act(async () => pauseRow().props.onPress());
  expect(mockSetPaused).toHaveBeenCalledTimes(1);

  mockSnapshot.status = 'paused';
  await act(async () => pending.resolve());
  expect(mockToast.success).toHaveBeenCalledWith(mockEn['cloud.syncPaused']);
  expect(pauseRow().props.description).toBe(
    mockEn['cloud.editsRemainSafelyQueuedOnThisDevice'],
  );
  expect(pauseRow().props.accessibilityState.checked).toBe(true);
});

test('Sync now cancelled by Pause or Disconnect shows no error', async () => {
  const sync = deferred<boolean>();
  mockSyncNow.mockReturnValueOnce(sync.promise);
  const disconnect = deferred<void>();
  mockDisconnect.mockReturnValueOnce(disconnect.promise);
  await render();
  act(() => syncNowButton().props.onPress());
  // Disconnect is still available while a manual pass is running.
  await confirmDisconnect();
  expect(mockDisconnect).toHaveBeenCalledTimes(1);

  await act(async () => sync.reject(new MockSyncCancelledError()));
  await act(async () => disconnect.resolve());
  expect(mockToast.error).not.toHaveBeenCalled();
  expect(mockToast.success).toHaveBeenCalledTimes(1);
  expect(mockToast.success).toHaveBeenCalledWith(
    mockEn['cloud.disconnectedYourJournalStaysOnThisPhone'],
  );
});

test('Disconnect still reports its result after the screen closes', async () => {
  const pending = deferred<void>();
  mockDisconnect.mockReturnValueOnce(pending.promise);
  await render();
  await confirmDisconnect();
  act(() => root.unmount());

  await act(async () => pending.resolve());
  expect(mockToast.success).toHaveBeenCalledWith(
    mockEn['cloud.disconnectedYourJournalStaysOnThisPhone'],
  );
});
