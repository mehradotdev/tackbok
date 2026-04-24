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
import {
  BACKUP_ENTRIES_PATH,
  BACKUP_MANIFEST_PATH,
  BACKUP_PROFILE_PATH,
} from '../backupImport/types';

let exportToBackupZip: () => Promise<void>;

type PortableEntryMock = {
  noteId: string;
  textTitle: string;
  textContent: string;
  mood: null;
  tagTitles: string[];
  createdAt: number;
  updatedAt: number;
  assets: {
    type: string;
    path: string;
    width?: number;
    height?: number;
  }[];
};

const mockAddFile = mock(async (_path: string, _file: unknown): Promise<void> => {});
const mockAddText = mock(async (_path: string, _text: string): Promise<void> => {});
const mockClose = mock(async (): Promise<void> => {});
const mockAbort = mock(async (): Promise<void> => {});
const mockSaveGeneratedZipFile = mock(
  async (_file: unknown, _name: string): Promise<void> => {},
);
const mockGetRelativeAssetFile = mock((relativeUri: string) => ({
  exists: true,
  uri: relativeUri,
}));
const mockGetState = mock(() => ({
  profileName: 'Ada',
  profileEmail: 'ada@example.com',
  profileImageUri: 'photos/profile.jpg',
}));
const mockCreatePortableEntries = mock(
  (
    _allEntries: unknown,
    _tagMap: unknown,
  ): {
    portableEntries: PortableEntryMock[];
    photoCount: number;
    audioCount: number;
  } => ({
    portableEntries: [],
    photoCount: 0,
    audioCount: 0,
  }),
);
const mockCreatePortableTags = mock((_allTags: unknown): unknown[] => []);
const mockCreatePortablePrompts = mock((_allPrompts: unknown): unknown[] => []);

mock.module('expo-file-system', () => ({
  File: class MockFile {
    exists = true;

    constructor(...args: string[]) {
      this.uri = args.join('/');
    }

    uri: string;

    delete() {
      this.exists = false;
    }
  },
  Paths: {
    cache: '/tmp',
  },
}));

mock.module('~/db', () => {
  const entries = { created_at: 'created_at' };

  return {
    db: {
      select: mock(() => ({
        from: mock((table: unknown) => {
          if (table === entries) {
            return {
              orderBy: mock(async () => []),
            };
          }

          return Promise.resolve([]);
        }),
      })),
    },
    customPrompts: {},
    entries,
    tags: {},
  };
});

mock.module('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => mockGetState(),
  },
}));

mock.module('~/lib/zip', () => ({
  createExpoZipWriter: (outputFile: unknown) => ({
    outputFile,
    addBytes: mock(() => {}),
    addText: mockAddText,
    addStored: mock(() => {}),
    addFile: mockAddFile,
    close: mockClose,
    abort: mockAbort,
  }),
  hasZipEntry: (zip: { hasEntry: (path: string) => boolean }, path: string) =>
    zip.hasEntry(path),
  findZipEntryPathByBasename: (
    zip: { listEntries: () => { path: string }[] },
    basename: string,
  ) => {
    const match = zip
      .listEntries()
      .find((entry) => entry.path.split('/').at(-1) === basename);

    return match?.path ?? null;
  },
  createExpoZipReaderSource: (uri: string) => ({ uri }),
  openZipReader: async (_source: unknown) => ({
    listEntries: () => [],
    hasEntry: () => false,
    getEntryInfo: () => null,
    readEntryBytes: async () => new Uint8Array(),
    readEntryText: async () => '',
    readEntryJson: async () => ({}),
    close: async () => {},
  }),
}));

mock.module('../backupImport/archiveUtils', () => ({
  VALID_MOODS: new Set(['Joyful', 'Calm', 'Neutral', 'Anxious', 'Sad', 'Angry']),
  generateTimestamp: mock(() => '2026-04-22T10-00-00'),
  normalizeOptionalText: mock((value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }),
  assertSafeArchivePath: (path: string) => path,
  cleanupImportedFiles: (_relativeUris: string[]) => {},
  writeImportedPhoto: async (_bytes: Uint8Array, _path: string) => ({
    type: 'IMAGE',
    uri: 'photos/mock.jpg',
    width: 1,
    height: 1,
  }),
  writeImportedAudio: (_bytes: Uint8Array, _path: string) => ({
    type: 'AUDIO',
    uri: 'voice-memos/mock.m4a',
  }),
  saveZipFile: async (_zipBytes: Uint8Array, _fileName: string) => {},
  saveGeneratedZipFile: (file: unknown, fileName: string) =>
    mockSaveGeneratedZipFile(file, fileName),
  readSafeZipJson: async <T>(_zip: unknown, _path: string): Promise<T> => {
    throw new Error('readSafeZipJson mock is not configured for this test');
  },
  readSafeZipBytes: async (_zip: unknown, _path: string): Promise<Uint8Array> =>
    new Uint8Array(),
  loadZipFromUri: async (_uri: string) => ({
    listEntries: () => [],
    hasEntry: () => false,
    getEntryInfo: () => null,
    readEntryBytes: async () => new Uint8Array(),
    readEntryText: async () => '',
    readEntryJson: async () => ({}),
    close: async () => {},
  }),
  isZipFile: async (_uri: string) => true,
  buildTagIdToNameMap: mock(async () => new Map()),
  resolveTagIdsToTitles: (_tagIds: string, _tagMap: Map<string, string>) => [],
  getRelativeAssetFile: (relativeUri: string) => mockGetRelativeAssetFile(relativeUri),
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
}));

