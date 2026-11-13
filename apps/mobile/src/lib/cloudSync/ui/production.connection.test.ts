import { deriveCloudRestoreMilestone } from './restoreMilestone';
import {
  prepareGoogleDriveConnection,
  completeGoogleDriveConnection,
  cancelPreparedGoogleDriveConnection,
  loadCloudSyncSnapshot,
  setCloudSyncPaused,
} from './production';

const mockEvents: string[] = [];
const mockAuthorize = jest.fn(async () => {
  mockEvents.push('authorize');
});
const mockSignOut = jest.fn(async () => {});
const mockRestart = jest.fn(async () => {
  mockEvents.push('restart');
});
let mockVaults: { vaultId: string; updatedAt: number }[] = [];
const mockSettings: {
  setCloudRestore: jest.Mock;
  setHasCompletedOnboarding: jest.Mock;
  cloudRestore?: { vaultId: string; startedAt: number; journalRestoredAt?: number };
} = {
  setCloudRestore: jest.fn(),
  setHasCompletedOnboarding: jest.fn(),
};
const mockStop = jest.fn();
const mockSetBackground = jest.fn(async (_enabled: boolean) => {});
const mockCommit = jest.fn(async (operation: (tx: unknown) => Promise<void>) => {
  await operation(mockDb);
  mockEvents.push('commit');
});
/** Results for the next selects, in order; an unqueued select finds nothing. */
const mockRows: unknown[][] = [];
/** Every vault status written, in order. */
const mockStatuses: string[] = [];
function mockQuery() {
  const next = () => Promise.resolve(mockRows.shift() ?? []);
  const query = {
    from: () => query,
    where: () => query,
    limit: next,
    then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      next().then(resolve, reject),
  };
  return query;
}
const mockDb = {
  select: () => mockQuery(),
  update: () => ({
    set: (values: { status?: string }) => {
      if (values.status) mockStatuses.push(values.status);
      return {
        where: async () => {
          mockEvents.push(
            values.status === 'disabled' ? 'disabled' : `status:${values.status}`,
          );
        },
      };
    },
  }),
  delete: async () => {},
  insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
};
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-file-system', () => ({}));
jest.mock('~/db', () => ({
  db: {
    select: () => mockDb.select(),
    update: () => mockDb.update(),
    delete: () => mockDb.delete(),
    insert: () => mockDb.insert(),
  },
  sqlite: {},
  cloudVault: { status: 'status' },
  cloudSyncState: {},
  cloudConflicts: {},
  mediaAssets: {},
  syncProviderState: {},
  entries: {},
  tags: {},
  customPrompts: {},
  runExclusiveDbTransaction: (...args: unknown[]) => mockCommit(...(args as [never])),
}));
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  count: jest.fn(),
  eq: jest.fn(),
  inArray: jest.fn(),
  isNull: jest.fn(),
  sql: jest.fn(),
}));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/db/queries', () => ({}));
jest.mock('~/lib/photoUtils', () => ({}));
jest.mock('~/lib/voiceMemoUtils', () => ({}));
jest.mock('../auth', () => ({
  createGoogleAuthorization: () => ({
    authorize: mockAuthorize,
    signOut: mockSignOut,
    getAccountLabel: async () => 'owner@example.com',
  }),
}));
jest.mock('../auth/secureTokenStore', () => ({
  readOrCreateGoogleConnectionId: async () => 'epoch',
  captureGoogleCredentials: async () => ({ values: ['previous'] }),
  // Like the real helper: sign out, then put the captured credentials back.
  restoreGoogleCredentials: async (_snapshot: unknown, signOut: () => Promise<void>) => {
    await signOut();
    mockEvents.push('credentials-restored');
  },
  readGoogleSetupGuard: async () => null,
  writeGoogleSetupGuard: async () => {},
  clearGoogleSetupGuard: async () => {},
}));
jest.mock('../snapshot/storage', () => ({
  clearMediaHashes: async () => {},
  forgetMediaHashes: () => {},
}));
jest.mock('../snapshot/drive', () => ({
  SQLiteDriveProviderStateStore: jest.fn(),
  GoogleDriveSnapshotProvider: jest.fn(() => ({
    listAvailableVaults: async () => mockVaults,
  })),
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: { getState: () => mockSettings },
}));
jest.mock('../snapshot/sync', () => ({ deletionAttentionReason: () => null }));
jest.mock('../runtime/production', () => ({
  restartProductionSyncRuntime: () => mockRestart(),
  stopProductionSyncRuntime: () => mockStop(),
  notifyProductionCloudSyncChanged: jest.fn(),
  getProductionCloudSyncActivity: () => 'idle',
  getProductionCloudSyncFailureCategory: () => 'offline',
}));
jest.mock('../runtime/backgroundTask', () => ({
  setCloudSyncBackgroundTaskEnabled: (enabled: boolean) => mockSetBackground(enabled),
}));
jest.mock('../storage/repositories', () => ({}));

