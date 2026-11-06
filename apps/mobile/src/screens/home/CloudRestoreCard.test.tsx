import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { CloudSyncSnapshot } from '~/lib/cloudSync/ui';
import type { CloudRestoreMarker } from '~/lib/settings';
import { CloudRestoreCard } from './CloudRestoreCard';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
}));
jest.mock('lucide-react-native', () => ({
  AlertTriangle: 'AlertTriangle',
  CloudOff: 'CloudOff',
  Wifi: 'Wifi',
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
const mockToastSuccess = jest.fn();
jest.mock('~/components/ui/toast', () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args) },
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
let mockNetwork: { isConnected?: boolean; type?: string } = {
  isConnected: true,
  type: 'WIFI',
};
jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI' },
  useNetworkState: () => mockNetwork,
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn, params?: Record<string, number>) =>
      mockTranslate('en', key, params),
  }),
}));
const mockSettings: {
  cloudRestore: CloudRestoreMarker | null;
  cloudSyncWifiOnlyMedia: boolean;
  setCloudRestore: jest.Mock;
} = {
  cloudRestore: { vaultId: 'vault-a', startedAt: 1 },
  cloudSyncWifiOnlyMedia: false,
  setCloudRestore: jest.fn((restore: CloudRestoreMarker | null) => {
    mockSettings.cloudRestore = restore;
  }),
};
jest.mock('~/lib/settings', () => ({
  useSettingsStore: (select: (state: typeof mockSettings) => unknown) =>
    select(mockSettings),
}));
let mockSnapshot: CloudSyncSnapshot;
jest.mock('~/lib/cloudSync/ui', () => ({
  useCloudSyncSnapshot: () => ({ snapshot: mockSnapshot }),
  deriveCloudRestoreMilestone: jest.requireActual('~/lib/cloudSync/ui/restoreMilestone')
    .deriveCloudRestoreMilestone,
}));

const restoring: CloudSyncSnapshot = {
  configured: true,
  provider: 'google-drive',
  vaultId: 'vault-a',
  status: 'restoring',
  accountLabel: null,
  activityPhase: null,
  initialRestore: true,
  queuedCount: 0,
  pendingDownloadCount: 0,
  downloadedMediaCount: 0,
  failureCategory: null,
  conflictCount: 0,
  lastSuccessAt: null,
  lastVerifiedAt: null,
  revocationKind: null,
  attentionReason: null,
  recoveryAction: null,
};

let root: ReactTestRenderer;
const content = () => JSON.stringify(root.toJSON());
const render = () => {
  act(() => {
    root = create(<CloudRestoreCard />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.cloudRestore = { vaultId: 'vault-a', startedAt: 1 };
  mockSettings.cloudSyncWifiOnlyMedia = false;
  mockNetwork = { isConnected: true, type: 'WIFI' };
  mockSnapshot = restoring;
});
afterEach(() => act(() => root?.unmount()));

test('shows the journal restore with a link to Cloud backup, never asking to stay in the app', () => {
  render();
  expect(content()).toContain(mockEn['cloud.restoringYourJournalFromGoogleDrive']);
  expect(content()).toContain(mockEn['cloud.youCanKeepUsingTackbokWhileItRestores']);
  expect(content()).not.toMatch(/don.t (leave|exit)/i);
  act(() => root.root.findByType('Button' as never).props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/cloud-backup');
});

test('counts downloaded attachments once the journal is ready', () => {
  mockSnapshot = {
    ...restoring,
    status: 'queued',
    initialRestore: false,
    pendingDownloadCount: 263,
    downloadedMediaCount: 37,
  };
  render();
  expect(content()).toContain(
    'Your journal is ready. Downloading photos and voice notes: 37 of 300.',
  );
});

test('says when attachments wait for Wi-Fi or the restore is paused offline', () => {
  mockSnapshot = { ...restoring, initialRestore: false, pendingDownloadCount: 12 };
  mockSettings.cloudSyncWifiOnlyMedia = true;
  mockNetwork = { isConnected: true, type: 'CELLULAR' };
  render();
  expect(content()).toContain('Photos and voice notes waiting for Wi-Fi: 12');
  mockNetwork = { isConnected: false, type: 'NONE' };
  act(() => root.update(<CloudRestoreCard />));
  expect(content()).toContain(
    mockEn['cloud.restorePausedItContinuesWhenTackbokIsOpenAndOnline'],
  );
});

test('keeps a failure visible on the card instead of a success toast', () => {
  mockSnapshot = { ...restoring, failureCategory: 'auth' };
  render();
  expect(content()).toContain(mockEn['cloud.restoreNeedsAttention']);
  expect(content()).toContain(mockEn['cloud.googleDriveNeedsToBeReconnected']);
  expect(mockToastSuccess).not.toHaveBeenCalled();
  expect(mockSettings.setCloudRestore).not.toHaveBeenCalled();
});

test('announces completion once and stops tracking the restore', () => {
  mockSnapshot = {
    ...restoring,
    status: 'synced',
    initialRestore: false,
    downloadedMediaCount: 300,
  };
  render();
  expect(root.toJSON()).toBeNull();
  expect(mockToastSuccess).toHaveBeenCalledTimes(1);
  expect(mockToastSuccess).toHaveBeenCalledWith(mockEn['cloud.restoreComplete']);
  expect(mockSettings.setCloudRestore).toHaveBeenCalledWith(null);
  act(() => root.update(<CloudRestoreCard />));
  expect(mockToastSuccess).toHaveBeenCalledTimes(1);
});

test('shows nothing when no restore is tracked', () => {
  mockSettings.cloudRestore = null;
  render();
  expect(root.toJSON()).toBeNull();
});