mock.module('./portable', () => ({
  createPortableEntries: (allEntries: unknown, tagMap: unknown) =>
    mockCreatePortableEntries(allEntries, tagMap),
  createPortablePrompts: (allPrompts: unknown) => mockCreatePortablePrompts(allPrompts),
  createPortableTags: (allTags: unknown) => mockCreatePortableTags(allTags),
}));

describe('exportToBackupZip', () => {
  beforeAll(async () => {
    ({ exportToBackupZip } = await import('./tackbok'));
  });

  beforeEach(() => {
    mockAddFile.mockReset();
    mockAddText.mockReset();
    mockClose.mockReset();
    mockAbort.mockReset();
    mockSaveGeneratedZipFile.mockReset();
    mockGetRelativeAssetFile.mockReset();
    mockGetState.mockReset();
    mockCreatePortableEntries.mockReset();
    mockCreatePortableTags.mockReset();
    mockCreatePortablePrompts.mockReset();

    mockGetState.mockReturnValue({
      profileName: 'Ada',
      profileEmail: 'ada@example.com',
      profileImageUri: 'photos/profile.jpg',
    });
    mockCreatePortableEntries.mockReturnValue({
      portableEntries: [
        {
          noteId: 'entry-1',
          textTitle: 'Title',
          textContent: 'Body',
          mood: null,
          tagTitles: [],
          createdAt: 1,
          updatedAt: 2,
          assets: [
            { type: 'image', path: 'media/photos/photo-1.jpg', width: 10, height: 20 },
            { type: 'audio', path: 'media/voice-memos/memo-1.m4a' },
          ],
        },
      ],
      photoCount: 1,
      audioCount: 1,
    });
    mockCreatePortableTags.mockReturnValue([]);
    mockCreatePortablePrompts.mockReturnValue([]);
    mockGetRelativeAssetFile.mockImplementation((relativeUri: string) => ({
      exists: true,
      uri: relativeUri,
    }));
    mockAddFile.mockImplementation(async (path: string) => {
      if (path === 'media/photos/photo-1.jpg') {
        throw new Error('photo unreadable');
      }

      if (path === 'media/profile/profile.jpg') {
        throw new Error('profile unreadable');
      }
    });
    mockAddText.mockResolvedValue();
    mockClose.mockResolvedValue();
    mockAbort.mockResolvedValue();
    mockSaveGeneratedZipFile.mockResolvedValue();
  });

  test('skips unreadable media files and keeps exported metadata consistent', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    await exportToBackupZip();

    expect(mockAddFile).toHaveBeenCalledWith(
      'media/photos/photo-1.jpg',
      expect.objectContaining({ uri: 'photos/photo-1.jpg' }),
    );
    expect(mockAddFile).toHaveBeenCalledWith(
      'media/voice-memos/memo-1.m4a',
      expect.objectContaining({ uri: expect.stringMatching(/memo-1\.m4a$/) }),
    );
    expect(mockAddFile).toHaveBeenCalledWith(
      'media/profile/profile.jpg',
      expect.objectContaining({ uri: 'photos/profile.jpg' }),
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);

    const entriesJson = JSON.parse(
      mockAddText.mock.calls.find(([path]) => path === BACKUP_ENTRIES_PATH)?.[1] ?? 'null',
    );
    const profileJson = JSON.parse(
      mockAddText.mock.calls.find(([path]) => path === BACKUP_PROFILE_PATH)?.[1] ?? 'null',
    );
    const manifestJson = JSON.parse(
      mockAddText.mock.calls.find(([path]) => path === BACKUP_MANIFEST_PATH)?.[1] ?? 'null',
    );

    expect(entriesJson).toEqual([
      {
        noteId: 'entry-1',
        textTitle: 'Title',
        textContent: 'Body',
        mood: null,
        tagTitles: [],
        createdAt: 1,
        updatedAt: 2,
        assets: [{ type: 'audio', path: 'media/voice-memos/memo-1.m4a' }],
      },
    ]);
    expect(profileJson).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      imagePath: null,
    });
    expect(manifestJson.counts).toEqual({
      entries: 1,
      tags: 0,
      customPrompts: 0,
      photos: 0,
      voiceMemos: 1,
    });
    expect(mockClose).toHaveBeenCalled();
    expect(mockAbort).not.toHaveBeenCalled();
    expect(mockSaveGeneratedZipFile).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  afterAll(() => {
    mock.restore();
  });
});