beforeEach(async () => {
  await cancelPreparedGoogleDriveConnection();
  delete mockSettings.cloudRestore;
  mockVaults = [];
  mockRows.length = 0;
  mockStatuses.length = 0;
  mockEvents.length = 0;
  jest.clearAllMocks();
});
afterEach(async () => {
  await cancelPreparedGoogleDriveConnection();
});

test('setup disables the old attachment before authorization and restarts only after commit', async () => {
  const connection = await prepareGoogleDriveConnection();
  expect(mockEvents).toEqual(['disabled', 'authorize']);
  expect(mockRestart).not.toHaveBeenCalled();
  await completeGoogleDriveConnection({
    origin: 'settings',
    connection,
    createNew: true,
  });
  expect(mockEvents).toEqual(['disabled', 'authorize', 'commit', 'restart']);
  expect(mockSettings.setCloudRestore).toHaveBeenCalledWith(null);
  expect(mockSettings.setHasCompletedOnboarding).not.toHaveBeenCalled();
  const stops = mockStop.mock.calls.length;
  await cancelPreparedGoogleDriveConnection();
  expect(mockStop).toHaveBeenCalledTimes(stops);
});

test('backing out of the backup picker puts the running restore back and resumes it', async () => {
  // The backup this device was restoring when setup started.
  mockRows.push([{ vaultId: 'vault-old', status: 'restoring' }]);
  await prepareGoogleDriveConnection();
  expect(mockEvents).toEqual(['disabled', 'authorize']);
  await cancelPreparedGoogleDriveConnection();
  expect(mockEvents).toEqual([
    'disabled',
    'authorize',
    'credentials-restored',
    'status:restoring',
    'restart',
  ]);
  expect(mockStatuses).toEqual(['disabled', 'restoring']);
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockSetBackground).toHaveBeenLastCalledWith(true);
});

test('backing out with no previous backup signs out and leaves background sync off', async () => {
  await prepareGoogleDriveConnection();
  await cancelPreparedGoogleDriveConnection();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockStatuses).toEqual(['disabled']);
  expect(mockSetBackground).not.toHaveBeenCalledWith(true);
});

test('a failure while staging after the old backup was disabled puts it back', async () => {
  mockRows.push([{ vaultId: 'vault-old', status: 'idle' }]);
  mockSetBackground.mockRejectedValueOnce(new Error('unregister failed'));
  await expect(prepareGoogleDriveConnection()).rejects.toThrow('unregister failed');
  expect(mockStatuses).toEqual(['disabled', 'idle']);
  expect(mockEvents).toContain('credentials-restored');
  expect(mockRestart).toHaveBeenCalled();
});

test('a cancelled sign-in keeps the current backup, its credentials and its restore', async () => {
  mockAuthorize.mockRejectedValueOnce(new Error('cancelled'));
  await expect(prepareGoogleDriveConnection()).rejects.toThrow('cancelled');
  expect(mockEvents).toEqual(['disabled', 'credentials-restored', 'restart']);
  // Nothing is staged, so screen cleanup must not stop the resumed runtime.
  const stops = mockStop.mock.calls.length;
  await cancelPreparedGoogleDriveConnection();
  expect(mockStop).toHaveBeenCalledTimes(stops);
});

test('failed vault selection never restarts the runtime', async () => {
  const connection = await prepareGoogleDriveConnection();
  await expect(
    completeGoogleDriveConnection({ origin: 'settings', connection }),
  ).rejects.toThrow('Choose a cloud backup');
  expect(mockRestart).not.toHaveBeenCalled();
});

test('committing a restore returns without waiting for the restore to finish', async () => {
  mockVaults = [{ vaultId: 'vault-a', updatedAt: 1 }];
  const connection = await prepareGoogleDriveConnection();
  // The runtime's first pass is the whole restore; it never settles here.
  mockRestart.mockImplementationOnce(() => {
    mockEvents.push('restart');
    return new Promise<void>(() => undefined);
  });
  await completeGoogleDriveConnection({
    origin: 'settings',
    connection,
    vaultId: 'vault-a',
  });
  expect(mockEvents).toEqual(['disabled', 'authorize', 'commit', 'restart']);
  expect(mockSettings.setCloudRestore).toHaveBeenCalledWith({
    vaultId: 'vault-a',
    startedAt: expect.any(Number),
  });
});

test('an onboarding restore completes onboarding at commit, without the setup screen', async () => {
  mockVaults = [{ vaultId: 'vault-a', updatedAt: 1 }];
  const connection = await prepareGoogleDriveConnection();
  // The setup screen may already be unmounted; nothing here depends on it.
  const commit = completeGoogleDriveConnection({
    origin: 'onboarding',
    connection,
    vaultId: 'vault-a',
  });
  expect(mockSettings.setHasCompletedOnboarding).not.toHaveBeenCalled();
  await commit;
  expect(mockSettings.setHasCompletedOnboarding).toHaveBeenCalledWith(true);
  expect(mockSettings.setCloudRestore).toHaveBeenCalledWith({
    vaultId: 'vault-a',
    startedAt: expect.any(Number),
  });
});

