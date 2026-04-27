import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';

let importFromTackbokBackup: (
  uri: string,
  mode: 'skip' | 'overwrite',
) => Promise<{
  failedProfileAssets: number;
  warnings: Record<string, unknown>[];
}>;

const txSelectFrom = mock(async (_table: unknown): Promise<{ note_id: string }[]> => []);
const txSelect = mock(() => ({ from: txSelectFrom }));
const tx = { select: txSelect };
const mockTransaction = mock(
  async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
);
const mockIsZipFile = mock((_uri: string): boolean => true);
const mockLoadZipFromUri = mock(
  async (_uri: string): Promise<{ close: () => Promise<void> }> => ({
    close: mock(async () => undefined),
  }),
);
const mockReadSafeZipJson = mock(
  async (_zip: unknown, _path: string): Promise<unknown> => undefined,
);
const mockReadSafeZipBytes = mock(async (_zip: unknown, _path: string) => new Uint8Array());
const mockWriteImportedPhoto = mock(
  async (_bytes: Uint8Array, _path: string): Promise<{ uri: string }> => ({
    uri: 'photos/imported.jpg',
  }),
);
const mockCleanupImportedFiles = mock((_relativeUris: string[]): void => {});
const mockUpsertPortableTags = mock(
  async (_tx: unknown, _portableTags: unknown, _summary: unknown): Promise<Map<string, string>> =>
    new Map(),
);
const mockEnsurePortablePromptTitles = mock(
  async (_tx: unknown, _portablePrompts: unknown, _summary: unknown): Promise<Set<string>> =>
    new Set(),
);
const mockImportPortableEntries = mock(
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
const mockApplyImportedProfile = mock((_profile: unknown, _imageUri: string | null) => {});
const mockGetImportTotals = mock(() => ({ totalEntries: 0, totalTags: 0, totalPrompts: 0 }));

mock.module('~/db', () => ({
  db: {
    transaction: (callback: (transaction: typeof tx) => Promise<void>) =>
      mockTransaction(callback),
  },
  entries: { note_id: 'note_id' },
}));

mock.module('react-native', () => ({
  Image: {
    getSize: (_uri: string, onSuccess: (width: number, height: number) => void) =>
      onSuccess(1, 1),
  },
  Platform: { OS: 'ios' },
}));

mock.module('expo-file-system', () => ({
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

mock.module('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => undefined,
}));

mock.module('~/lib/photoUtils', () => ({
  deletePhotoFile: () => {},
  photoFileExists: () => true,
}));

mock.module('~/lib/voiceMemoUtils', () => ({
  deleteVoiceMemoFile: () => {},
  voiceMemoFileExists: () => true,
}));

const archiveUtilsMockFactory = () => ({
  VALID_MOODS: new Set(['Joyful', 'Calm', 'Neutral', 'Anxious', 'Sad', 'Angry']),
  generateTimestamp: () => '2026-04-22T10-00-00',
  normalizeOptionalText: (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  },
  assertSafeArchivePath: (path: string) => path,
  cleanupImportedFiles: (relativeUris: string[]) => mockCleanupImportedFiles(relativeUris),
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
  createArchiveAssetPath: (_type: string, relativeUri: string) => `media/photos/${relativeUri}`,
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
  deriveGratitudeTitle: (noteText: string | null | undefined) => {
    const trimmed = noteText?.trim();
    return trimmed ? trimmed : null;
  },
  writeImportedPhoto: (bytes: Uint8Array, path: string) => mockWriteImportedPhoto(bytes, path),
});

mock.module('../archiveUtils', archiveUtilsMockFactory);
mock.module('../archiveUtils.ts', archiveUtilsMockFactory);

const portableMockFactory = () => ({
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
});

mock.module('../portable', portableMockFactory);
mock.module('../portable.ts', portableMockFactory);

const helpersMockFactory = () => ({
  applyImportedProfile: (profileArg: unknown, imageUriArg: string | null) =>
    mockApplyImportedProfile(profileArg, imageUriArg),
  getImportTotals: (...args: Parameters<typeof mockGetImportTotals>) =>
    mockGetImportTotals(...args),
});

mock.module('./helpers', helpersMockFactory);
mock.module('./helpers.ts', helpersMockFactory);

mock.module('../progress', () => ({
  reportImportProgress: mock(() => {}),
}));

describe('importFromTackbokBackup', () => {
  beforeAll(async () => {
    ({ importFromTackbokBackup } = await import('./tackbok'));
  });

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
    mockGetImportTotals.mockReset();

    txSelect.mockImplementation(() => ({ from: txSelectFrom }));
    txSelectFrom.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
    );
    mockIsZipFile.mockReturnValue(true);
    mockLoadZipFromUri.mockResolvedValue({
      close: mock(async () => undefined),
    });
    mockReadSafeZipJson
      .mockResolvedValueOnce({ format: 'tackbok-backup', backupVersion: 1 })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ name: 'Ada', email: null, imagePath: 'media/profile.jpg' });
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
    expect(mockApplyImportedProfile).toHaveBeenCalledWith(
      expect.objectContaining({ imagePath: 'media/profile.jpg' }),
      null,
    );
    expect(mockCleanupImportedFiles).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('keeps imported data and cleans up the copied profile image when applying profile fails', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    mockWriteImportedPhoto.mockResolvedValueOnce({ uri: 'photos/imported.jpg' });
    mockApplyImportedProfile.mockImplementationOnce(() => {
      throw new Error('settings write failed');
    });

    const summary = await importFromTackbokBackup('backup.zip', 'overwrite');

    expect(summary.failedProfileAssets).toBe(0);
    expect(mockImportPortableEntries).toHaveBeenCalledTimes(1);
    expect(mockApplyImportedProfile).toHaveBeenCalledWith(
      expect.objectContaining({ imagePath: 'media/profile.jpg' }),
      'photos/imported.jpg',
    );
    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/imported.jpg']);
    expect(warnSpy).toHaveBeenCalledWith(
      '[backupImport:tackbok] Imported entries, but could not apply imported profile settings.',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  afterAll(() => {
    mock.restore();
  });
});
