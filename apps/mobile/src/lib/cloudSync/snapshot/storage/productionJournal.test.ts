import { cloudConflicts, cloudSyncState, runExclusiveDbTransaction } from '~/db';
import { LocalStorageError } from '../sync/types';
import { ProductionSnapshotJournalStore, ProductionSnapshotMediaStore, verifyLocalMediaFile } from './productionJournal';

const mockInspectLocalMediaFile = jest.fn();
const mockExistingUris = new Set<string>();
let mockLive: { uri: string; bytes: number }[] = [];
let mockRetained: { original: string; staged: string; bytes: number }[] = [];

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: jest.fn().mockImplementation((...parts: string[]) => ({ uri: parts.join('/'), create() {} })),
  File: jest.fn().mockImplementation((...parts: unknown[]) => {
    const uri = parts.map((part) => typeof part === 'string' ? part : (part as { uri: string }).uri).join('/');
    return { uri, exists: mockExistingUris.has(uri) };
  }),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'synthetic-uuid') }));

jest.mock('~/db', () => ({
  cloudConflicts: {},
  cloudSyncState: {},
  cloudTombstones: {},
  customPrompts: {},
  db: { select: () => ({ from: (table: { kind: string }) => ({
    where: async () => table.kind === 'media' ? mockLive : mockRetained,
  }) }) },
  entries: {},
  entryTags: {},
  mediaAssets: { kind: 'media' },
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
  copyVerifiedMediaFile: jest.fn(),
  createMediaPartialFileSink: jest.fn(),
  openMediaUploadSource: (uri: string, contentHash: string, byteLength: number) => ({ uri, contentHash, byteLength }),
}));

describe('verifyLocalMediaFile', () => {
  beforeEach(() => {
    mockExistingUris.clear();
    mockInspectLocalMediaFile.mockReset();
    mockLive = [];
    mockRetained = [];
  });

  test('opens a staged source with one hash read and rechecks on a later call', async () => {
    const hash = 'a'.repeat(64);
    const uri = `file:///documents/cloud-sync-media/${hash}.bin`;
    mockExistingUris.add(uri);
    mockInspectLocalMediaFile.mockResolvedValueOnce({ sha256: hash, byteSize: 8 })
      .mockResolvedValueOnce({ sha256: 'b'.repeat(64), byteSize: 8 });
    const store = new ProductionSnapshotMediaStore();
    expect(await store.openVerifiedSource(hash)).toMatchObject({ contentHash: hash, byteLength: 8 });
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(1);
    expect(await store.hasVerified(hash)).toBe(false);
    expect(mockInspectLocalMediaFile).toHaveBeenCalledTimes(2);
  });

  test('falls back to the original retained file if the staging copy is unreadable', async () => {
    const hash = 'a'.repeat(64);
    mockRetained = [{ original: 'file:///original', staged: 'file:///staged', bytes: 8 }];
    mockExistingUris.add('file:///staged');
    mockExistingUris.add('file:///original');
    mockInspectLocalMediaFile.mockRejectedValueOnce(new Error('unreadable'))
      .mockResolvedValueOnce({ sha256: hash, byteSize: 8 });
    expect(await new ProductionSnapshotMediaStore().openVerifiedSource(hash))
      .toMatchObject({ contentHash: hash, byteLength: 8 });
    expect(mockInspectLocalMediaFile.mock.calls.map(([uri]) => uri))
      .toEqual(['file:///staged', 'file:///original']);
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


describe('persisted conflict validation during capture', () => {
  const valid = {
    conflictId: 'a'.repeat(64), entityType: 'entry', entityId: 'entry', field: 'createdAt',
    baseValueHash: null, localValueHash: 'b'.repeat(64), remoteValueHash: 'c'.repeat(64),
    primaryValueHash: 'b'.repeat(64), alternates: [], recoveredEntityIds: [],
  };
  const store = new ProductionSnapshotJournalStore('vault', 'device', new ProductionSnapshotMediaStore());

  function captureWith(value: string) {
    jest.mocked(runExclusiveDbTransaction).mockImplementation(async (operation) => {
      const tx = { select: () => ({ from: (table: unknown) => {
        const rows = table === cloudSyncState ? [{ journal_generation: 1 }]
          : table === cloudConflicts ? [{ conflict_json: value }] : [];
        const query = Object.assign(Promise.resolve(rows), {
          where: () => query, limit: () => query,
        });
        return query;
      } }) };
      return operation(tx as never);
    });
    return store.capture();
  }

  test.each([
    '{', 'null', '[]', '{"conflictId":"x"}',
    ...Object.keys(valid).map((key) => JSON.stringify(Object.fromEntries(
      Object.entries(valid).filter(([field]) => field !== key),
    ))),
    ...[
      { entityType: 'unknown' }, { field: 'unknown' }, { entityId: '' },
      { baseValueHash: 'bad' }, { localValueHash: 1 }, { remoteValueHash: {} },
      { primaryValueHash: 'bad' }, { recoveredEntityIds: null }, { recoveredEntityIds: [1] },
      { alternates: {} }, { alternates: [null] },
      { alternates: [{ valueHash: 'a'.repeat(64) }] },
      { alternates: [{ valueHash: 'bad', value: null }] },
      { alternates: [{ valueHash: 'a'.repeat(64), value: 1 }] },
    ].map((patch) => JSON.stringify({ ...valid, ...patch })),
  ])('classifies malformed persisted data as a preparation failure: %s', async (value) => {
    await expect(captureWith(value)).rejects.toBeInstanceOf(LocalStorageError);
    await expect(captureWith(value)).rejects.toMatchObject({
      reason: 'normalized-model-not-ready', message: 'invalid-local-conflict-record',
    });
  });

  test('accepts a complete valid conflict', async () => {
    const conflict = { ...valid, alternates: [{ valueHash: 'c'.repeat(64), value: null }] };
    expect((await captureWith(JSON.stringify(conflict))).domain.conflicts).toEqual([conflict]);
  });

  test('does not relabel unrelated database errors as corrupt metadata', async () => {
    const error = new TypeError('transaction setup failed');
    jest.mocked(runExclusiveDbTransaction).mockRejectedValueOnce(error);
    await expect(store.capture()).rejects.toBe(error);
  });
});