test('a failed commit never completes onboarding or records a restore', async () => {
  mockVaults = [{ vaultId: 'vault-a', updatedAt: 1 }];
  const connection = await prepareGoogleDriveConnection();
  mockCommit.mockRejectedValueOnce(new Error('commit failed'));
  await expect(
    completeGoogleDriveConnection({
      origin: 'onboarding',
      connection,
      vaultId: 'vault-a',
    }),
  ).rejects.toThrow('commit failed');
  expect(mockSettings.setHasCompletedOnboarding).not.toHaveBeenCalled();
  expect(mockSettings.setCloudRestore).not.toHaveBeenCalled();
  expect(mockRestart).not.toHaveBeenCalled();
});

test('a background registration failure after commit still restarts the restore', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockVaults = [{ vaultId: 'vault-a', updatedAt: 1 }];
  const connection = await prepareGoogleDriveConnection();
  mockSetBackground.mockRejectedValueOnce(new Error('background registration failed'));
  await completeGoogleDriveConnection({
    origin: 'onboarding',
    connection,
    vaultId: 'vault-a',
  });
  expect(mockSettings.setHasCompletedOnboarding).toHaveBeenCalledWith(true);
  expect(mockEvents).toEqual(['disabled', 'authorize', 'commit', 'restart']);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test('pausing and resuming before the journal arrives never completes the restore', async () => {
  mockVaults = [{ vaultId: 'vault-a', updatedAt: 1 }];
  const connection = await prepareGoogleDriveConnection();
  await completeGoogleDriveConnection({
    origin: 'onboarding',
    connection,
    vaultId: 'vault-a',
  });
  const marker = mockSettings.setCloudRestore.mock.calls.at(-1)?.[0];
  const vault = {
    vault_id: 'vault-a',
    device_id: 'device',
    remote_root_id: 'appDataFolder',
    provider_kind: 'google-drive',
    status: 'restoring',
  };
  mockRows.push([vault]);
  await setCloudSyncPaused(true);
  mockRows.push([{ ...vault, status: 'paused' }], [{ value: 0 }]);
  await setCloudSyncPaused(false);
  expect(mockStatuses.slice(-2)).toEqual(['paused', 'idle']);
  // Vault, queue, sync state, conflicts, provider state, pending media, downloaded media.
  mockRows.push(
    [{ ...vault, status: 'idle' }],
    [{ value: 0, settled: 0 }],
    [],
    [{ value: 0 }],
    [],
    [{ value: 0 }],
    [{ value: 0 }],
  );
  const snapshot = await loadCloudSyncSnapshot();
  expect(snapshot.initialRestore).toBe(false);
  // Neither Pause nor Resume records that the journal was applied.
  expect(mockSettings.setCloudRestore).toHaveBeenCalledTimes(1);
  expect(
    deriveCloudRestoreMilestone(
      marker,
      snapshot,
      { online: false, onWifi: false },
      false,
    ),
  ).toEqual({ stage: 'paused', reason: 'offline' });
  expect(
    deriveCloudRestoreMilestone(marker, snapshot, { online: true, onWifi: true }, false),
  ).not.toEqual({ stage: 'complete' });
});

test('a snapshot only vouches for a journal proof it saw before reading counts', async () => {
  const vault = {
    vault_id: 'vault-a',
    device_id: 'device',
    remote_root_id: 'appDataFolder',
    provider_kind: 'google-drive',
    status: 'restoring',
  };
  const marker = { vaultId: 'vault-a', startedAt: 1 };
  mockSettings.cloudRestore = marker;
  // The journal and its proof land while this snapshot is reading.
  const select = jest.spyOn(mockDb, 'select').mockImplementationOnce(() => {
    mockSettings.cloudRestore = { ...marker, journalRestoredAt: 2 };
    return mockQuery();
  });
  // Vault, queue, sync state, conflicts, provider state, pending media, downloaded media.
  mockRows.push(
    [vault],
    [{ value: 0, settled: 0 }],
    [],
    [{ value: 0 }],
    [],
    [{ value: 0 }],
  );
  const stale = await loadCloudSyncSnapshot();
  expect(stale.restoreProofAtLoad).toBeNull();
  expect(
    deriveCloudRestoreMilestone(
      mockSettings.cloudRestore,
      stale,
      { online: true, onWifi: true },
      false,
    ),
  ).toEqual({ stage: 'journal' });
  select.mockRestore();
  // Vault, queue, sync state, conflicts, provider state, pending media, downloaded media.
  mockRows.push(
    [vault],
    [{ value: 0, settled: 0 }],
    [],
    [{ value: 0 }],
    [],
    [{ value: 0 }],
  );
  const fresh = await loadCloudSyncSnapshot();
  expect(fresh.restoreProofAtLoad).toBe(2);
});
