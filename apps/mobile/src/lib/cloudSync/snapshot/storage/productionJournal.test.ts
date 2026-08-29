import { verifyLocalMediaFile } from './productionJournal';

const mockInspectLocalMediaFile = jest.fn();
const mockExistingUris = new Set<string>();

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: jest.fn(),
  File: jest.fn().mockImplementation((...parts: unknown[]) => {
    const uri = parts.map(String).join('/');
    return { uri, exists: mockExistingUris.has(uri) };
  }),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'synthetic-uuid') }));

jest.mock('~/db', () => ({
  cloudConflicts: {},
  cloudSyncState: {},
  cloudTombstones: {},
  customPrompts: {},
  db: {},
  entries: {},
  entryTags: {},
  mediaAssets: {},
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
  openMediaUploadSource: jest.fn(),
}));

describe('verifyLocalMediaFile', () => {
  beforeEach(() => {
    mockExistingUris.clear();
    mockInspectLocalMediaFile.mockReset();
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
