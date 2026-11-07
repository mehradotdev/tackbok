/**
 * Connection setup across Disconnect and process death. SecureStore and the
 * vault table are stateful fakes that survive `jest.resetModules()`, which
 * stands in for the app dying: module memory (the picker's rollback) is lost.
 */
type Production = typeof import('./production');
type ConnectionSetup = typeof import('../runtime/connectionSetup');

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const GUARD_KEY = 'tackbok.cloud-sync.google.setup-guard.v1';

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
const mockSecure = new Map<string, string>();
let mockVaultRows: Row[] = [];
/** Where the next step of setup "dies": its promise never settles. */
let mockDieAt: 'authorize' | 'list' | 'commit' | 'restore-status' | null = null;
const never = () => new Promise<never>(() => undefined);
const mockSignOut = jest.fn(async () => {
  mockSecure.delete(TOKEN_KEY);
});
const mockRestart = jest.fn(async () => {});
const mockSettings = {
  setCloudRestore: jest.fn(),
  setHasCompletedOnboarding: jest.fn(),
};

const mockCloudVault = {
  vault_id: 'vault_id',
  status: 'status',
  device_id: 'device_id',
};

function mockSelect(fields?: Record<string, string>) {
  let table: unknown;
  let where: Predicate = () => true;
  const rows = () =>
    table === mockCloudVault
      ? mockVaultRows
          .filter(where)
          .map((row) =>
            fields
              ? Object.fromEntries(
                  Object.entries(fields).map(([key, column]) => [key, row[column]]),
                )
              : { ...row },
          )
      : [];
  const query = {
    from: (from: unknown) => {
      table = from;
      return query;
    },
    where: (predicate: Predicate) => {
      where = predicate;
      return query;
    },
    limit: async (count: number) => rows().slice(0, count),
    then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(rows()).then(resolve, reject),
  };
  return query;
}
const mockDb = {
  select: (fields?: Record<string, string>) => mockSelect(fields),
  update: (table: unknown) => ({
    set: (values: Row) => {
      const apply = async (where: Predicate = () => true) => {
        if (table !== mockCloudVault) return;
        if (mockDieAt === 'restore-status' && values.status !== 'disabled')
          return never();
        mockVaultRows = mockVaultRows.map((row) =>
          where(row) ? { ...row, ...values } : row,
        );
      };
      return {
        where: (predicate: Predicate) => apply(predicate),
        then: (resolve: () => unknown, reject: (error: unknown) => unknown) =>
          apply().then(resolve, reject),
      };
    },
  }),
  delete: (table: unknown) => ({
    then: (resolve: () => unknown) => {
      if (table === mockCloudVault) mockVaultRows = [];
      return Promise.resolve().then(resolve);
    },
  }),
  insert: (table: unknown) => ({
    values: (row: Row) => ({
      onConflictDoUpdate: async () => {},
      then: (resolve: () => unknown) => {
        if (table === mockCloudVault) mockVaultRows.push(row);
        return Promise.resolve().then(resolve);
      },
    }),
  }),
};

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked',
  getItemAsync: async (key: string) => mockSecure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecure.delete(key);
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-file-system', () => ({}));
jest.mock('~/db', () => ({
  db: mockDb,
  sqlite: {},
  cloudVault: mockCloudVault,
  cloudSyncState: {},
  cloudConflicts: {},
  mediaAssets: {},
  syncProviderState: {},
  entries: {},
  tags: {},
  customPrompts: {},
  runExclusiveDbTransaction: async (operation: (tx: typeof mockDb) => Promise<void>) => {
    if (mockDieAt === 'commit') {
      // The commit is durable; the app dies before setup is told.
      await operation(mockDb);
      return never();
    }
    await operation(mockDb);
  },
}));
jest.mock('drizzle-orm', () => ({
  and:
    (...predicates: Predicate[]) =>
    (row: Row) =>
      predicates.every((predicate) => predicate(row)),
  eq: (column: string, value: unknown) => (row: Row) => row[column] === value,
  inArray: (column: string, values: unknown[]) => (row: Row) =>
    values.includes(row[column]),
  count: jest.fn(),
  isNull: jest.fn(),
  sql: jest.fn(),
}));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/db/queries', () => ({}));
jest.mock('~/lib/photoUtils', () => ({}));
jest.mock('~/lib/voiceMemoUtils', () => ({}));
jest.mock('../auth', () => ({
  createGoogleAuthorization: () => ({
    authorize: async () => {
      // Like the real implementations: the chosen account is stored at once.
      mockSecure.set(TOKEN_KEY, 'new-account-token');
      if (mockDieAt === 'authorize') return never();
    },
    signOut: mockSignOut,
    getAccountLabel: async () => 'new@example.com',
  }),
}));
jest.mock('../snapshot/drive', () => ({
  SQLiteDriveProviderStateStore: jest.fn(),
  GoogleDriveSnapshotProvider: jest.fn(() => ({
    listAvailableVaults: async () =>
      mockDieAt === 'list' ? never() : [{ vaultId: 'vault-new', updatedAt: 1 }],
  })),
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: { getState: () => mockSettings },
}));
jest.mock('../snapshot/sync', () => ({ deletionAttentionReason: () => null }));
jest.mock('../runtime/production', () => ({
  restartProductionSyncRuntime: () => mockRestart(),
  stopProductionSyncRuntime: jest.fn(),
  notifyProductionCloudSyncChanged: jest.fn(),
  getProductionCloudSyncActivity: () => 'idle',
  getProductionCloudSyncFailureCategory: () => null,
}));
jest.mock('../runtime/backgroundTask', () => ({
  setCloudSyncBackgroundTaskEnabled: async () => {},
}));
jest.mock('../storage/repositories', () => ({}));

