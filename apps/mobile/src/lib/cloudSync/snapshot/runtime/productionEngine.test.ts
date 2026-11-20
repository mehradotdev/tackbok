import type { SQLiteSyncStateStore } from '../sync/sqliteState';
import type { V2SyncEngine } from '../sync/v2Engine';
import type { ProductionSnapshotJournalStore } from '../storage';
import type { SnapshotProvider } from '../sync/types';
import { SyncCancelledError } from '../sync/errors';
import { SnapshotProviderError } from '../sync/types';
import {
  pendingMediaBytes,
  productionCodeVersion,
  ProductionSnapshotRuntimeEngine,
} from './productionEngine';

// The runtime gets its engine injected here; the real one needs native crypto.
jest.mock('../sync/v2Engine', () => ({ V2SyncEngine: jest.fn() }));

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
  cloudVault: {},
  mediaAssets: { name: 'media_assets' },
  syncProviderState: {},
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
jest.mock('expo-application', () => ({ nativeBuildVersion: '42' }));
jest.mock('expo-network', () => ({}));
jest.mock('expo-updates', () => ({ updateId: 'abc' }));
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
const mockLoadProfileCache = jest.fn(async () => true);
jest.mock('../../storage/backfill', () => ({
  loadProfileCache: () => mockLoadProfileCache(),
}));
jest.mock('./nativeSha256', () => ({ nativeSha256Bytes: jest.fn() }));
const mockCheckOrder: string[] = [];
jest.mock('./mediaHashing', () => ({
  hashPendingProductionMedia: async () => {
    mockCheckOrder.push('hash');
    return { processed: 0, failed: 0, missing: 0 };
  },
}));
jest.mock('../drive', () => ({}));
jest.mock('../sync/sqliteState', () => ({}));
const mockPruneMedia = jest.fn(async () => 0);
jest.mock('../storage', () => ({
  pruneMissingUnusedMedia: () => {
    mockCheckOrder.push('prune');
    return mockPruneMedia();
  },
}));

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
    hydrate?: () => Promise<{
      hydrated: number;
      missing: number;
      unavailable?: number;
      profilePhoto?: boolean;
    }>;
    requeue?: () => Promise<number>;
    requeueUnavailable?: () => Promise<void>;
    loadState?: () => { journalGeneration: number; settledGeneration: number };
    hydrationBatchesPerPass?: number;
    persistMediaHashes?: () => Promise<void>;
    prepareMediaDownloads?: (vaultId: string) => Promise<void>;
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
    { sync: engineSync } as unknown as V2SyncEngine,
    {
      hydratePendingMedia: async () => ({
        unavailable: 0,
        ...(await (options.hydrate ?? (async () => ({ hydrated: 0, missing: 0 })))()),
      }),
      requeueMissingVerifiedMedia: options.requeue ?? (async () => 0),
      requeueUnavailableMedia: options.requeueUnavailable ?? (async () => {}),
      persistMediaHashes: options.persistMediaHashes ?? (async () => {}),
    } as unknown as ProductionSnapshotJournalStore,
    {
      prepareMediaDownloads: options.prepareMediaDownloads,
    } as unknown as SnapshotProvider,
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
  mockLoadProfileCache.mockReset();
  mockLoadProfileCache.mockImplementation(async () => true);
});

test('a completed pass records that the journal of this backup was restored', async () => {
  const app = harness('vault-restored', {
    engineSync: async () => ({ status: 'pulled', actionableChanges: 0 }),
  });
  await expect(app.runtime.sync()).resolves.toEqual({ pulled: 1, pushed: 0 });
  expect(mockMarkJournalRestored).toHaveBeenCalledWith('vault-restored');
});

test('unused media rows are pruned before hashing, and a failed prune does not fail the pass', async () => {
  mockCheckOrder.length = 0;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(harness('vault-pruned').runtime.sync()).resolves.toBeDefined();
    expect(mockCheckOrder.slice(0, 2)).toEqual(['prune', 'hash']);
    mockPruneMedia.mockRejectedValueOnce(new Error('locked'));
    await expect(harness('vault-prune-failed').runtime.sync()).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      'Cloud sync could not remove unused media rows',
      expect.any(Error),
    );
  } finally {
    warn.mockRestore();
  }
});

