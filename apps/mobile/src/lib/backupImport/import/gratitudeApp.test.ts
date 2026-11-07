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
const mockMarkLocalProfileTouched = jest.fn(async (_tx?: unknown) => undefined);
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

jest.mock('~/db', () => ({
  entries: { note_id: 'note_id' },
}));

jest.mock('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => ({
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

jest.mock('~/lib/cloudSync/storage/repositories', () => ({
  runInCloudSyncTransaction: (callback: (transaction: typeof tx) => Promise<unknown>) =>
    mockTransaction(callback),
  updateProfileInTransaction: (txArg: unknown, profile: unknown) =>
    mockUpdateProfileInTransaction(txArg, profile),
  markLocalProfileTouched: (txArg: unknown) => mockMarkLocalProfileTouched(txArg),
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
    mockProfile.name = 'Mehra';
    mockProfile.imagePath = 'profile.jpg';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the committed profile photo when the cache refresh fails', async () => {
    mockProfile.name = null;
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

  it('removes the imported photo when its profile write fails', async () => {
    mockUpdateProfileInTransaction.mockRejectedValueOnce(new Error('write failed'));

    await importFromGratitudeAppBackup('backup.zip', 'skip');

    expect(mockSetState).not.toHaveBeenCalled();
    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/imported.jpg']);
  });

  it('removes the imported photo when an earlier profile setting fails', async () => {
    mockUpdateProfileInTransaction.mockRejectedValueOnce(new Error('name failed'));

    await importFromGratitudeAppBackup('backup.zip', 'skip');

    expect(mockUpdateProfileInTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfileInTransaction).toHaveBeenCalledWith(tx, {
      displayName: 'Mehra',
    });
    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/imported.jpg']);
  });
});

describe('importFromGratitudeAppBackup profile name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile.imagePath = null;
  });

  it('ends pristine status in the same transaction as an explicit empty name', async () => {
    mockProfile.name = '  ';
    const order: string[] = [];
    // The first transaction imports entries; the second writes the profile.
    mockTransaction
      .mockImplementationOnce(async (callback) => callback(tx))
      .mockImplementationOnce(async (callback) => {
        order.push('begin');
        const result = await callback(tx);
        order.push('commit');
        return result;
      });
    mockUpdateProfileInTransaction.mockImplementationOnce(async () => {
      order.push('write');
    });
    mockMarkLocalProfileTouched.mockImplementationOnce(async () => {
      order.push('touch');
    });

    const summary = await importFromGratitudeAppBackup('backup.zip', 'overwrite');

    expect(summary.warnings).toEqual([]);
    expect(mockUpdateProfileInTransaction).toHaveBeenCalledWith(tx, {
      displayName: null,
    });
    expect(mockMarkLocalProfileTouched).toHaveBeenCalledWith(tx);
    expect(order).toEqual(['begin', 'write', 'touch', 'commit']);
    expect(mockSetState).toHaveBeenCalledWith({ profileName: null });
  });

  it('leaves the profile untouched when the backup has no name', async () => {
    mockProfile.name = null;

    await importFromGratitudeAppBackup('backup.zip', 'overwrite');

    expect(mockUpdateProfileInTransaction).not.toHaveBeenCalled();
    expect(mockMarkLocalProfileTouched).not.toHaveBeenCalled();
  });
});
