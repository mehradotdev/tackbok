/**
 * Connection setup across competing connection actions and process death. SecureStore and the
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
/** The stored token each revocation was published with. */
const mockRevocations: (string | undefined)[] = [];
let mockAuthorizeToken = 'new-account-token';
let mockAvailable = [{ vaultId: 'vault-new', updatedAt: 1 }];
let mockGuardReadFails = false;
let mockGuardDeleteFailsOnce = false;
/** Holds the next setup-guard read, which has already read its value, until it opens. */
let mockGuardReadGate: Promise<void> | null = null;
/** Each background engine that synced: its backup and the stored token then. */
const mockAdmitted: { vault: unknown; token: string | undefined }[] = [];
const mockSettings = {
  setCloudRestore: jest.fn(),
  setHasCompletedOnboarding: jest.fn(),
};

const mockCloudVault = {
  vault_id: 'vault_id',
  remote_root_id: 'remote_root_id',
  status: 'status',
  device_id: 'device_id',
  provider_kind: 'provider_kind',
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
  getItemAsync: async (key: string) => {
    if (key === GUARD_KEY && mockGuardReadFails) throw new Error('keychain locked');
    const value = mockSecure.get(key) ?? null;
    if (key === GUARD_KEY && mockGuardReadGate) {
      const gate = mockGuardReadGate;
      mockGuardReadGate = null;
      await gate;
    }
    return value;
  },
  setItemAsync: async (key: string, value: string) => {
    mockSecure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (key === GUARD_KEY && mockGuardDeleteFailsOnce) {
      mockGuardDeleteFailsOnce = false;
      throw new Error('keychain write failed');
    }
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
  isNotNull: (column: string) => (row: Row) => row[column] != null,
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
      mockSecure.set(TOKEN_KEY, mockAuthorizeToken);
      if (mockDieAt === 'authorize') return never();
    },
    signOut: mockSignOut,
    getAccountLabel: async () => 'new@example.com',
  }),
}));
jest.mock('../snapshot/drive', () => ({
  SQLiteDriveProviderStateStore: jest.fn(),
  GoogleDriveSnapshotProvider: jest.fn(() => ({
    listAvailableVaults: async () => (mockDieAt === 'list' ? never() : mockAvailable),
    // Records the credentials the real provider would use at this moment.
    publishRevocation: async () => {
      mockRevocations.push(mockSecure.get(TOKEN_KEY));
    },
    purgeRevokedVault: async () => ({ remaining: 0 }),
    listRevocations: async () => [],
  })),
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: { getState: () => mockSettings },
}));
jest.mock('../snapshot/sync', () => ({
  deletionAttentionReason: () => null,
  SQLiteSyncStateStore: jest.fn(() => ({
    clearPause: jest.fn(),
    loadState: () => ({ journalGeneration: 0, settledGeneration: 0 }),
    loadBaseCheckpoint: () => ({}),
  })),
}));
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
// The real background entry point, with an engine that records what it would use.
jest.mock('react-native', () => ({ AppState: { currentState: 'background' } }));
jest.mock('expo-network', () => ({}));
jest.mock('../storage/backfill', () => ({
  isNormalizedModelReady: async () => true,
  runNormalizedModelBackfill: async () => {},
}));
jest.mock('../snapshot/runtime', () => ({
  createProductionSnapshotRuntimeEngine: async (options: { vault: Row }) => ({
    sync: async () => {
      mockAdmitted.push({
        vault: options.vault.vault_id,
        token: mockSecure.get(TOKEN_KEY),
      });
      return { pulled: 0, pushed: 0 };
    },
  }),
}));

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
/** Runs one background pass and returns what its engine was opened with. */
async function backgroundAdmission() {
  mockAdmitted.length = 0;
  const runtime = jest.requireActual<typeof import('../runtime/production')>(
    '../runtime/production',
  );
  await runtime.runProductionBackgroundPass();
  return [...mockAdmitted];
}

beforeEach(() => {
  mockAuthorizeToken = 'new-account-token';
  mockAvailable = [{ vaultId: 'vault-new', updatedAt: 1 }];
  mockGuardReadFails = false;
  mockGuardDeleteFailsOnce = false;
  mockGuardReadGate = null;
  mockRevocations.length = 0;
  mockSecure.clear();
  mockSecure.set(TOKEN_KEY, 'old-account-token');
  mockVaultRows = [
    {
      vault_id: 'vault-old',
      device_id: 'device',
      status: 'restoring',
      remote_root_id: 'appDataFolder',
      provider_kind: 'google-drive',
      revocation_kind: null,
    },
  ];
  mockDieAt = null;
  jest.clearAllMocks();
  launch();
});

test('Disconnect ends a pending setup, so cancelling the picker cannot undo it', async () => {
  const connection = await production.prepareGoogleDriveConnection();
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
      connection,
      vaultId: 'vault-new',
    }),
  ).rejects.toThrow('no longer active');
  // Nor does a launch after a crash put the disconnected backup back.
  launch();
  await setup.reconcileAbandonedConnectionSetup();
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  expect(status()).toEqual(['disabled']);
});