let production: Production;
let setup: ConnectionSetup;
function launch() {
  jest.resetModules();
  production = jest.requireActual<Production>('./production');
  setup = jest.requireActual<ConnectionSetup>('../runtime/connectionSetup');
}
/** Starts setup and lets it run until the step that dies never settles. */
async function startSetupAndDie() {
  void production.prepareGoogleDriveConnection().catch(() => undefined);
  for (let tick = 0; tick < 50; tick++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
const status = () => mockVaultRows.map((row) => row.status);

beforeEach(() => {
  mockSecure.clear();
  mockSecure.set(TOKEN_KEY, 'old-account-token');
  mockVaultRows = [{ vault_id: 'vault-old', device_id: 'device', status: 'restoring' }];
  mockDieAt = null;
  jest.clearAllMocks();
  launch();
});

test('Disconnect discards a pending setup, so cancelling the picker cannot undo it', async () => {
  await production.prepareGoogleDriveConnection();
  await production.disconnectGoogleDrive();
  mockRestart.mockClear();
  await production.cancelPreparedGoogleDriveConnection();
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  expect(status()).toEqual(['disabled']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
  expect(mockRestart).not.toHaveBeenCalled();
  await expect(
    production.completeGoogleDriveConnection({
      origin: 'settings',
      vaultId: 'vault-new',
    }),
  ).rejects.toThrow('no longer active');
  // Nor does a launch after a crash put the disconnected backup back.
  launch();
  await setup.reconcileAbandonedConnectionSetup();
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  expect(status()).toEqual(['disabled']);
});

test('a Disconnect queued behind setup also discards its rollback', async () => {
  const preparing = production.prepareGoogleDriveConnection();
  const disconnecting = production.disconnectGoogleDrive();
  await preparing;
  await disconnecting;
  await production.cancelPreparedGoogleDriveConnection();
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  expect(status()).toEqual(['disabled']);
});

test('reset discards a pending setup as well', async () => {
  await production.prepareGoogleDriveConnection();
  // The wipe itself is out of scope here; discarding must happen before it.
  await production.resetThisDeviceOnly().catch(() => undefined);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
  await production.cancelPreparedGoogleDriveConnection();
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
});

test('the old backup is disabled before the new account is stored', async () => {
  mockDieAt = 'authorize';
  await startSetupAndDie();
  expect(mockSecure.get(TOKEN_KEY)).toBe('new-account-token');
  // No pass can open the old backup with the new account's credentials.
  expect(status()).toEqual(['disabled']);
  expect(mockSecure.has(GUARD_KEY)).toBe(true);
});

test.each(['authorize', 'list'] as const)(
  'a launch after dying at %s puts back the old account and its restore',
  async (step) => {
    mockDieAt = step;
    await startSetupAndDie();
    mockDieAt = null;
    launch();
    await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(true);
    expect(mockSecure.get(TOKEN_KEY)).toBe('old-account-token');
    expect(status()).toEqual(['restoring']);
    expect(mockSecure.has(GUARD_KEY)).toBe(false);
  },
);

test('a launch after dying at the open picker puts back the old account', async () => {
  await production.prepareGoogleDriveConnection();
  launch();
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(true);
  expect(mockSecure.get(TOKEN_KEY)).toBe('old-account-token');
  expect(status()).toEqual(['restoring']);
  // The stale picker's cancel in the new process is inert.
  await production.cancelPreparedGoogleDriveConnection();
  expect(status()).toEqual(['restoring']);
});

test('a launch after dying right after commit keeps the new backup and account', async () => {
  await production.prepareGoogleDriveConnection();
  mockDieAt = 'commit';
  void production
    .completeGoogleDriveConnection({ origin: 'settings', vaultId: 'vault-new' })
    .catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  mockDieAt = null;
  expect(mockSecure.has(GUARD_KEY)).toBe(true);
  launch();
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(false);
  expect(mockSecure.get(TOKEN_KEY)).toBe('new-account-token');
  expect(mockVaultRows.map((row) => [row.vault_id, row.status])).toEqual([
    ['vault-new', 'restoring'],
  ]);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});

test('a launch after dying while putting the old backup back finishes the job', async () => {
  await production.prepareGoogleDriveConnection();
  mockDieAt = 'restore-status';
  void production.cancelPreparedGoogleDriveConnection().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  mockDieAt = null;
  // Credentials came back first; the backup is still disabled.
  expect(mockSecure.get(TOKEN_KEY)).toBe('old-account-token');
  expect(status()).toEqual(['disabled']);
  launch();
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(true);
  expect(mockSecure.get(TOKEN_KEY)).toBe('old-account-token');
  expect(status()).toEqual(['restoring']);
});

test('a completed setup leaves nothing for launch to put back', async () => {
  await production.prepareGoogleDriveConnection();
  await production.completeGoogleDriveConnection({
    origin: 'settings',
    vaultId: 'vault-new',
  });
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
  launch();
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(false);
  expect(mockSecure.get(TOKEN_KEY)).toBe('new-account-token');
});

test('an unreadable guard signs out instead of trusting the stored account', async () => {
  mockVaultRows = [{ vault_id: 'vault-old', device_id: 'device', status: 'disabled' }];
  mockSecure.set(TOKEN_KEY, 'unknown-account-token');
  mockSecure.set(GUARD_KEY, '{not json');
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(true);
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  expect(status()).toEqual(['disabled']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});
