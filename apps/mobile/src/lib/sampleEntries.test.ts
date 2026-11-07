import { seedSampleEntries } from './sampleEntries';

const mockTx = {
  select: () => ({ from: async () => [] }),
};
const mockWrites: string[] = [];
const mockDeleted: string[] = [];
let mockRestoring = false;
let mockReleaseAssets: () => void = () => undefined;
let mockAssetGate: Promise<void> = Promise.resolve();
const mockSettings = {
  journalFocusAreas: [],
  setSampleEntryIds: jest.fn(),
  setSampleEntriesBannerDismissed: jest.fn(),
};

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({ downloadAsync: () => mockAssetGate, uri: 'asset://sample' }),
  },
}));
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockId}` }));
jest.mock('expo-file-system', () => ({
  Directory: class {
    exists = true;
  },
  File: class {
    exists = true;
    mockPath: string;
    constructor(_parent: unknown, path: string) {
      this.mockPath = path;
    }
    async copy() {}
    delete() {
      mockDeleted.push(this.mockPath);
    }
  },
  Paths: { document: 'documents' },
}));
jest.mock('~/constants', () => ({
  PHOTOS_DIR_NAME: 'photos',
  VOICE_MEMOS_DIR_NAME: 'voice',
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: { getState: () => mockSettings },
}));
jest.mock('~/lib/entryDeletion', () => ({}));
jest.mock('~/db', () => ({ tags: {} }));
jest.mock('~/db/queries', () => ({}));
jest.mock('~/lib/cloudSync/ui/restoreInProgress', () => ({
  // Answers for the executor it is given, at the moment it is asked.
  isCloudRestoreInProgress: async (executor: unknown) =>
    executor === mockTx ? mockRestoring : true,
}));
jest.mock('~/lib/cloudSync/storage/repositories', () => ({
  runInCloudSyncTransaction: async (operation: (tx: unknown) => Promise<unknown>) =>
    operation(mockTx),
  createTagInTransaction: async (_tx: unknown, title: string) => `tag:${title}`,
  upsertEntryInTransaction: async (_tx: unknown, entry: { note_id: string }) => {
    mockWrites.push(entry.note_id);
  },
}));

const t = ((key: string) => key) as Parameters<typeof seedSampleEntries>[0];

beforeEach(() => {
  mockWrites.length = 0;
  mockDeleted.length = 0;
  mockRestoring = false;
  mockAssetGate = Promise.resolve();
  jest.clearAllMocks();
});

test('seeds four entries and tracks them for the removal banner', async () => {
  const ids = await seedSampleEntries(t);
  expect(ids).toHaveLength(4);
  expect(mockWrites).toEqual(ids);
  expect(mockSettings.setSampleEntryIds).toHaveBeenCalledWith(ids);
  expect(mockSettings.setSampleEntriesBannerDismissed).toHaveBeenCalledWith(false);
  expect(mockDeleted).toEqual([]);
});

test('writes nothing if a restore commits while the bundled media is loading', async () => {
  mockAssetGate = new Promise<void>((resolve) => {
    mockReleaseAssets = resolve;
  });
  const seeding = seedSampleEntries(t);
  // The restore commits after Finish was tapped, before the media is ready.
  mockRestoring = true;
  mockReleaseAssets();
  await expect(seeding).resolves.toEqual([]);
  expect(mockWrites).toEqual([]);
  expect(mockSettings.setSampleEntryIds).not.toHaveBeenCalled();
  // The copied sample files are not left behind.
  expect(mockDeleted).toHaveLength(3);
});
