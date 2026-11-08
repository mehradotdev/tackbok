import type { SQLiteSyncStateStore } from '../sync/sqliteState';
import type { SnapshotSyncEngine } from '../sync/engine';
import type { ProductionSnapshotJournalStore } from '../storage';
import type { SnapshotProvider } from '../sync/types';
import { SyncCancelledError } from '../sync/errors';
import type { JournalSnapshotPayload } from '../types';
import { cloudConnectionLifecycle } from '../../runtime/connectionLifecycle';
import {
  pendingMediaBytes,
  productionSnapshotCache,
  ProductionSnapshotRuntimeEngine,
} from './productionEngine';

const mockWrites: string[] = [];
const mockMarkJournalRestored = jest.fn();
function mockQuery(kind: string): unknown {
  const chain: Record<string, unknown> = {};
  for (const method of [
    'from',
    'where',
    'limit',
    'values',
    'onConflictDoUpdate',
    'set',
  ]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (rows: unknown[]) => unknown) => {
    if (kind !== 'select') mockWrites.push(kind);
    return Promise.resolve([]).then(resolve);
  };
  return chain;
}
jest.mock('~/db', () => ({
  cloudConflicts: {},
  cloudVault: {},
  mediaAssets: {},
  syncProviderState: {},
  userProfile: {},
  sqlite: { getFirstSync: () => ({ value: 0 }) },
  db: {
    select: () => mockQuery('select'),
    insert: () => mockQuery('insert'),
    update: () => mockQuery('update'),
  },
}));
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  count: jest.fn(),
  eq: jest.fn(),
  isNotNull: jest.fn(),
  isNull: jest.fn(),
  ne: jest.fn(),
  or: jest.fn(),
}));
jest.mock('expo-network', () => ({}));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => ({ markCloudRestoreJournalRestored: mockMarkJournalRestored }),
    setState: jest.fn(),
  },
}));
jest.mock('../../auth', () => ({}));
jest.mock('../../auth/secureTokenStore', () => ({}));
jest.mock('../../storage/retainedMedia', () => ({ reapRetainedMedia: async () => {} }));
jest.mock('./nativeSha256', () => ({ nativeSha256Bytes: jest.fn() }));
jest.mock('./mediaHashing', () => ({
  hashPendingProductionMedia: async () => ({ processed: 0, failed: 0, missing: 0 }),
}));
jest.mock('../drive', () => ({}));
jest.mock('../sync/engine', () => ({}));
jest.mock('../sync/baseShadow', () => ({}));
jest.mock('../sync/expoBaseShadowFiles', () => ({}));
jest.mock('../sync/sqliteState', () => ({}));
jest.mock('../storage', () => ({}));

interface Harness {
  runtime: ProductionSnapshotRuntimeEngine;
  setPause: jest.Mock;
  engineSync: jest.Mock;
  remoteApplied: jest.Mock;
}

function harness(
  vaultId: string,
  options: {
    engineSync?: () => Promise<unknown>;
    hydrate?: () => Promise<{ hydrated: number; missing: number }>;
  } = {},
): Harness {
  const setPause = jest.fn();
  const engineSync = jest.fn(
    options.engineSync ?? (async () => ({ status: 'up-to-date', actionableChanges: 0 })),
  );
  const remoteApplied = jest.fn();
  const runtime = new ProductionSnapshotRuntimeEngine(
    { vault_id: vaultId, device_id: 'device', status: 'idle' },
    {
      loadState: () => ({ journalGeneration: 0, settledGeneration: 0 }),
      setPause,
    } as unknown as SQLiteSyncStateStore,
    { sync: engineSync } as unknown as SnapshotSyncEngine,
    {
      hydratePendingMedia: options.hydrate ?? (async () => ({ hydrated: 0, missing: 0 })),
    } as unknown as ProductionSnapshotJournalStore,
    {} as SnapshotProvider,
    () => {},
    remoteApplied,
  );
  return { runtime, setPause, engineSync, remoteApplied };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockWrites.length = 0;
  mockMarkJournalRestored.mockClear();
});

test('a completed pass records that the journal of this backup was restored', async () => {
  const app = harness('vault-restored', {
    engineSync: async () => ({ status: 'pulled', actionableChanges: 0 }),
  });
  await expect(app.runtime.sync()).resolves.toEqual({ pulled: 1, pushed: 0 });
  expect(mockMarkJournalRestored).toHaveBeenCalledWith('vault-restored');
});

test('a pass that needs attention or a retry records no restored journal', async () => {
  for (const result of [
    { status: 'attention', reason: 'auth-required' },
    { status: 'retry', reason: 'transient' },
  ]) {
    const app = harness(`vault-${result.status}`, { engineSync: async () => result });
    await expect(app.runtime.sync()).rejects.toBeDefined();
  }
  expect(mockMarkJournalRestored).not.toHaveBeenCalled();
});

