import { prepareGoogleDriveConnection, completeGoogleDriveConnection, cancelPreparedGoogleDriveConnection } from './production';

const mockEvents: string[] = [];
const mockAuthorize = jest.fn(async () => { mockEvents.push('authorize'); });
const mockSignOut = jest.fn(async () => {});
const mockRestart = jest.fn(async () => { mockEvents.push('restart'); });
const mockStop = jest.fn();
const mockCommit = jest.fn(async (operation: (tx: unknown) => Promise<void>) => {
  await operation(mockDb);
  mockEvents.push('commit');
});
const mockDb = {
  select: () => ({ from: () => ({ limit: async () => [] }) }),
  update: () => ({ set: () => ({ where: async () => { mockEvents.push('disabled'); } }) }),
  delete: async () => {},
  insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
};
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-file-system', () => ({}));
jest.mock('~/db', () => ({
  db: {
    select: () => mockDb.select(), update: () => mockDb.update(),
    delete: () => mockDb.delete(), insert: () => mockDb.insert(),
  }, sqlite: {}, cloudVault: { status: 'status' }, cloudSyncState: {}, syncProviderState: {},
  entries: {}, tags: {}, customPrompts: {},
  runExclusiveDbTransaction: (...args: unknown[]) => mockCommit(...args as [never]),
}));
jest.mock('drizzle-orm', () => ({ inArray: jest.fn(), sql: jest.fn() }));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/db/queries', () => ({}));
jest.mock('~/lib/photoUtils', () => ({}));
jest.mock('~/lib/voiceMemoUtils', () => ({}));
jest.mock('../auth', () => ({ createGoogleAuthorization: () => ({
  authorize: mockAuthorize, signOut: mockSignOut, getAccountLabel: async () => 'owner@example.com',
}) }));
jest.mock('../auth/secureTokenStore', () => ({ readOrCreateGoogleConnectionId: async () => 'epoch' }));
jest.mock('../snapshot/drive', () => ({
  SQLiteDriveProviderStateStore: jest.fn(),
  GoogleDriveSnapshotProvider: jest.fn(() => ({ listAvailableVaults: async () => [] })),
}));
jest.mock('../snapshot/sync', () => ({}));
jest.mock('../runtime/production', () => ({
  restartProductionSyncRuntime: () => mockRestart(), stopProductionSyncRuntime: () => mockStop(),
  notifyProductionCloudSyncChanged: jest.fn(),
}));
jest.mock('../runtime/backgroundTask', () => ({ setCloudSyncBackgroundTaskEnabled: jest.fn(async () => {}) }));
jest.mock('../storage/repositories', () => ({}));

beforeEach(async () => {
  await cancelPreparedGoogleDriveConnection();
  mockEvents.length = 0;
  jest.clearAllMocks();
});
afterEach(async () => { await cancelPreparedGoogleDriveConnection(); });

test('setup disables the old attachment before authorization and restarts only after commit', async () => {
  await prepareGoogleDriveConnection();
  expect(mockEvents).toEqual(['disabled', 'authorize']);
  expect(mockRestart).not.toHaveBeenCalled();
  await completeGoogleDriveConnection({ origin: 'settings', createNew: true });
  expect(mockEvents).toEqual(['disabled', 'authorize', 'commit', 'restart']);
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

test('failed authorization and failed vault selection never restart the runtime', async () => {
  mockAuthorize.mockRejectedValueOnce(new Error('cancelled'));
  await expect(prepareGoogleDriveConnection()).rejects.toThrow('cancelled');
  expect(mockRestart).not.toHaveBeenCalled();
  await prepareGoogleDriveConnection();
  await expect(completeGoogleDriveConnection({ origin: 'settings' })).rejects.toThrow('Choose a cloud backup');
  expect(mockRestart).not.toHaveBeenCalled();
});
