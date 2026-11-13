import { CloudSyncActionError, retrySyncAttentionReason, syncNow } from './production';
import { cloudConnectionLifecycle as mockLifecycle } from '../runtime/connectionLifecycle';
import { SyncCancelledError } from '../snapshot/sync/errors';

const mockManualSync = jest.fn<Promise<boolean>, []>();
const mockFailureCategory = jest.fn<string | null, []>(() => null);
const mockRestart = jest.fn(async () => {});
const mockSelectVault = jest.fn(async () => [{ vault_id: 'vault', device_id: 'device' }]);
const mockUpdateVault = jest.fn(async () => {});

// A connection change, such as Pause, starting at this point.
const changeConnection = () => mockLifecycle.change(async () => undefined);

jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-file-system', () => ({}));
jest.mock('~/db', () => ({
  cloudVault: { vault_id: 'vault_id' },
  db: {
    select: () => ({ from: () => ({ limit: () => mockSelectVault() }) }),
    update: () => ({ set: () => ({ where: () => mockUpdateVault() }) }),
  },
}));
jest.mock('drizzle-orm', () => ({ eq: jest.fn() }));
jest.mock('~/db/queries', () => ({}));
jest.mock('~/lib/photoUtils', () => ({}));
jest.mock('~/lib/voiceMemoUtils', () => ({}));
jest.mock('../auth', () => ({}));
jest.mock('../auth/secureTokenStore', () => ({
  readGoogleSetupGuard: async () => null,
}));
jest.mock('../snapshot/storage', () => ({ clearMediaHashes: async () => {} }));
jest.mock('../snapshot/drive', () => ({}));
jest.mock('../snapshot/sync', () => ({
  SQLiteSyncStateStore: class {
    clearPause() {}
  },
}));
jest.mock('../runtime/production', () => ({
  restartProductionSyncRuntime: () => mockRestart(),
  runProductionManualSync: () => mockManualSync(),
  getProductionCloudSyncFailureCategory: () => mockFailureCategory(),
}));
jest.mock('../runtime/backgroundTask', () => ({}));
jest.mock('../storage/repositories', () => ({}));
jest.mock('~/lib/settings', () => ({ useSettingsStore: { getState: () => ({}) } }));

beforeEach(() => jest.clearAllMocks());

test('a pass stopped by a connection change is reported as cancelled, not failed', async () => {
  mockManualSync.mockImplementationOnce(async () => {
    // Pause or Disconnect starts while the manual pass is running.
    await changeConnection();
    return false;
  });
  await expect(syncNow()).rejects.toBeInstanceOf(SyncCancelledError);
});

test('a failed pass without a connection change keeps its failure category', async () => {
  mockManualSync.mockResolvedValueOnce(false);
  mockFailureCategory.mockReturnValueOnce('offline');
  const failure = syncNow();
  await expect(failure).rejects.toBeInstanceOf(CloudSyncActionError);
  await expect(failure).rejects.toMatchObject({ category: 'offline' });
});

test('a genuine failure that overlaps a connection change still reports the failure', async () => {
  mockManualSync.mockImplementationOnce(async () => {
    await changeConnection();
    return false;
  });
  mockFailureCategory.mockReturnValueOnce('provider');
  const failure = syncNow();
  await expect(failure).rejects.toBeInstanceOf(CloudSyncActionError);
  await expect(failure).rejects.toMatchObject({ category: 'provider' });
});

test('a completed pass resolves', async () => {
  mockManualSync.mockResolvedValueOnce(true);
  await expect(syncNow()).resolves.toBe(true);
});

describe('retrySyncAttentionReason', () => {
  const retry = () => retrySyncAttentionReason('missing-media');

  test('runs a manual pass after restarting the runtime', async () => {
    mockManualSync.mockResolvedValueOnce(true);
    await expect(retry()).resolves.toBeUndefined();
    expect(mockUpdateVault).toHaveBeenCalledTimes(1);
    expect(mockRestart).toHaveBeenCalledTimes(1);
    expect(mockManualSync).toHaveBeenCalledTimes(1);
  });

  test('Pause during the runtime restart cancels the whole retry', async () => {
    mockRestart.mockImplementationOnce(changeConnection);
    await expect(retry()).rejects.toBeInstanceOf(SyncCancelledError);
    expect(mockManualSync).not.toHaveBeenCalled();
  });

  test('Pause during the retry pass reports cancellation', async () => {
    mockManualSync.mockImplementationOnce(async () => {
      await changeConnection();
      return false;
    });
    await expect(retry()).rejects.toBeInstanceOf(SyncCancelledError);
  });

  test('Pause requested while the retry checks the vault writes after it and cancels it', async () => {
    const order: string[] = [];
    let pausing!: Promise<void>;
    mockSelectVault.mockImplementationOnce(async () => {
      pausing = mockLifecycle.change(async () => {
        order.push('pause');
      });
      return [{ vault_id: 'vault', device_id: 'device' }];
    });
    mockUpdateVault.mockImplementationOnce(async () => {
      order.push('retry');
    });
    await expect(retry()).rejects.toBeInstanceOf(SyncCancelledError);
    await pausing;
    // Pause's status write lands last, so the vault stays paused.
    expect(order).toEqual(['retry', 'pause']);
    expect(mockRestart).not.toHaveBeenCalled();
  });
});