test('a Disconnect queued behind setup also ends it', async () => {
  const preparing = production.prepareGoogleDriveConnection();
  const disconnecting = production.disconnectGoogleDrive();
  await preparing;
  await disconnecting;
  await production.cancelPreparedGoogleDriveConnection();
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  expect(status()).toEqual(['disabled']);
});

test('reset ends a pending setup as well', async () => {
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
  const connection = await production.prepareGoogleDriveConnection();
  mockDieAt = 'commit';
  void production
    .completeGoogleDriveConnection({
      origin: 'settings',
      connection,
      vaultId: 'vault-new',
    })
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

test('a failed guard cleanup after commit cannot put the old account onto the new backup', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const connection = await production.prepareGoogleDriveConnection();
  mockGuardDeleteFailsOnce = true;
  await production.completeGoogleDriveConnection({
    origin: 'settings',
    connection,
    vaultId: 'vault-new',
  });
  // Leaving the screen cancels the picker; the commit must already have won.
  await production.cancelPreparedGoogleDriveConnection();
  expect(mockSecure.get(TOKEN_KEY)).toBe('new-account-token');
  expect(mockVaultRows.map((row) => [row.vault_id, row.status])).toEqual([
    ['vault-new', 'restoring'],
  ]);
  // The leftover guard is inert: the next launch clears it and keeps the pair.
  launch();
  expect(await backgroundAdmission()).toEqual([
    { vault: 'vault-new', token: 'new-account-token' },
  ]);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
  warn.mockRestore();
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
  const connection = await production.prepareGoogleDriveConnection();
  await production.completeGoogleDriveConnection({
    origin: 'settings',
    connection,
    vaultId: 'vault-new',
  });
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
  launch();
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(false);
  expect(mockSecure.get(TOKEN_KEY)).toBe('new-account-token');
});

test('an unreadable guard signs out instead of trusting the stored account', async () => {
  mockVaultRows[0].status = 'disabled';
  mockSecure.set(TOKEN_KEY, 'unknown-account-token');
  mockSecure.set(GUARD_KEY, '{not json');
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(true);
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  expect(status()).toEqual(['disabled']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});

const active = () =>
  mockVaultRows
    .filter((row) => ['dirty', 'idle', 'restoring'].includes(String(row.status)))
    .map((row) => row.vault_id);

test('Reconnect puts a pending setup back first and invalidates its picker', async () => {
  // Account B offers vault-new; account C, chosen at Reconnect, holds vault-old.
  const connection = await production.prepareGoogleDriveConnection();
  // Reconnect parses the stored tokens, so C's must be a valid token set.
  mockAuthorizeToken = JSON.stringify({
    accessToken: 'third-account',
    expiresAt: 0,
  });
  mockAvailable = [{ vaultId: 'vault-old', updatedAt: 1 }];
  await production.reconnectGoogleDrive();
  expect(mockSecure.get(TOKEN_KEY)).toBe(mockAuthorizeToken);
  expect(active()).toEqual(['vault-old']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
  // B's picker cannot commit its backup with C's credentials.
  await expect(
    production.completeGoogleDriveConnection({
      origin: 'settings',
      connection,
      vaultId: 'vault-new',
    }),
  ).rejects.toThrow('no longer active');
  expect(mockVaultRows.map((row) => row.vault_id)).toEqual(['vault-old']);
});

test('Resume during setup resumes the old backup with its own account', async () => {
  mockVaultRows[0].status = 'paused';
  const connection = await production.prepareGoogleDriveConnection();
  await production.setCloudSyncPaused(false);
  expect(mockSecure.get(TOKEN_KEY)).toBe('old-account-token');
  expect(active()).toEqual(['vault-old']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
  await expect(
    production.completeGoogleDriveConnection({
      origin: 'settings',
      connection,
      vaultId: 'vault-new',
    }),
  ).rejects.toThrow('no longer active');
});

test('Resume after a launch puts back a setup the app died in first', async () => {
  mockVaultRows[0].status = 'paused';
  await production.prepareGoogleDriveConnection();
  launch();
  await production.setCloudSyncPaused(false);
  expect(mockSecure.get(TOKEN_KEY)).toBe('old-account-token');
  expect(active()).toEqual(['vault-old']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});

test('a second setup invalidates the first picker', async () => {
  const first = await production.prepareGoogleDriveConnection();
  const second = await production.prepareGoogleDriveConnection();
  await expect(
    production.completeGoogleDriveConnection({
      origin: 'settings',
      connection: first,
      vaultId: 'vault-new',
    }),
  ).rejects.toThrow('no longer active');
  await production.completeGoogleDriveConnection({
    origin: 'settings',
    connection: second,
    vaultId: 'vault-new',
  });
  expect(active()).toEqual(['vault-new']);
});

test('backup deletion during setup uses the configured account', async () => {
  await production.prepareGoogleDriveConnection();
  await production.revokeCloudVault('backup-deleted');
  expect(mockRevocations).toEqual(['old-account-token']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});

test('a deletion queued behind setup uses the configured account', async () => {
  const preparing = production.prepareGoogleDriveConnection();
  const revoking = production.revokeCloudVault('backup-deleted');
  await preparing;
  await revoking;
  expect(mockRevocations).toEqual(['old-account-token']);
});

test('journal deletion during setup uses the configured account', async () => {
  await production.prepareGoogleDriveConnection();
  // The local wipe itself is out of scope here.
  await production.deleteJournalEverywhere().catch(() => undefined);
  expect(mockRevocations).toEqual(['old-account-token']);
});

test('deletion after a launch puts back a setup the app died in first', async () => {
  await production.prepareGoogleDriveConnection();
  launch();
  await production.revokeCloudVault('backup-deleted');
  expect(mockRevocations).toEqual(['old-account-token']);
});

test('a retry is refused while a setup is pending', async () => {
  await production.prepareGoogleDriveConnection();
  await expect(production.retrySyncAttentionReason('purge-incomplete')).rejects.toThrow(
    'setup',
  );
  expect(status()).toEqual(['disabled']);
  expect(mockSecure.get(TOKEN_KEY)).toBe('new-account-token');
});

test('a guard that cannot be read is kept, and setup stays blocked', async () => {
  await production.prepareGoogleDriveConnection();
  launch();
  mockGuardReadFails = true;
  await expect(production.prepareGoogleDriveConnection()).rejects.toThrow(
    'keychain locked',
  );
  expect(mockSecure.has(GUARD_KEY)).toBe(true);
  expect(status()).toEqual(['disabled']);
  // Once storage is readable again, launch recovery puts the old backup back.
  mockGuardReadFails = false;
  launch();
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(true);
  expect(mockSecure.get(TOKEN_KEY)).toBe('old-account-token');
  expect(status()).toEqual(['restoring']);
});

test('a corrupt guard signs out even while a backup is active', async () => {
  mockSecure.set(TOKEN_KEY, 'unknown-account-token');
  mockSecure.set(GUARD_KEY, '{not json');
  await expect(setup.reconcileAbandonedConnectionSetup()).resolves.toBe(true);
  expect(mockSecure.get(TOKEN_KEY)).toBeUndefined();
  // The configured backup is kept; sync waits for the user to reconnect.
  expect(status()).toEqual(['restoring']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});

test('a Retry waiting on the guard read cannot enable the backup once setup stages an account', async () => {
  let release!: () => void;
  mockGuardReadGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const retrying = production
    .retrySyncAttentionReason('purge-incomplete')
    .catch((error: unknown) => error);
  for (let tick = 0; tick < 20; tick++) await Promise.resolve();
  // The Retry has read an absent guard; setup starts while that read is delayed.
  const preparing = production.prepareGoogleDriveConnection();
  // Give setup every chance to stage B before the delayed read returns.
  for (let tick = 0; tick < 50; tick++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  await retrying;
  await preparing;
  expect(mockSecure.get(TOKEN_KEY)).toBe('new-account-token');
  expect(status()).toEqual(['disabled']);
  expect(mockSecure.has(GUARD_KEY)).toBe(true);
  await expect(backgroundAdmission()).resolves.toEqual([]);
  // After the app dies at the picker, the old backup resumes with its own account.
  launch();
  await expect(backgroundAdmission()).resolves.toEqual([
    { vault: 'vault-old', token: 'old-account-token' },
  ]);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});

// Reconnect parses the stored tokens, so these are valid token sets.
const OLD_TOKENS = JSON.stringify({ accessToken: 'old-account', expiresAt: 0 });
const THIRD_TOKENS = JSON.stringify({ accessToken: 'third-account', expiresAt: 0 });

test.each(['authorize', 'list'] as const)(
  'a launch after Reconnect dies at %s puts back the old account before any background pass',
  async (step) => {
    mockSecure.set(TOKEN_KEY, OLD_TOKENS);
    // A pending setup for account B is put back first; Reconnect then picks C.
    await production.prepareGoogleDriveConnection();
    mockAuthorizeToken = THIRD_TOKENS;
    mockAvailable = [{ vaultId: 'vault-old', updatedAt: 1 }];
    mockDieAt = step;
    void production.reconnectGoogleDrive().catch(() => undefined);
    for (let tick = 0; tick < 50; tick++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSecure.get(TOKEN_KEY)).toBe(THIRD_TOKENS);
    expect(status()).toEqual(['disabled']);
    expect(mockSecure.has(GUARD_KEY)).toBe(true);
    mockDieAt = null;
    launch();
    await expect(backgroundAdmission()).resolves.toEqual([
      { vault: 'vault-old', token: OLD_TOKENS },
    ]);
    expect(status()).toEqual(['restoring']);
    expect(mockSecure.has(GUARD_KEY)).toBe(false);
  },
);

test('a Reconnect to an account without the backup puts the old account back', async () => {
  mockSecure.set(TOKEN_KEY, OLD_TOKENS);
  mockAuthorizeToken = THIRD_TOKENS;
  await expect(production.reconnectGoogleDrive()).rejects.toThrow('not found');
  expect(mockSecure.get(TOKEN_KEY)).toBe(OLD_TOKENS);
  expect(status()).toEqual(['restoring']);
  expect(mockSecure.has(GUARD_KEY)).toBe(false);
});
