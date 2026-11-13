import type { SQLiteSyncStateStore } from '../sync/sqliteState';
import type { SnapshotSyncEngine } from '../sync/engine';
import type { ProductionSnapshotJournalStore } from '../storage';
import type { SnapshotProvider } from '../sync/types';
import { SyncCancelledError } from '../sync/errors';
import { SnapshotProviderError } from '../sync/types';
import type { JournalSnapshotPayload } from '../types';
import { cloudConnectionLifecycle } from '../../runtime/connectionLifecycle';
import {
  pendingMediaBytes,
  productionSnapshotCache,
  ProductionSnapshotRuntimeEngine,
} from './productionEngine';

const mockWrites: string[] = [];
const mockMarkJournalRestored = jest.fn();
// Rows every media select returns: the waiting attachments a pass reads.
let mockPendingMedia: unknown[] = [];
function mockQuery(kind: string): unknown {
  const chain: Record<string, unknown> = {};
  let rows: unknown[] = [];
  chain.from = (table: unknown) => {
    if ((table as { name?: string }).name === 'media_assets') rows = mockPendingMedia;
    return chain;
  };
  for (const method of ['where', 'limit', 'values', 'onConflictDoUpdate', 'set']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (rows: unknown[]) => unknown) => {
    if (kind !== 'select') mockWrites.push(kind);
    return Promise.resolve(kind === 'select' ? rows : []).then(resolve);
  };
  return chain;
}
jest.mock('~/db', () => ({
  cloudConflicts: {},
  cloudVault: {},
  mediaAssets: { name: 'media_assets' },
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
    requeue?: () => Promise<number>;
    loadState?: () => { journalGeneration: number; settledGeneration: number };
    hydrationBatchesPerPass?: number;
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
      loadState:
        options.loadState ?? (() => ({ journalGeneration: 0, settledGeneration: 0 })),
      setPause,
    } as unknown as SQLiteSyncStateStore,
    { sync: engineSync } as unknown as SnapshotSyncEngine,
    {
      hydratePendingMedia: options.hydrate ?? (async () => ({ hydrated: 0, missing: 0 })),
      requeueMissingVerifiedMedia: options.requeue ?? (async () => 0),
    } as unknown as ProductionSnapshotJournalStore,
    {} as SnapshotProvider,
    () => {},
    remoteApplied,
    undefined,
    undefined,
    undefined,
    options.hydrationBatchesPerPass,
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
  mockPendingMedia = [];
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

test('applied text reaches screens before pending media downloads, then every batch downloads', async () => {
  mockPendingMedia = Array.from({ length: 5 }, (_, index) => ({
    blobHash: `blob-${index}`,
    byteSize: 1,
  }));
  const order: string[] = [];
  const batches = [2, 2, 1];
  const app = harness('vault-text-first', {
    engineSync: async () => ({ status: 'pulled', actionableChanges: 0 }),
    hydrate: async () => {
      order.push('hydrate');
      return { hydrated: batches.shift() ?? 0, missing: 0 };
    },
  });
  mockMarkJournalRestored.mockImplementation(() => order.push('journal-restored'));
  app.remoteApplied.mockImplementation(() => order.push('screens'));
  await expect(app.runtime.sync()).resolves.toEqual({ pulled: 1, pushed: 0 });
  expect(order.slice(0, 3)).toEqual(['journal-restored', 'screens', 'hydrate']);
  expect(order.filter((value) => value === 'hydrate')).toHaveLength(3);
  // Each batch shows its photos as soon as they arrive.
  expect(order.slice(2, 8)).toEqual([
    'hydrate',
    'screens',
    'hydrate',
    'screens',
    'hydrate',
    'screens',
  ]);
  mockMarkJournalRestored.mockReset();
});

test('local edits stop the downloads so a follow-up pass publishes them first', async () => {
  mockPendingMedia = Array.from({ length: 6 }, (_, index) => ({
    blobHash: `blob-${index}`,
    byteSize: 1,
  }));
  const hydrate = jest.fn(async () => ({ hydrated: 2, missing: 0 }));
  let edited = false;
  const app = harness('vault-edit-during-hydration', {
    hydrate: async () => {
      edited = true;
      return hydrate();
    },
    loadState: () => ({ journalGeneration: edited ? 1 : 0, settledGeneration: 0 }),
  });
  await app.runtime.sync();
  expect(hydrate).toHaveBeenCalledTimes(1);
  expect(app.runtime.hasPendingWork()).toBe(true);
});

test('a background task downloads one batch per pass', async () => {
  mockPendingMedia = Array.from({ length: 6 }, (_, index) => ({
    blobHash: `blob-${index}`,
    byteSize: 1,
  }));
  const hydrate = jest.fn(async () => ({ hydrated: 2, missing: 0 }));
  const app = harness('vault-background-hydration', {
    hydrate,
    hydrationBatchesPerPass: 1,
  });
  await app.runtime.sync();
  expect(hydrate).toHaveBeenCalledTimes(1);
});

test('files saved before a hydration batch fails still reach screens', async () => {
  for (const failure of ['missing', 'provider'] as const) {
    mockPendingMedia = [
      { blobHash: 'blob', byteSize: 1 },
      { blobHash: 'gone', byteSize: 1 },
    ];
    const order: string[] = [];
    const app = harness(`vault-partial-${failure}`, {
      engineSync: async () => ({ status: 'up-to-date', actionableChanges: 0 }),
      hydrate: async () => {
        order.push('hydrate');
        // The first file is saved, then the second one fails.
        if (failure === 'missing') return { hydrated: 1, missing: 1 };
        throw new SnapshotProviderError('authorization-required', 'Signed out mid-batch');
      },
    });
    app.remoteApplied.mockImplementation(() => order.push('screens'));
    await expect(app.runtime.sync()).rejects.toBeDefined();
    expect(order).toEqual(['hydrate', 'screens']);
  }
});

test('missing downloaded files are queued once per engine, before hydration', async () => {
  const order: string[] = [];
  const app = harness('vault-requeue', {
    requeue: async () => {
      order.push('requeue');
      return 1;
    },
    hydrate: async () => {
      order.push('hydrate');
      return { hydrated: 0, missing: 0 };
    },
  });
  await app.runtime.sync();
  await app.runtime.sync();
  expect(order).toEqual(['requeue', 'hydrate', 'hydrate']);
});

test('an OS background task does not look for missing files', async () => {
  const requeue = jest.fn(async () => 0);
  const app = harness('vault-requeue-background', {
    requeue,
    hydrationBatchesPerPass: 1,
  });
  await app.runtime.sync();
  expect(requeue).not.toHaveBeenCalled();
});

test('a failed check for missing files does not fail the pass and is retried', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const requeue = jest
    .fn<Promise<number>, []>()
    .mockRejectedValueOnce(new Error('database is busy'))
    .mockResolvedValue(0);
  const app = harness('vault-requeue-failed', { requeue });
  await expect(app.runtime.sync()).resolves.toEqual({ pulled: 0, pushed: 0 });
  await app.runtime.sync();
  await app.runtime.sync();
  expect(requeue).toHaveBeenCalledTimes(2);
  warn.mockRestore();
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
    // The pulled journal reaches screens before media downloads, and again
    // after cancellation for whatever hydrated meanwhile.
    expect(app.remoteApplied).toHaveBeenCalledTimes(2);
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
