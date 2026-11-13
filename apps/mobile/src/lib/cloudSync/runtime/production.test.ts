import { CloudConnectionChangedError } from './connectionLifecycle';
import { runProductionBackgroundPass } from './production';
import { SyncCancelledError, throwIfCancelled } from '../snapshot/sync/errors';

const vault = { vault_id: 'v1', remote_root_id: 'root', provider_kind: 'google-drive' };

jest.mock('~/db', () => {
  const query = {
    from: () => query,
    where: () => query,
    limit: async () => [vault],
  };
  return { db: { select: () => query }, cloudVault: {} };
});
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  inArray: jest.fn(),
  isNotNull: jest.fn(),
}));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/lib/settings', () => ({ useSettingsStore: { getState: () => ({}) } }));
jest.mock('expo-network', () => ({}));
jest.mock('../auth/secureTokenStore', () => ({
  needsGoogleKeychainMigration: async () => false,
  migrateGoogleKeychainAccessibility: jest.fn(),
}));
jest.mock('./connectionSetup', () => ({
  reconcileAbandonedConnectionSetup: async () => {},
}));
jest.mock('./backgroundExecution', () => ({ beginBackgroundExecution: jest.fn() }));
jest.mock('../storage/backfill', () => ({
  isNormalizedModelReady: async () => true,
  runNormalizedModelBackfill: jest.fn(),
}));
jest.mock('../snapshot/runtime', () => ({
  createProductionSnapshotRuntimeEngine: jest.fn(),
}));

const mockCreateEngine = (
  jest.requireMock('../snapshot/runtime') as {
    createProductionSnapshotRuntimeEngine: jest.Mock;
  }
).createProductionSnapshotRuntimeEngine;
const mockTrack = (jest.requireMock('~/lib/analytics') as { track: jest.Mock }).track;

beforeEach(() => {
  mockCreateEngine.mockReset();
  mockTrack.mockClear();
});

test('the periodic pass hydrates one batch and stops cleanly when its signal aborts', async () => {
  const settled = jest.fn();
  const sync = jest.fn(
    (signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          void Promise.resolve().then(() => {
            settled();
            reject(new SyncCancelledError());
          });
        });
      }),
  );
  mockCreateEngine.mockResolvedValue({ sync });
  const controller = new AbortController();

  const pass = runProductionBackgroundPass(controller.signal);
  await new Promise(setImmediate);
  expect(mockCreateEngine).toHaveBeenCalledWith(
    expect.objectContaining({ hydrationBatchesPerPass: 1 }),
  );
  expect(sync).toHaveBeenCalledWith(controller.signal);

  controller.abort();
  await expect(pass).resolves.toBe(true);
  expect(settled).toHaveBeenCalledTimes(1);
  expect(mockTrack).not.toHaveBeenCalledWith('cloud_sync_failed', expect.anything());
});

test('a pass cancelled during a connection change does not start a second attempt', async () => {
  const controller = new AbortController();
  const sync = jest.fn(async () => {
    controller.abort();
    throw new CloudConnectionChangedError();
  });
  mockCreateEngine.mockResolvedValue({ sync });

  await expect(runProductionBackgroundPass(controller.signal)).resolves.toBe(true);
  expect(mockCreateEngine).toHaveBeenCalledTimes(1);
  expect(mockTrack).not.toHaveBeenCalledWith('cloud_sync_failed', expect.anything());
});

test('an engine built after the deadline never syncs', async () => {
  const controller = new AbortController();
  const sync = jest.fn(async (signal?: AbortSignal) => {
    throwIfCancelled(signal);
    return { pulled: 0, pushed: 0 };
  });
  mockCreateEngine.mockImplementation(async () => {
    controller.abort();
    return { sync };
  });

  await expect(runProductionBackgroundPass(controller.signal)).resolves.toBe(true);
  expect(mockTrack).not.toHaveBeenCalledWith('cloud_sync_succeeded', expect.anything());
});
