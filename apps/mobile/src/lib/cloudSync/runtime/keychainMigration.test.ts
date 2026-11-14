import { cloudConnectionLifecycle } from './connectionLifecycle';
import {
  createProductionRuntimeEngine,
  createProductionSyncRuntime,
  migrateKeychainAccessibility,
} from './production';

const mockCreate = jest.fn(async () => ({
  provider: { kind: 'google-drive' as const },
  sync: async () => ({ pulled: 0, pushed: 0 }),
}));
jest.mock('../snapshot/runtime', () => ({
  createProductionSnapshotRuntimeEngine: () => mockCreate(),
}));
jest.mock('./connectionSetup', () => ({
  reconcileAbandonedConnectionSetup: async () => false,
}));
const mockNeedsMigration = jest.fn(async () => true);
const mockMigrate = jest.fn(async () => {});
jest.mock('../auth/secureTokenStore', () => ({
  needsGoogleKeychainMigration: () => mockNeedsMigration(),
  migrateGoogleKeychainAccessibility: () => mockMigrate(),
}));
jest.mock('~/db', () => {
  const query = {
    from: () => query,
    where: () => query,
    limit: async () => [
      { remote_root_id: 'appDataFolder', provider_kind: 'google-drive', vault_id: 'v' },
    ],
  };
  return { db: { select: () => query }, cloudVault: {} };
});
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  inArray: jest.fn(),
  isNotNull: jest.fn(),
}));
let mockAppStateListener: ((state: string) => void) | null = null;
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mockAppStateListener = listener;
      return { remove: () => (mockAppStateListener = null) };
    },
  },
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: () => ({ remove: () => {} }),
}));
jest.mock('./backgroundExecution', () => ({
  beginBackgroundExecution: async () => null,
}));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/lib/settings', () => ({ useSettingsStore: { getState: () => ({}) } }));
jest.mock('../storage/backfill', () => ({
  isNormalizedModelReady: async () => true,
  runNormalizedModelBackfill: async () => {},
}));
jest.mock('./mutationSignal', () => ({
  addCloudSyncMutationListener: () => ({ remove: () => {} }),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockNeedsMigration.mockReset();
  mockNeedsMigration.mockResolvedValue(true);
  mockMigrate.mockReset();
  mockMigrate.mockResolvedValue(undefined);
  mockCreate.mockClear();
});

test('a pending migration keeps the connection epoch and running passes', async () => {
  // A Retry captures the epoch after its own change, then restarts the runtime.
  const epoch = cloudConnectionLifecycle.epoch;
  let release!: () => void;
  let passSignal: AbortSignal | null = null;
  const pass = cloudConnectionLifecycle.runPass(epoch, async (signal) => {
    passSignal = signal;
    await new Promise<void>((resolve) => (release = resolve));
  });
  await createProductionRuntimeEngine();
  expect(mockMigrate).toHaveBeenCalledTimes(1);
  // No false "cancelled": runManualSyncSince compares exactly this epoch.
  expect(cloudConnectionLifecycle.epoch).toBe(epoch);
  expect(passSignal!.aborted).toBe(false);
  release();
  await pass;
});

test('the migration waits for a connection change in progress', async () => {
  const events: string[] = [];
  let finishChange!: () => void;
  const change = cloudConnectionLifecycle.change(async () => {
    await new Promise<void>((resolve) => (finishChange = resolve));
    events.push('disconnect');
  });
  mockMigrate.mockImplementation(async () => {
    events.push('migrate');
  });
  const migration = migrateKeychainAccessibility();
  await flush();
  expect(events).toEqual([]);
  finishChange();
  await Promise.all([change, migration]);
  expect(events).toEqual(['disconnect', 'migrate']);
});

test('concurrent callers share one attempt and a migrated keychain is left alone', async () => {
  let finish!: () => void;
  mockMigrate.mockImplementation(
    () => new Promise<void>((resolve) => (finish = () => resolve())),
  );
  const first = migrateKeychainAccessibility();
  const second = migrateKeychainAccessibility();
  expect(second).toBe(first);
  await flush();
  finish();
  await first;
  expect(mockMigrate).toHaveBeenCalledTimes(1);

  mockNeedsMigration.mockResolvedValue(false);
  await migrateKeychainAccessibility();
  expect(mockMigrate).toHaveBeenCalledTimes(1);
});

test('a migration that failed while locked is retried when the app comes to the foreground', async () => {
  mockMigrate.mockRejectedValueOnce(new Error('errSecInteractionNotAllowed'));
  const runtime = createProductionSyncRuntime();
  await runtime.start();
  // Engine creation tried once and failed; the failure did not block the engine.
  expect(mockMigrate).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledTimes(1);

  mockAppStateListener!('background');
  await flush();
  expect(mockMigrate).toHaveBeenCalledTimes(1);

  mockAppStateListener!('active');
  await flush();
  expect(mockMigrate).toHaveBeenCalledTimes(2);
  // No new engine: the retry happens without interrupting the running one.
  expect(mockCreate).toHaveBeenCalledTimes(1);

  // Once it succeeded, a later foreground only checks the marker.
  mockNeedsMigration.mockResolvedValue(false);
  mockAppStateListener!('background');
  mockAppStateListener!('active');
  await flush();
  expect(mockMigrate).toHaveBeenCalledTimes(2);
  runtime.stop();
});
