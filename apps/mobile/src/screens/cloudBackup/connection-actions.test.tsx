import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CloudBackupScreen from './index';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';
import { SyncCancelledError as MockSyncCancelledError } from '~/lib/cloudSync/snapshot/sync/errors';
import { toast as mockToast } from '~/components/ui/toast';
import {
  ATTENTION_RECOVERY_ACTION,
  type SyncAttentionReason,
  type SyncRecoveryAction,
} from '~/lib/cloudSync/snapshot/sync/types';
import type { TranslationFunction } from '~/lib/i18n/types';
import { recoveryActionLabel } from './copy';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  AccessibilityInfo: { announceForAccessibility: jest.fn() },
  ActivityIndicator: 'ActivityIndicator',
  Linking: {
    openURL: (url: string) => mockOpenURL(url),
    openSettings: () => mockOpenSettings(),
  },
  ScrollView: 'ScrollView',
  View: 'View',
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    canGoBack: () => true,
    back: jest.fn(),
    replace: jest.fn(),
    push: (href: string) => mockPush(href),
  }),
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
jest.mock('~/lib/i18n/dateFormatting', () => ({
  formatLocalizedDate: () => 'today',
  formatLocalizedTime: () => '09:30',
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: (select: (state: object) => unknown) =>
    select({
      cloudSyncWifiOnlyMedia: false,
      setCloudSyncWifiOnlyMedia: jest.fn(),
      setHasCompletedOnboarding: jest.fn(),
      resetToDefaults: jest.fn(),
    }),
}));
jest.mock('~/lib/cloudSync/auth', () => ({
  CloudAuthError: class MockCloudAuthError extends Error {
    code: string;
    constructor(mockCode: string) {
      super(mockCode);
      this.code = mockCode;
    }
  },
}));
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
  attentionReason: null as string | null,
  recoveryAction: null as string | null,
};
let mockParams: { origin?: string } = {};
const mockRefresh = jest.fn(async () => {});
const mockOpenURL = jest.fn(async (_url: string) => {});
const mockOpenSettings = jest.fn(async () => {});
const mockPush = jest.fn((_href: string) => {});
const mockRetry = jest.fn(async (_reason: string) => {});
const mockRevoke = jest.fn(async (_kind: string) => {});
const mockDisconnect = jest.fn<Promise<void>, []>();
const mockSetPaused = jest.fn<Promise<void>, [boolean]>();
const mockSyncNow = jest.fn<Promise<boolean>, []>();
const mockPrepare = jest.fn<Promise<unknown>, []>();
const mockReconnect = jest.fn<Promise<void>, []>();
jest.mock('~/lib/cloudSync/ui', () => ({
  acknowledgeCloudConflicts: jest.fn(),
  cancelPreparedGoogleDriveConnection: jest.fn(async () => {}),
  completeGoogleDriveConnection: jest.fn(),
  deleteJournalEverywhere: jest.fn(),
  disconnectGoogleDrive: () => mockDisconnect(),
  listUnacknowledgedCloudConflicts: jest.fn(async () => []),
  prepareGoogleDriveConnection: () => mockPrepare(),
  reconnectGoogleDrive: () => mockReconnect(),
  resetThisDeviceOnly: jest.fn(),
  retrySyncAttentionReason: (reason: string) => mockRetry(reason),
  revokeCloudVault: (kind: string) => mockRevoke(kind),
  setCloudSyncPaused: (paused: boolean) => mockSetPaused(paused),
  syncNow: () => mockSyncNow(),
  useCloudSyncSnapshot: () => ({ snapshot: mockSnapshot, refresh: mockRefresh }),
  useCloudSyncProgress: () => ({ progress: null, idleWait: null }),
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
jest.mock('./OtherVersionsRow', () => ({ OtherVersionsRow: 'OtherVersionsRow' }));

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
  mockParams = {};
  mockSnapshot.configured = true;
  mockSnapshot.status = 'synced';
  mockSnapshot.attentionReason = null;
  mockSnapshot.recoveryAction = null;
});
const showsText = (text: string) =>
  root.root.findAll((node) => node.props.children === text).length > 0;
afterEach(() => act(() => root?.unmount()));

test('Disconnect shows its progress, ignores repeat presses and confirms what is kept', async () => {
  const pending = deferred<void>();
  mockDisconnect.mockReturnValueOnce(pending.promise);
  await render();
  await confirmDisconnect();

  expect(disconnectRow().props.label).toBe(mockEn['cloud.disconnecting']);
  // Sync stops before the backup is removed; that is not "Up to date".
  expect(showsText(mockEn['cloud.upToDate'])).toBe(false);
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

test('after Resume, Pause and Disconnect stay available while the first pass runs', async () => {
  mockSnapshot.status = 'paused';
  // Resume returns once the runtime restarts; the pass it started keeps running.
  mockSetPaused.mockImplementationOnce(async () => {
    mockSnapshot.status = 'syncing';
  });
  mockSetPaused.mockResolvedValueOnce(undefined);
  mockDisconnect.mockResolvedValueOnce(undefined);
  await render();
  await act(async () => pauseRow().props.onPress());
  expect(mockSetPaused).toHaveBeenLastCalledWith(false);
  expect(mockToast.success).toHaveBeenCalledWith(mockEn['cloud.syncResumed']);

  expect(pauseRow().props.disabled).toBe(false);
  expect(pauseRow().props.accessibilityState.busy).toBe(false);
  expect(disconnectRow().props.disabled).toBe(false);

  await act(async () => pauseRow().props.onPress());
  expect(mockSetPaused).toHaveBeenLastCalledWith(true);
  await confirmDisconnect();
  expect(mockDisconnect).toHaveBeenCalledTimes(1);
  expect(mockToast.error).not.toHaveBeenCalled();
});

test('backing out of the account picker is silent, in setup and in Reconnect', async () => {
  const { CloudAuthError } = jest.requireMock('~/lib/cloudSync/auth') as {
    CloudAuthError: new (code: string) => Error;
  };
  mockSnapshot.configured = false;
  mockSnapshot.status = 'off';
  mockPrepare.mockRejectedValueOnce(new CloudAuthError('cancelled'));
  await render();
  const connect = () =>
    root.root
      .findAll((node) => node.props.children === mockEn['cloud.connectGoogleDrive'])
      .map((text) => text.parent!)
      .find((button) => (button.type as unknown) === 'Button')!;
  act(() => connect().props.onPress());
  await act(async () => connect().props.onPress());
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  expect(showsText(mockEn['cloud.beforeYouConnect'])).toBe(true);

  act(() => root.unmount());
  mockSnapshot.configured = true;
  mockSnapshot.status = 'warning';
  mockSnapshot.attentionReason = 'authorization-required';
  mockSnapshot.recoveryAction = 'reconnect-google-drive';
  mockReconnect.mockRejectedValueOnce(new CloudAuthError('cancelled'));
  await render();
  const reconnect = findHost(
    'Button',
    (props) => props.accessibilityLabel === mockEn['cloud.reconnectGoogleDrive'],
  );
  await act(async () => reconnect.props.onPress());
  expect(mockReconnect).toHaveBeenCalledTimes(1);
  expect(mockToast.error).not.toHaveBeenCalled();

  // Any other failure still says so.
  mockReconnect.mockRejectedValueOnce(new CloudAuthError('network'));
  await act(async () => reconnect.props.onPress());
  expect(mockToast.error).toHaveBeenCalledTimes(1);
});

test('keeps conflicts and other versions reachable after Disconnect', async () => {
  const reachable = () => [
    root.root.findAllByType('ConflictsCard' as never).length,
    root.root.findAllByType('OtherVersionsRow' as never).length,
  ];
  await render();
  expect(reachable()).toEqual([1, 1]);
  act(() => root.unmount());
  // Disconnect keeps the vault, and its open conflicts, with status disabled.
  mockSnapshot.configured = false;
  mockSnapshot.status = 'off';
  await render();
  expect(reachable()).toEqual([1, 1]);
});

/** What each recovery button's handler really does, observed through its mocks. */
function observedRecovery(): string {
  const toastSuccess = (key: keyof typeof mockEn) =>
    (mockToast.success as jest.Mock).mock.calls.some(
      ([message]) => message === mockEn[key],
    );
  if (mockRetry.mock.calls.length > 0) return 'sync-again';
  if (mockReconnect.mock.calls.length > 0) return 'reconnect';
  if (mockDisconnect.mock.calls.length > 0) {
    if (toastSuccess('cloud.chooseAGoogleAccountToReconnect')) return 'set-up-again';
    if (toastSuccess('cloud.googleDriveDisconnectedOnThisDevice')) return 'disconnect';
  }
  if (mockOpenURL.mock.calls.length > 0) return `open ${mockOpenURL.mock.calls[0][0]}`;
  if (mockOpenSettings.mock.calls.length > 0) return 'device-settings';
  if (mockPush.mock.calls.length > 0) return `push ${mockPush.mock.calls[0][0]}`;
  if (mockRevoke.mock.calls.length > 0) return `revoke ${mockRevoke.mock.calls[0][0]}`;
  const dialog = root.root.findByType('AlertDialog' as never);
  return dialog.props.open ? 'confirm-erase' : 'nothing';
}

const EXPECTED_RECOVERY: Record<SyncRecoveryAction, string> = {
  'reconnect-google-drive': 'reconnect',
  'choose-connected-account': 'set-up-again',
  'finish-connection': 'set-up-again',
  'reconnect-correct-backup': 'set-up-again',
  'update-tackbok': 'open https://tackbok.org',
  'retry-verify-backup': 'sync-again',
  'repair-from-verified-backup': 'sync-again',
  'inspect-repair-backup': 'sync-again',
  'consolidate-backups': 'sync-again',
  'export-repair-backup': 'push /settings',
  'free-device-storage': 'device-settings',
  'manage-drive-storage': 'open https://drive.google.com/drive/quota',
  'retry-missing-media': 'sync-again',
  'locate-retry-attachment': 'sync-again',
  'retry-journal-preparation': 'sync-again',
  'acknowledge-disconnect': 'disconnect',
  'review-erase-device': 'confirm-erase',
  'resume-deletion': 'revoke backup-deleted',
  'verify-backup-health': 'sync-again',
};

const t = ((key, params) => mockTranslate('en', key, params)) as TranslationFunction;

test.each(
  Object.entries(ATTENTION_RECOVERY_ACTION) as [
    SyncAttentionReason,
    SyncRecoveryAction,
  ][],
)('the %s recovery button is labelled for what it does (%s)', async (reason, action) => {
  mockSnapshot.status = 'warning';
  mockSnapshot.attentionReason = reason;
  mockSnapshot.recoveryAction = action;
  await render();
  const label = recoveryActionLabel(action, t);
  const buttons = root.root
    .findAllByType('Button' as never)
    .filter((button) => button.props.accessibilityLabel === label);
  expect(buttons).toHaveLength(1);
  await act(async () => buttons[0].props.onPress());
  expect(observedRecovery()).toBe(EXPECTED_RECOVERY[action]);
});

test('merge errors never offer a button that runs the same merge again', () => {
  for (const reason of ['merge-failed', 'derived-id-collision'] as const) {
    expect(EXPECTED_RECOVERY[ATTENTION_RECOVERY_ACTION[reason]]).toBe('push /settings');
  }
});

test('every recovery that runs the same handler shares one label, and no other', () => {
  const byOutcome = new Map<string, Set<string>>();
  for (const [action, outcome] of Object.entries(EXPECTED_RECOVERY)) {
    const labels = byOutcome.get(outcome) ?? new Set<string>();
    labels.add(recoveryActionLabel(action as SyncRecoveryAction, t));
    byOutcome.set(outcome, labels);
  }
  const labels = [...byOutcome.values()].map((set) => [...set]);
  expect(labels.every((set) => set.length === 1)).toBe(true);
  expect(new Set(labels.flat()).size).toBe(labels.length);
});

describe('a backup that exists but cannot be read', () => {
  const connection = (
    availableVaults: { vaultId: string; updatedAt: number }[],
    unreadable: number,
  ) => ({
    accountLabel: 'owner@example.com',
    availableVaults,
    unreadableBackupCount: unreadable,
    localHasData: false,
  });
  async function connectFromSettings() {
    mockSnapshot.configured = false;
    mockSnapshot.status = 'off';
    await render();
    const connect = () =>
      root.root
        .findAll((node) => node.props.children === mockEn['cloud.connectGoogleDrive'])
        .map((text) => text.parent!)
        .find((button) => (button.type as unknown) === 'Button')!;
    act(() => connect().props.onPress());
    await act(async () => connect().props.onPress());
  }

  test('an empty account still says no backup was found', async () => {
    mockPrepare.mockResolvedValueOnce(connection([], 0));
    await connectFromSettings();
    expect(
      showsText(mockEn['cloud.noExistingTackbokBackupWasFoundCreateOneForThis']),
    ).toBe(true);
    expect(showsText(mockEn['cloud.backupFoundButCouldNotBeReadCreateNew'])).toBe(false);
  });

  test('only unreadable backups are not reported as no backup', async () => {
    mockPrepare.mockResolvedValueOnce(connection([], 1));
    await connectFromSettings();
    expect(showsText(mockEn['cloud.backupFoundButCouldNotBeReadCreateNew'])).toBe(true);
    expect(
      showsText(mockEn['cloud.noExistingTackbokBackupWasFoundCreateOneForThis']),
    ).toBe(false);
    expect(showsText(mockEn['cloud.createCloudBackup'])).toBe(true);
  });

  test('readable backups are still offered beside an unreadable one', async () => {
    mockPrepare.mockResolvedValueOnce(
      connection([{ vaultId: 'vault-a', updatedAt: 1 }], 1),
    );
    await connectFromSettings();
    expect(showsText(mockEn['cloud.someBackupsInThisAccountCouldNotBeRead'])).toBe(true);
    expect(showsText(mockEn['cloud.restoreCloudBackup'])).toBe(true);
  });

  test('onboarding explains an unreadable backup instead of saying none exists', async () => {
    mockParams = { origin: 'onboarding' };
    mockSnapshot.configured = false;
    mockSnapshot.status = 'off';
    mockPrepare.mockResolvedValueOnce(connection([], 1));
    await render();
    const disclosure = root.root.findAll(
      (node) => typeof node.props.onContinue === 'function',
    )[0];
    await act(async () => disclosure.props.onContinue());
    expect(mockToast.warning).toHaveBeenCalledWith(
      mockEn['cloud.backupFoundButCouldNotBeRead'],
    );
    expect(mockToast.warning).not.toHaveBeenCalledWith(
      mockEn['cloud.noTackbokBackupFoundInThisGoogleAccount'],
    );
  });
});
