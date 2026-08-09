import { importFromTackbokBackup } from './tackbok';

const spyOn = jest.spyOn;

const txSelectFrom = jest.fn(
  async (_table: unknown): Promise<{ note_id: string }[]> => [],
);
const txSelect = jest.fn(() => ({ from: txSelectFrom }));
const tx = { select: txSelect };
const mockTransaction = jest.fn(
  async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
);
const mockIsZipFile = jest.fn((_uri: string): boolean => true);
const mockLoadZipFromUri = jest.fn(
  async (_uri: string): Promise<{ close: () => Promise<void> }> => ({
    close: jest.fn(async () => undefined),
  }),
);
const mockReadSafeZipJson = jest.fn(
  async (_zip: unknown, _path: string): Promise<unknown> => undefined,
);
const mockReadSafeZipBytes = jest.fn(
  async (_zip: unknown, _path: string) => new Uint8Array(),
);
const mockWriteImportedPhoto = jest.fn(
  async (_bytes: Uint8Array, _path: string): Promise<{ uri: string }> => ({
    uri: 'photos/imported.jpg',
  }),
);
const mockCleanupImportedFiles = jest.fn((_relativeUris: string[]): void => {});
const mockUpsertPortableTags = jest.fn(
  async (
    _tx: unknown,
    _portableTags: unknown,
    _summary: unknown,
  ): Promise<Map<string, string>> => new Map(),
);
const mockEnsurePortablePromptTitles = jest.fn(
  async (
    _tx: unknown,
    _portablePrompts: unknown,
    _summary: unknown,
  ): Promise<Set<string>> => new Set(),
);
const mockImportPortableEntries = jest.fn(
  async (
    _tx: unknown,
    _portableEntries: unknown,
    _existingNoteIds: unknown,
    _tagMap: unknown,
    _summary: unknown,
    _mode: unknown,
    _zip: unknown,
    _createdFiles: string[],
    _source: unknown,
  ): Promise<void> => undefined,
);
const mockApplyImportedProfile = jest.fn(
  (_profile: unknown, _imageUri: string | null) => {},
);
const mockGetImportTotals = jest.fn(() => ({
  totalEntries: 0,
  totalTags: 0,
  totalPrompts: 0,
}));
const mockHydrateProfileCache = jest.fn((_profile?: unknown) => undefined);
const mockUpdateProfileInTransaction = jest.fn(
  async (_tx?: unknown, _profile?: unknown, _context?: unknown) => undefined,
);

jest.mock('~/db', () => ({
  db: {
    transaction: (callback: (transaction: typeof tx) => Promise<void>) =>
      mockTransaction(callback),
  },
  entries: { note_id: 'note_id' },
}));

jest.mock('~/lib/settings', () => ({
  hydrateProfileCache: (profile: unknown) => mockHydrateProfileCache(profile),
}));

jest.mock('~/lib/cloudSync/storage/repositories', () => ({
  runInCloudSyncTransaction: (callback: (transaction: typeof tx) => Promise<void>) =>
    mockTransaction(callback),
  updateProfileInTransaction: (txArg: unknown, profile: unknown, context: unknown) =>
    mockUpdateProfileInTransaction(txArg, profile, context),
}));

jest.mock('react-native', () => ({
  Image: {
    getSize: (_uri: string, onSuccess: (width: number, height: number) => void) =>
      onSuccess(1, 1),
  },
  Platform: { OS: 'ios' },
}));

