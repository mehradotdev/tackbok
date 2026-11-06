import {
  prepareGoogleDriveConnection,
  completeGoogleDriveConnection,
  cancelPreparedGoogleDriveConnection,
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
const mockSettings = {
  setCloudRestore: jest.fn(),
  setHasCompletedOnboarding: jest.fn(),
};
const mockStop = jest.fn();
const mockCommit = jest.fn(async (operation: (tx: unknown) => Promise<void>) => {
  await operation(mockDb);
  mockEvents.push('commit');
});
const mockDb = {
  select: () => ({ from: () => ({ limit: async () => [] }) }),
  update: () => ({
    set: () => ({
      where: async () => {
        mockEvents.push('disabled');
      },
    }),
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
  syncProviderState: {},
  entries: {},
  tags: {},
  customPrompts: {},
  runExclusiveDbTransaction: (...args: unknown[]) => mockCommit(...(args as [never])),
}));
jest.mock('drizzle-orm', () => ({ inArray: jest.fn(), sql: jest.fn() }));
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
  // Like the real helper: sign out, put the previous credentials back, rethrow.
  withGoogleCredentialRollback: async (
    operation: () => Promise<unknown>,
    signOut: () => Promise<void>,
  ) => {
    try {
      return await operation();
    } catch (error) {
      await signOut();
      mockEvents.push('credentials-restored');
      throw error;
    }
  },
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
jest.mock('../snapshot/sync', () => ({}));
jest.mock('../runtime/production', () => ({
  restartProductionSyncRuntime: () => mockRestart(),
  stopProductionSyncRuntime: () => mockStop(),
  notifyProductionCloudSyncChanged: jest.fn(),
}));
jest.mock('../runtime/backgroundTask', () => ({
  setCloudSyncBackgroundTaskEnabled: jest.fn(async () => {}),
}));
jest.mock('../storage/repositories', () => ({}));

beforeEach(async () => {
  await cancelPreparedGoogleDriveConnection();
  mockVaults = [];
  mockEvents.length = 0;
  jest.clearAllMocks();
});
afterEach(async () => {
  await cancelPreparedGoogleDriveConnection();
});

test('setup disables the old attachment after authorization and restarts only after commit', async () => {
  await prepareGoogleDriveConnection();
  expect(mockEvents).toEqual(['authorize', 'disabled']);
  expect(mockRestart).not.toHaveBeenCalled();
  await completeGoogleDriveConnection({ origin: 'settings', createNew: true });
  expect(mockEvents).toEqual(['authorize', 'disabled', 'commit', 'restart']);
  expect(mockSettings.setCloudRestore).toHaveBeenCalledWith(null);
  expect(mockSettings.setHasCompletedOnboarding).not.toHaveBeenCalled();
  const stops = mockStop.mock.calls.length;
  await cancelPreparedGoogleDriveConnection();
  expect(mockStop).toHaveBeenCalledTimes(stops);
});

test('cancelling a prepared account signs out without restarting', async () => {
  await prepareGoogleDriveConnection();
  await cancelPreparedGoogleDriveConnection();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockRestart).not.toHaveBeenCalled();
});

test('a cancelled sign-in keeps the current backup, its credentials and its restore', async () => {
  mockAuthorize.mockRejectedValueOnce(new Error('cancelled'));
  await expect(prepareGoogleDriveConnection()).rejects.toThrow('cancelled');
  expect(mockEvents).toEqual(['credentials-restored', 'restart']);
  expect(mockEvents).not.toContain('disabled');
  // Nothing is staged, so screen cleanup must not stop the resumed runtime.
  const stops = mockStop.mock.calls.length;
  await cancelPreparedGoogleDriveConnection();
  expect(mockStop).toHaveBeenCalledTimes(stops);
});

test('failed vault selection never restarts the runtime', async () => {
  await prepareGoogleDriveConnection();
  await expect(completeGoogleDriveConnection({ origin: 'settings' })).rejects.toThrow(
    'Choose a cloud backup',
  );
  expect(mockRestart).not.toHaveBeenCalled();
});

test('committing a restore returns without waiting for the restore to finish', async () => {
  mockVaults = [{ vaultId: 'vault-a', updatedAt: 1 }];
  await prepareGoogleDriveConnection();
  // The runtime's first pass is the whole restore; it never settles here.
  mockRestart.mockImplementationOnce(() => {
    mockEvents.push('restart');
    return new Promise<void>(() => undefined);
  });
  await completeGoogleDriveConnection({ origin: 'settings', vaultId: 'vault-a' });
  expect(mockEvents).toEqual(['authorize', 'disabled', 'commit', 'restart']);
  expect(mockSettings.setCloudRestore).toHaveBeenCalledWith({
    vaultId: 'vault-a',
    startedAt: expect.any(Number),
  });
});

test('an onboarding restore completes onboarding at commit, without the setup screen', async () => {
  mockVaults = [{ vaultId: 'vault-a', updatedAt: 1 }];
  await prepareGoogleDriveConnection();
  // The setup screen may already be unmounted; nothing here depends on it.
  const commit = completeGoogleDriveConnection({
    origin: 'onboarding',
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
