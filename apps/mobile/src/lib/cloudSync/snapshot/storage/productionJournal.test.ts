import { ProductionSnapshotMediaStore, verifyLocalMediaFile } from './productionJournal';

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