// Keep these mocks inline: the import flow needs a custom File/Directory surface
// for archive reads, which is intentionally narrower than the shared manual mocks.
jest.mock('expo-file-system', () => ({
  Directory: class MockDirectory {
    exists = true;
    create() {}
  },
  File: class MockFile {
    exists = true;
    uri = '/tmp/mock';
    size = 0;
    write(..._args: unknown[]) {}
    delete() {
      this.exists = false;
    }
    copy(..._args: unknown[]) {}
    open() {
      return {
        readBytes: (_length: number) => new Uint8Array(),
        close: () => {},
      };
    }
  },
  Paths: { document: '/tmp', cache: '/tmp' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => undefined,
}));

jest.mock('~/lib/photoUtils', () => ({
  deletePhotoFile: () => {},
  photoFileExists: () => true,
}));

jest.mock('~/lib/voiceMemoUtils', () => ({
  deleteVoiceMemoFile: () => {},
  voiceMemoFileExists: () => true,
}));

jest.mock('../archiveUtils', () => ({
  VALID_MOODS: new Set(['Joyful', 'Calm', 'Neutral', 'Anxious', 'Sad', 'Angry']),
  generateTimestamp: () => '2026-04-22T10-00-00',
  normalizeOptionalText: (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  },
  assertSafeArchivePath: (path: string) => path,
  cleanupImportedFiles: (relativeUris: string[]) =>
    mockCleanupImportedFiles(relativeUris),
  writeImportedAudio: (_bytes: Uint8Array, _path: string) => ({
    type: 'AUDIO',
    uri: 'voice-memos/mock.m4a',
  }),
  saveZipFile: async (_zipBytes: Uint8Array, _fileName: string) => {},
  saveGeneratedZipFile: async (_file: unknown, _fileName: string) => {},
  isZipFile: (uri: string) => mockIsZipFile(uri),
  loadZipFromUri: (uri: string) => mockLoadZipFromUri(uri),
  readSafeZipBytes: (zip: unknown, path: string) => mockReadSafeZipBytes(zip, path),
  readSafeZipJson: (zip: unknown, path: string) => mockReadSafeZipJson(zip, path),
  buildTagIdToNameMap: async () => new Map(),
  resolveTagIdsToTitles: (_tagIds: string, _tagMap: Map<string, string>) => [],
  getRelativeAssetFile: (_relativeUri: string) => null,
  createArchiveAssetPath: (_type: string, relativeUri: string) =>
    `media/photos/${relativeUri}`,
  assetFileExists: (_asset: unknown) => true,
  buildSubstantiveCheck: ({
    textTitle,
    textContent,
    mood,
    assets,
  }: {
    textTitle?: string | null;
    textContent?: string | null;
    mood?: string | null;
    assets?: unknown[];
  }) => Boolean(textTitle || textContent || mood || (assets?.length ?? 0) > 0),
  deriveGratitudeTitle: (
    noteText: string | null | undefined,
    prompt: string | null | undefined,
  ) => {
    const cleanPrompt = prompt?.replace(/\s+/g, ' ').trim();
    if (cleanPrompt) {
      return cleanPrompt;
    }

    const firstLine = noteText
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return firstLine ? firstLine.slice(0, 120) : null;
  },
  writeImportedPhoto: (bytes: Uint8Array, path: string) =>
    mockWriteImportedPhoto(bytes, path),
}));

jest.mock('../portable', () => ({
  ensurePortablePromptTitles: (
    txArg: unknown,
    portablePromptsArg: unknown,
    summaryArg: unknown,
  ) => mockEnsurePortablePromptTitles(txArg, portablePromptsArg, summaryArg),
  importPortableEntries: (
    txArg: unknown,
    portableEntriesArg: unknown,
    existingNoteIdsArg: unknown,
    tagMapArg: unknown,
    summaryArg: unknown,
    modeArg: unknown,
    zipArg: unknown,
    createdFilesArg: string[],
    sourceArg: unknown,
  ) =>
    mockImportPortableEntries(
      txArg,
      portableEntriesArg,
      existingNoteIdsArg,
      tagMapArg,
      summaryArg,
      modeArg,
      zipArg,
      createdFilesArg,
      sourceArg,
    ),
  upsertPortableTags: (txArg: unknown, portableTagsArg: unknown, summaryArg: unknown) =>
    mockUpsertPortableTags(txArg, portableTagsArg, summaryArg),
}));

jest.mock('./helpers', () => ({
  applyImportedProfile: (profileArg: unknown, imageUriArg: string | null) =>
    mockApplyImportedProfile(profileArg, imageUriArg),
  getImportTotals: (...args: Parameters<typeof mockGetImportTotals>) =>
    mockGetImportTotals(...args),
}));

jest.mock('../progress', () => ({
  reportImportProgress: jest.fn(() => {}),
}));

describe('importFromTackbokBackup', () => {
  beforeEach(() => {
    txSelectFrom.mockReset();
    txSelect.mockReset();
    mockTransaction.mockReset();
    mockIsZipFile.mockReset();
    mockLoadZipFromUri.mockReset();
    mockReadSafeZipJson.mockReset();
    mockReadSafeZipBytes.mockReset();
    mockWriteImportedPhoto.mockReset();
    mockCleanupImportedFiles.mockReset();
    mockUpsertPortableTags.mockReset();
    mockEnsurePortablePromptTitles.mockReset();
    mockImportPortableEntries.mockReset();
    mockApplyImportedProfile.mockReset();
    mockHydrateProfileCache.mockReset();
    mockUpdateProfileInTransaction.mockReset();
    mockUpdateProfileInTransaction.mockResolvedValue(undefined);
    mockGetImportTotals.mockReset();

    txSelect.mockImplementation(() => ({ from: txSelectFrom }));
    txSelectFrom.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
    );
    mockIsZipFile.mockReturnValue(true);
    mockLoadZipFromUri.mockResolvedValue({
      close: jest.fn(async () => undefined),
    });
    mockReadSafeZipJson
      .mockResolvedValueOnce({ format: 'tackbok-backup', backupVersion: 1 })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        name: 'Ada',
        email: null,
        imagePath: 'media/profile.jpg',
      });
    mockReadSafeZipBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockWriteImportedPhoto.mockRejectedValue(new Error('corrupt profile image'));
    mockUpsertPortableTags.mockResolvedValue(new Map());
    mockEnsurePortablePromptTitles.mockResolvedValue(new Set());
    mockImportPortableEntries.mockResolvedValue(undefined);
  });

  test('continues restoring entries when the profile image cannot be imported', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await importFromTackbokBackup('backup.zip', 'overwrite');

    expect(summary.failedProfileAssets).toBe(1);
    expect(summary.warnings[0]).toMatchObject({
      kind: 'profile-asset',
      assetPath: 'media/profile.jpg',
    });
    expect(mockImportPortableEntries).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfileInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ displayName: 'Ada', photoUri: null }),
      expect.objectContaining({ batchId: expect.any(String) }),
    );
    expect(mockHydrateProfileCache).toHaveBeenCalledWith(
      expect.objectContaining({ profileName: 'Ada', profileImageUri: null }),
    );
    expect(mockCleanupImportedFiles).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('rolls back the import and cleans up the copied profile image when profile persistence fails', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    mockWriteImportedPhoto.mockResolvedValueOnce({ uri: 'photos/imported.jpg' });
    mockUpdateProfileInTransaction.mockRejectedValueOnce(
      new Error('profile write failed'),
    );

    await expect(
      importFromTackbokBackup('backup.zip', 'overwrite'),
    ).rejects.toThrow('profile write failed');
    expect(mockImportPortableEntries).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfileInTransaction).toHaveBeenCalled();
    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/imported.jpg']);

    warnSpy.mockRestore();
  });
});
