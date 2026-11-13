import { cloudConflicts, cloudSyncState, runExclusiveDbTransaction } from '~/db';
import { LocalStorageError } from '../sync/types';
import {
  ProductionSnapshotJournalStore,
  ProductionSnapshotMediaStore,
  clearInspectedMediaFiles,
  verifyLocalMediaFile,
} from './productionJournal';
import { sha256Text } from '../sha256';
import type { SnapshotMedia } from '../types';

const mockInspectLocalMediaFile = jest.fn();
const mockCopyVerifiedMediaFile = jest.fn();
const mockExistingUris = new Set<string>();
// Files listed here report a size and modification time, as Expo's File does.
const mockStats = new Map<string, { size: number; lastModified: number }>();
let mockLive: { uri: string; bytes: number }[] = [];
let mockRetained: { original: string; staged: string; bytes: number }[] = [];
// Full media_assets rows, for reads without a where clause.
let mockMediaRows: Record<string, unknown>[] = [];

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: jest
    .fn()
    .mockImplementation((...parts: string[]) => ({ uri: parts.join('/'), create() {} })),
  File: jest.fn().mockImplementation((...parts: unknown[]) => {
    const uri = parts
      .map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri))
      .join('/');
    return {
      uri,
      get exists() {
        return mockExistingUris.has(uri);
      },
      get size() {
        return mockStats.get(uri)?.size;
      },
      get lastModified() {
        return mockStats.get(uri)?.lastModified;
      },
      delete() {
        mockExistingUris.delete(uri);
      },
    };
  }),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'synthetic-uuid') }));

jest.mock('~/db', () => ({
  cloudConflicts: {},
  cloudSyncState: {},
  cloudTombstones: {},
  customPrompts: {},
  db: {
    select: () => ({
      from: (table: { kind: string }) =>
        Object.assign(Promise.resolve(mockMediaRows), {
          where: async () => (table.kind === 'media' ? mockLive : mockRetained),
        }),
    }),
  },
  entries: {},
  entryTags: {},
  mediaAssets: { kind: 'media' },
  profilePristineMarker: {},
  runExclusiveDbTransaction: jest.fn(),
  syncMediaObligations: {},
  syncRetainedMedia: {},
  tags: {},
  userProfile: {},
}));

jest.mock('../../media/streamingHash', () => ({
  inspectLocalMediaFile: (...args: unknown[]) => mockInspectLocalMediaFile(...args),
}));

jest.mock('../media', () => ({
  copyVerifiedMediaFile: (...args: unknown[]) => mockCopyVerifiedMediaFile(...args),
  createMediaPartialFileSink: jest.fn(),
  openMediaUploadSource: (uri: string, contentHash: string, byteLength: number) => ({
    uri,
    contentHash,
    byteLength,
  }),
}));

describe('verifyLocalMediaFile', () => {
  beforeEach(() => {
    mockExistingUris.clear();
    mockStats.clear();
    clearInspectedMediaFiles();
    mockInspectLocalMediaFile.mockReset();
    mockLive = [];
    mockRetained = [];
  });

  test('opens a staged source with one hash read and rechecks on a later call', async () => {
    const hash = 'a'.repeat(64);
    const uri = `file:///documents/cloud-sync-media/${hash}.bin`;
    mockExistingUris.add(uri);
    mockInspectLocalMediaFile
      .mockResolvedValueOnce({ sha256: hash, byteSize: 8 })
      .mockResolvedValueOnce({ sha256: 'b'.repeat(64), byteSize: 8 });
    const store = new ProductionSnapshotMediaStore();
    expect(await store.openVerifiedSource(hash)).toMatchObject({
      contentHash: hash,
      byteLength: 8,
    });
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(1);
    expect(await store.hasVerified(hash)).toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });

  test('falls back to the original retained file if the staging copy is unreadable', async () => {
    const hash = 'a'.repeat(64);
    mockRetained = [{ original: 'file:///original', staged: 'file:///staged', bytes: 8 }];
    mockExistingUris.add('file:///staged');
    mockExistingUris.add('file:///original');
    mockInspectLocalMediaFile
      .mockRejectedValueOnce(new Error('unreadable'))
      .mockResolvedValueOnce({ sha256: hash, byteSize: 8 });
    expect(
      await new ProductionSnapshotMediaStore().openVerifiedSource(hash),
    ).toMatchObject({ contentHash: hash, byteLength: 8 });
    expect(mockInspectLocalMediaFile.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///staged',
      'file:///original',
    ]);
  });

  test('rejects an existing file whose bytes no longer match its stored identity', async () => {
    const uri = 'file:///documents/photos/corrupted.jpg';
    mockExistingUris.add(uri);
    mockInspectLocalMediaFile.mockResolvedValue({
      sha256: 'b'.repeat(64),
      byteSize: 4,
    });

    await expect(verifyLocalMediaFile(uri, 'a'.repeat(64), 8)).resolves.toBe(false);
  });

  test('accepts a file only when both its hash and declared size match', async () => {
    const uri = 'file:///documents/photos/verified.jpg';
    mockExistingUris.add(uri);
    mockInspectLocalMediaFile.mockResolvedValue({
      sha256: 'a'.repeat(64),
      byteSize: 8,
    });

    await expect(verifyLocalMediaFile(uri, 'a'.repeat(64), 8)).resolves.toBe(true);
    await expect(verifyLocalMediaFile(uri, 'a'.repeat(64), 9)).resolves.toBe(false);
  });
});

