import { runProductionBackgroundPass } from './production';
import { CloudConnectionChangedError } from './connectionLifecycle';

const mockCreate = jest.fn();
jest.mock('../snapshot/runtime', () => ({
  createProductionSnapshotRuntimeEngine: (...args: unknown[]) => mockCreate(...args),
}));
jest.mock('~/db', () => ({
  cloudVault: {},
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
    remote_root_id: 'appDataFolder', provider_kind: 'google-drive', vault_id: 'vault',
  }] }) }) }) },
}));
jest.mock('drizzle-orm', () => ({ and: jest.fn(), inArray: jest.fn(), isNotNull: jest.fn() }));
jest.mock('expo-network', () => ({}));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/lib/settings', () => ({ useSettingsStore: {} }));
jest.mock('../storage/backfill', () => ({ isNormalizedModelReady: async () => true }));
jest.mock('./rolloutPolicy', () => ({ isCloudSyncNetworkAllowed: () => true }));

beforeEach(() => { mockCreate.mockReset(); });

test('a stale background engine is replaced once and the fresh pass can succeed', async () => {
  const stale = jest.fn(async () => { throw new CloudConnectionChangedError(); });
  const fresh = jest.fn(async () => ({ pulled: 0, pushed: 0 }));
  mockCreate.mockResolvedValueOnce({ sync: stale }).mockResolvedValueOnce({ sync: fresh });
  await expect(runProductionBackgroundPass()).resolves.toBe(true);
  expect(stale).toHaveBeenCalledTimes(1);
  expect(fresh).toHaveBeenCalledTimes(1);
});

test('continuing connection changes stay rejected after the bounded retry', async () => {
  mockCreate.mockResolvedValue({ sync: async () => { throw new CloudConnectionChangedError(); } });
  await expect(runProductionBackgroundPass()).resolves.toBe(false);
  expect(mockCreate).toHaveBeenCalledTimes(2);
});

test('ordinary construction failures are reported without retrying', async () => {
  mockCreate.mockRejectedValue(new Error('storage failed'));
  await expect(runProductionBackgroundPass()).resolves.toBe(false);
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