test('every pass saves its media hashes, including one that fails', async () => {
  const persistMediaHashes = jest.fn(async () => {});
  const passed = harness('vault-hashes-saved', { persistMediaHashes });
  await expect(passed.runtime.sync()).resolves.toBeDefined();
  const failed = harness('vault-hashes-saved-failed', {
    engineSync: async () => ({ status: 'retry', reason: 'transient' }),
    persistMediaHashes,
  });
  await expect(failed.runtime.sync()).rejects.toBeDefined();
  expect(persistMediaHashes).toHaveBeenCalledTimes(2);
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

test('applied text reaches screens before pending media downloads; downloads refresh screens at most every few seconds', async () => {
  mockPendingMedia = Array.from({ length: 49 }, (_, index) => ({
    blobHash: `blob-${index}`,
    byteSize: 1,
  }));
  const order: string[] = [];
  const batches = [24, 24, 1];
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
  // The first files show at once, the rest when the downloads stop: these
  // batches all finish within the refresh interval.
  expect(order.slice(2, 7)).toEqual([
    'hydrate',
    'screens',
    'hydrate',
    'hydrate',
    'screens',
  ]);
  mockMarkJournalRestored.mockReset();
});

test('many pending files are listed once before their downloads, a few are not', async () => {
  for (const [count, listings] of [
    [25, 1],
    [5, 0],
  ] as const) {
    mockPendingMedia = Array.from({ length: count }, (_, index) => ({
      blobHash: `blob-${index}`,
      byteSize: 1,
    }));
    const order: string[] = [];
    const app = harness(`vault-listing-${count}`, {
      engineSync: async () => ({ status: 'pulled', actionableChanges: 0 }),
      prepareMediaDownloads: async () => {
        order.push('listing');
      },
      hydrate: async () => {
        order.push('hydrate');
        return { hydrated: 0, missing: 0 };
      },
    });
    await expect(app.runtime.sync()).resolves.toEqual({ pulled: 1, pushed: 0 });
    expect(order.filter((step) => step === 'listing')).toHaveLength(listings);
    expect(order.at(-1)).toBe('hydrate');
  }
});

test('the profile cache reloads when a journal is applied and when the profile photo downloads', async () => {
  mockPendingMedia = Array.from({ length: 48 }, (_, index) => ({
    blobHash: `blob-${index}`,
    byteSize: 1,
  }));
  const order: string[] = [];
  const batches = [
    { hydrated: 24, missing: 0, profilePhoto: false },
    { hydrated: 24, missing: 0, profilePhoto: true },
  ];
  const app = harness('vault-profile-photo', {
    engineSync: async () => ({ status: 'pulled', actionableChanges: 0 }),
    hydrate: async () => {
      order.push('hydrate');
      return batches.shift() ?? { hydrated: 0, missing: 0, profilePhoto: false };
    },
  });
  mockLoadProfileCache.mockImplementation(async () => {
    order.push('profile');
    return true;
  });
  await app.runtime.sync();
  // Once for the applied journal, once for the batch with the profile photo.
  expect(order).toEqual(['profile', 'hydrate', 'hydrate', 'profile']);
});

test('a profile reload that fails or loses to local edits is retried on later passes', async () => {
  let synced = false;
  const app = harness('vault-profile-retry', {
    engineSync: async () => {
      if (synced) return { status: 'up-to-date', actionableChanges: 0 };
      synced = true;
      return { status: 'pulled', actionableChanges: 0 };
    },
  });
  mockLoadProfileCache.mockRejectedValueOnce(new Error('read failed'));
  await expect(app.runtime.sync()).rejects.toThrow('read failed');
  mockLoadProfileCache.mockResolvedValueOnce(false);
  await app.runtime.sync();
  await app.runtime.sync();
  await app.runtime.sync();
  // Failed, dropped, then loaded; the last pass owes nothing.
  expect(mockLoadProfileCache).toHaveBeenCalledTimes(3);
});

test('passes that apply nothing, and other media downloads, leave the profile cache alone', async () => {
  const quiet = harness('vault-profile-quiet');
  await quiet.runtime.sync();
  mockPendingMedia = [{ blobHash: 'blob', byteSize: 1 }];
  const media = harness('vault-profile-other-media', {
    hydrate: async () => ({ hydrated: 1, missing: 0, profilePhoto: false }),
  });
  await media.runtime.sync();
  expect(media.remoteApplied).toHaveBeenCalled();
  expect(mockLoadProfileCache).not.toHaveBeenCalled();
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
  // A requeued profile photo is hidden until its file is back.
  expect(mockLoadProfileCache).toHaveBeenCalledTimes(1);
});

test('files the backup no longer has do not pause, and are looked for again once per engine', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    mockPendingMedia = [{ blobHash: 'gone', byteSize: 1 }];
    const order: string[] = [];
    const app = harness('vault-unavailable', {
      requeueUnavailable: async () => {
        order.push('requeue');
      },
      hydrate: async () => {
        order.push('hydrate');
        return { hydrated: 0, missing: 0, unavailable: 1 };
      },
    });
    await expect(app.runtime.sync()).resolves.toEqual({ pulled: 0, pushed: 0 });
    await expect(app.runtime.sync()).resolves.toEqual({ pulled: 0, pushed: 0 });
    expect(order).toEqual(['requeue', 'hydrate', 'hydrate']);
    expect(app.setPause).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
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

test('a failed join is retried after a new build or update', () => {
  expect(productionCodeVersion()).toBe('42/abc');
});