describe('cached media hashes', () => {
  const hash = 'a'.repeat(64);
  const uri = 'file:///documents/photos/cached.jpg';

  beforeEach(() => {
    mockExistingUris.clear();
    mockStats.clear();
    clearInspectedMediaFiles();
    mockInspectLocalMediaFile.mockReset();
    mockLive = [{ uri, bytes: 8 }];
    mockRetained = [];
    mockExistingUris.add(uri);
    mockStats.set(uri, { size: 8, lastModified: 1_000 });
    mockInspectLocalMediaFile.mockResolvedValue({ sha256: hash, byteSize: 8 });
  });

  test('hasVerified reads an unchanged file once across passes', async () => {
    const store = new ProductionSnapshotMediaStore();
    expect(await store.hasVerified(hash)).toBe(true);
    expect(await store.hasVerified(hash)).toBe(true);
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(1);
  });

  test('a new modification time re-reads the file and detects changed bytes', async () => {
    const store = new ProductionSnapshotMediaStore();
    expect(await store.hasVerified(hash)).toBe(true);
    mockStats.set(uri, { size: 8, lastModified: 2_000 });
    mockInspectLocalMediaFile.mockResolvedValue({ sha256: 'b'.repeat(64), byteSize: 8 });
    expect(await store.hasVerified(hash)).toBe(false);
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });

  test('a new size re-reads the file', async () => {
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    mockStats.set(uri, { size: 9, lastModified: 1_000 });
    mockInspectLocalMediaFile.mockResolvedValue({ sha256: 'b'.repeat(64), byteSize: 9 });
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });

  test('a missing file is not verified by its cached hash', async () => {
    const store = new ProductionSnapshotMediaStore();
    expect(await store.hasVerified(hash)).toBe(true);
    mockExistingUris.delete(uri);
    expect(await store.hasVerified(hash)).toBe(false);
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(false);
  });

  test('an upload source always hashes the bytes it will stream', async () => {
    const store = new ProductionSnapshotMediaStore();
    expect(await store.hasVerified(hash)).toBe(true);
    expect(await store.openVerifiedSource(hash)).toMatchObject({ contentHash: hash });
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
    // Its fresh read refreshes the cache, so later checks see the new bytes.
    mockInspectLocalMediaFile.mockResolvedValue({ sha256: 'b'.repeat(64), byteSize: 8 });
    expect(await store.openVerifiedSource(hash)).toBeNull();
    expect(await store.hasVerified(hash)).toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(3);
  });

  test('a file that changes while it is read is not cached', async () => {
    mockInspectLocalMediaFile.mockImplementationOnce(async () => {
      mockStats.set(uri, { size: 8, lastModified: 2_000 });
      return { sha256: hash, byteSize: 8 };
    });
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });

  test('a deleted file recreated with the same stamp is read again', async () => {
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    mockExistingUris.delete(uri);
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(false);
    mockExistingUris.add(uri);
    mockInspectLocalMediaFile.mockResolvedValue({ sha256: 'b'.repeat(64), byteSize: 8 });
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });

  test('verification without hash reuse always reads the file', async () => {
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    mockInspectLocalMediaFile.mockResolvedValue({ sha256: 'b'.repeat(64), byteSize: 8 });
    await expect(verifyLocalMediaFile(uri, hash, 8, false)).resolves.toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });

  test('a file that disappears while it is read forgets its cached hash', async () => {
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    mockInspectLocalMediaFile.mockImplementationOnce(async () => {
      mockExistingUris.delete(uri);
      return { sha256: hash, byteSize: 8 };
    });
    await expect(verifyLocalMediaFile(uri, hash, 8, false)).resolves.toBe(true);
    // Recreated with different bytes but the original stamp.
    mockExistingUris.add(uri);
    mockInspectLocalMediaFile.mockResolvedValue({ sha256: 'b'.repeat(64), byteSize: 8 });
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(3);
  });

  test('a file without a modification time is never cached', async () => {
    mockStats.delete(uri);
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });
});