test('a stopped caller stops waiting for a joined pass without cancelling or overlapping it', async () => {
  const release = deferred<unknown>();
  const owner = harness('vault-join', { engineSync: () => release.promise });
  const ownerRun = owner.runtime.sync();
  await tick();
  expect(owner.engineSync).toHaveBeenCalledTimes(1);

  const joiner = harness('vault-join');
  const stopped = new AbortController();
  stopped.abort();
  await expect(joiner.runtime.sync(stopped.signal)).rejects.toBeInstanceOf(
    SyncCancelledError,
  );

  const caller = new AbortController();
  const joined = joiner.runtime.sync(caller.signal);
  await tick();
  caller.abort();
  await expect(joined).rejects.toBeInstanceOf(SyncCancelledError);

  // The owner still holds the vault: a later caller joins it, never overlaps.
  const later = joiner.runtime.sync();
  await tick();
  expect(joiner.engineSync).not.toHaveBeenCalled();
  release.resolve({ status: 'up-to-date', actionableChanges: 0 });
  await expect(ownerRun).resolves.toEqual({ pulled: 0, pushed: 0 });
  await expect(later).resolves.toEqual({ pulled: 0, pushed: 0 });
});

test('a stopped caller stops waiting for a cancelled pass that is still draining', async () => {
  const release = deferred<unknown>();
  const owner = harness('vault-drain', { engineSync: () => release.promise });
  const ownerCaller = new AbortController();
  const ownerRun = owner.runtime.sync(ownerCaller.signal);
  await tick();
  ownerCaller.abort();

  const joiner = harness('vault-drain');
  const caller = new AbortController();
  const waiting = joiner.runtime.sync(caller.signal);
  await tick();
  caller.abort();
  await expect(waiting).rejects.toBeInstanceOf(SyncCancelledError);
  expect(joiner.engineSync).not.toHaveBeenCalled();

  release.resolve({ status: 'up-to-date', actionableChanges: 0 });
  await expect(ownerRun).rejects.toBeInstanceOf(SyncCancelledError);
});

test('cancellation during local hydration records no pause or success but refreshes applied changes', async () => {
  for (const outcome of [
    { hydrated: 0, missing: 1 },
    { hydrated: 1, missing: 0 },
  ]) {
    const caller = new AbortController();
    const app = harness(`vault-hydrate-${outcome.missing}`, {
      engineSync: async () => ({ status: 'pulled', actionableChanges: 0 }),
      hydrate: async () => {
        // Stop arrives while local completion is still finishing.
        caller.abort();
        return outcome;
      },
    });
    await expect(app.runtime.sync(caller.signal)).rejects.toBeInstanceOf(
      SyncCancelledError,
    );
    expect(app.setPause).not.toHaveBeenCalled();
    // The pulled journal is already committed; screens must not stay stale.
    expect(app.remoteApplied).toHaveBeenCalledTimes(1);
    expect(mockWrites).toEqual([]);
  }
});

test('a pass cancelled inside the sync engine still refreshes screens', async () => {
  const caller = new AbortController();
  const app = harness('vault-engine-cancelled', {
    engineSync: async () => {
      // The engine may commit a remote apply before reaching a cancelled kill point.
      caller.abort();
      throw new SyncCancelledError();
    },
  });
  await expect(app.runtime.sync(caller.signal)).rejects.toBeInstanceOf(
    SyncCancelledError,
  );
  expect(app.setPause).not.toHaveBeenCalled();
  expect(app.remoteApplied).toHaveBeenCalledTimes(1);
});

test('attachment rows that share a blob count its bytes once', () => {
  // Both rows hydrate from one download, which reports its bytes once.
  expect(
    pendingMediaBytes([
      { blobHash: 'shared', byteSize: 100 },
      { blobHash: 'shared', byteSize: 100 },
      { blobHash: 'other', byteSize: 50 },
      { blobHash: null, byteSize: 70 },
    ]),
  ).toBe(150);
});

test('a connection change clears verified snapshots, even those a draining pass kept', async () => {
  const cached = (vaultId: string, snapshotId: string) => {
    productionSnapshotCache.set(
      vaultId,
      snapshotId,
      { vaultId } as unknown as JournalSnapshotPayload,
      1,
    );
  };
  cached('vault-before', 'before');
  const release = deferred<void>();
  const app = harness('vault-draining', {
    engineSync: async () => {
      await release.promise;
      // A pass cancelled mid-download may still store what it verified.
      cached('vault-draining', 'late');
      return { status: 'up-to-date', actionableChanges: 0 };
    },
  });
  const pass = app.runtime.sync().catch(() => undefined);
  await tick();
  let sizeDuringChange = -1;
  const change = cloudConnectionLifecycle.change(async () => {
    sizeDuringChange = productionSnapshotCache.size;
  });
  release.resolve();
  await Promise.all([pass, change]);
  expect(sizeDuringChange).toBe(0);
  expect(productionSnapshotCache.get('vault-before', 'before')).toBeUndefined();
  expect(productionSnapshotCache.get('vault-draining', 'late')).toBeUndefined();
});
