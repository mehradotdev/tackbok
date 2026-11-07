import { addCloudSyncMutationListener } from '~/lib/cloudSync/runtime/mutationSignal';
import { importFromGratitudeAppBackup } from './gratitudeApp';

const tx = {
  select: jest.fn(() => ({ from: jest.fn(async () => []) })),
};
const mockTransaction = jest.fn(
  async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
);
const mockUpdateProfileInTransaction = jest.fn(
  async (_tx?: unknown, _profile?: unknown) => undefined,
);
const mockSetProfileName = jest.fn(async (_name: string | null) => undefined);
const mockSetProfileEmail = jest.fn(async (_email: string | null) => undefined);
const mockSetState = jest.fn((_state: unknown) => undefined);
const mockCleanupImportedFiles = jest.fn((_relativeUris: string[]): void => {});
const mockProfile = {
  name: 'Mehra' as string | null,
  hasEmail: false,
  email: null as string | null,
  imagePath: 'profile.jpg' as string | null,
};

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

jest.mock('~/db', () => ({
  entries: { note_id: 'note_id' },
  runExclusiveDbTransaction: (callback: (transaction: typeof tx) => Promise<unknown>) =>
    mockTransaction(callback),
}));

jest.mock('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => ({
      setProfileName: (name: string | null) => mockSetProfileName(name),
      setProfileEmail: (email: string | null) => mockSetProfileEmail(email),
      // Mirrors the store: commit the profile row, then refresh the cache.
      setProfileImageUri: async (photoUri: string | null) => {
        await mockTransaction((transaction) =>
          mockUpdateProfileInTransaction(transaction, { photoUri }),
        );
        mockSetState({ profileImageUri: photoUri });
      },
    }),
    setState: (state: unknown) => mockSetState(state),
  },
}));

// The real transaction helper runs so its commit contract is exercised.
jest.mock('~/lib/cloudSync/storage/repositories', () => ({
  ...jest.requireActual('~/lib/cloudSync/storage/repositories'),
  updateProfileInTransaction: (txArg: unknown, profile: unknown) =>
    mockUpdateProfileInTransaction(txArg, profile),
}));

jest.mock('../archiveUtils', () => ({
  cleanupImportedFiles: (relativeUris: string[]) =>
    mockCleanupImportedFiles(relativeUris),
  isZipFile: () => true,
  loadZipFromUri: async () => ({ close: async () => undefined }),
  readSafeZipBytes: async () => new Uint8Array(),
  writeImportedPhoto: async () => ({ uri: 'photos/imported.jpg' }),
}));

jest.mock('../portable', () => ({
  buildGratitudeAppPortablePayload: async () => ({
    portableEntries: [],
    portablePrompts: [],
    portableTags: [],
    profile: mockProfile,
  }),
  ensurePortablePromptTitles: async () => new Set(),
  importPortableEntries: async () => undefined,
  upsertPortableTags: async () => new Map(),
}));

describe('importFromGratitudeAppBackup profile photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the committed profile photo when the cache refresh fails', async () => {
    mockSetState.mockImplementationOnce(() => {
      throw new Error('cache write failed');
    });

    const summary = await importFromGratitudeAppBackup('backup.zip', 'skip');

    expect(mockUpdateProfileInTransaction).toHaveBeenCalledWith(tx, {
      photoUri: 'photos/imported.jpg',
    });
    expect(mockCleanupImportedFiles).not.toHaveBeenCalled();
    expect(summary.warnings).toEqual([
      expect.objectContaining({ kind: 'profile-settings' }),
    ]);
  });

  it('keeps the committed profile photo when post-commit work fails', async () => {
    let commits = 0;
    const countingCommit = async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      const result = await callback(tx);
      commits += 1;
      return result;
    };
    mockTransaction
      .mockImplementationOnce(countingCommit)
      .mockImplementationOnce(countingCommit);
    // The second commit is the profile photo write.
    const subscription = addCloudSyncMutationListener(() => {
      if (commits === 2) throw new Error('listener failed after commit');
    });

    try {
      const summary = await importFromGratitudeAppBackup('backup.zip', 'skip');

      expect(commits).toBe(2);
      expect(mockSetState).toHaveBeenCalledWith({
        profileImageUri: 'photos/imported.jpg',
      });
      expect(mockCleanupImportedFiles).not.toHaveBeenCalled();
      expect(summary.warnings).toEqual([]);
    } finally {
      subscription.remove();
    }
  });

  it('removes the imported photo when its profile write fails', async () => {
    mockUpdateProfileInTransaction.mockRejectedValueOnce(new Error('write failed'));

    await importFromGratitudeAppBackup('backup.zip', 'skip');

    expect(mockSetState).not.toHaveBeenCalled();
    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/imported.jpg']);
  });

  it('removes the imported photo when an earlier profile setting fails', async () => {
    mockSetProfileName.mockRejectedValueOnce(new Error('name failed'));

    await importFromGratitudeAppBackup('backup.zip', 'skip');

    expect(mockUpdateProfileInTransaction).not.toHaveBeenCalled();
    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/imported.jpg']);
  });
});