describe('remote apply with a staged download', () => {
  const hash = 'a'.repeat(64);
  const staged = `file:///documents/cloud-sync-media/${hash}.bin`;
  const asset: SnapshotMedia = {
    assetId: 'photo-1',
    ownerType: 'entry',
    ownerId: 'entry-1',
    kind: 'photo',
    blobHash: hash,
    mimeType: 'image/jpeg',
    byteSize: 8,
    width: null,
    height: null,
    durationMs: null,
    createdAt: 1,
    updatedAt: 1,
  };
  const destination = `file:///documents/photos/${sha256Text(asset.assetId)}-${hash}.jpg`;

  function materialize(store: ProductionSnapshotJournalStore) {
    return store['materializeMedia']([asset], []);
  }

  beforeEach(() => {
    mockExistingUris.clear();
    mockStats.clear();
    clearInspectedMediaFiles();
    mockInspectLocalMediaFile.mockReset();
    mockCopyVerifiedMediaFile.mockReset();
    mockLive = [];
    mockRetained = [];
    mockMediaRows = [];
    mockExistingUris.add(staged);
  });

  test.each([
    ['an existing row', 'file:///documents/photos/existing.jpg'],
    ['the deterministic destination', destination],
  ])(
    're-reads %s instead of trusting a cached hash before dropping staging',
    async (_, uri) => {
      if (uri !== destination)
        mockMediaRows = [{ asset_id: asset.assetId, blob_hash: hash, local_uri: uri }];
      mockExistingUris.add(uri);
      mockStats.set(uri, { size: 8, lastModified: 1_000 });
      mockInspectLocalMediaFile.mockResolvedValue({ sha256: hash, byteSize: 8 });
      await expect(verifyLocalMediaFile(uri, hash, 8)).resolves.toBe(true);
      // Corrupted without a visible stamp change.
      mockInspectLocalMediaFile.mockResolvedValue({
        sha256: 'b'.repeat(64),
        byteSize: 8,
      });
      const store = new ProductionSnapshotJournalStore(
        'vault',
        'device',
        new ProductionSnapshotMediaStore(),
      );

      const result = await materialize(store);

      expect(mockCopyVerifiedMediaFile).toHaveBeenCalledWith(
        expect.objectContaining({ uri: staged }),
        expect.objectContaining({ uri: destination }),
        8,
        hash,
      );
      expect(result.get(asset.assetId)?.verified).toBe(true);
    },
  );
});

describe('persisted conflict validation during capture', () => {
  const valid = {
    conflictId: 'a'.repeat(64),
    entityType: 'entry',
    entityId: 'entry',
    field: 'createdAt',
    baseValueHash: null,
    localValueHash: 'b'.repeat(64),
    remoteValueHash: 'c'.repeat(64),
    primaryValueHash: 'b'.repeat(64),
    alternates: [],
    recoveredEntityIds: [],
  };
  const store = new ProductionSnapshotJournalStore(
    'vault',
    'device',
    new ProductionSnapshotMediaStore(),
  );

  function captureWith(value: string) {
    jest.mocked(runExclusiveDbTransaction).mockImplementation(async (operation) => {
      const tx = {
        select: () => ({
          from: (table: unknown) => {
            const rows =
              table === cloudSyncState
                ? [{ journal_generation: 1 }]
                : table === cloudConflicts
                  ? [{ conflict_json: value }]
                  : [];
            const query = Object.assign(Promise.resolve(rows), {
              where: () => query,
              limit: () => query,
            });
            return query;
          },
        }),
      };
      return operation(tx as never);
    });
    return store.capture();
  }

  test.each([
    '{',
    'null',
    '[]',
    '{"conflictId":"x"}',
    ...Object.keys(valid).map((key) =>
      JSON.stringify(
        Object.fromEntries(Object.entries(valid).filter(([field]) => field !== key)),
      ),
    ),
    ...[
      { entityType: 'unknown' },
      { field: 'unknown' },
      { entityId: '' },
      { baseValueHash: 'bad' },
      { localValueHash: 1 },
      { remoteValueHash: {} },
      { primaryValueHash: 'bad' },
      { recoveredEntityIds: null },
      { recoveredEntityIds: [1] },
      { alternates: {} },
      { alternates: [null] },
      { alternates: [{ valueHash: 'a'.repeat(64) }] },
      { alternates: [{ valueHash: 'bad', value: null }] },
      { alternates: [{ valueHash: 'a'.repeat(64), value: 1 }] },
    ].map((patch) => JSON.stringify({ ...valid, ...patch })),
  ])(
    'classifies malformed persisted data as a preparation failure: %s',
    async (value) => {
      await expect(captureWith(value)).rejects.toBeInstanceOf(LocalStorageError);
      await expect(captureWith(value)).rejects.toMatchObject({
        reason: 'normalized-model-not-ready',
        message: 'invalid-local-conflict-record',
      });
    },
  );

  test('accepts a complete valid conflict', async () => {
    const conflict = {
      ...valid,
      alternates: [{ valueHash: 'c'.repeat(64), value: null }],
    };
    expect((await captureWith(JSON.stringify(conflict))).domain.conflicts).toEqual([
      conflict,
    ]);
  });

  test('does not relabel unrelated database errors as corrupt metadata', async () => {
    const error = new TypeError('transaction setup failed');
    jest.mocked(runExclusiveDbTransaction).mockRejectedValueOnce(error);
    await expect(store.capture()).rejects.toBe(error);
  });
});
