import {
  BACKUP_ENTRIES_PATH,
  BACKUP_MANIFEST_PATH,
  BACKUP_PROFILE_PATH,
} from '../backupImport/types';
import { exportToBackupZip } from './tackbok';

const spyOn = jest.spyOn;

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

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

const mockAddFile = jest.fn(async (_path: string, _file: unknown): Promise<void> => {});
const mockAddText = jest.fn(async (_path: string, _text: string): Promise<void> => {});
const mockClose = jest.fn(async (): Promise<void> => {});
const mockAbort = jest.fn(async (): Promise<void> => {});
const mockSaveGeneratedZipFile = jest.fn(
  async (
    _file: unknown,
    _name: string,
  ): Promise<'delete-immediately' | 'defer-cleanup'> => 'delete-immediately',
);
const mockCleanupDeferredBackupZipFiles = jest.fn(
  (_minAgeMs?: number, _now?: number) => {},
);
const mockGetRelativeAssetFile = jest.fn((relativeUri: string) => ({
  exists: true,
  uri: relativeUri,
}));
const mockGetState = jest.fn(() => ({
  profileName: 'Ada',
  profileEmail: 'ada@example.com',
  profileImageUri: 'photos/profile.jpg',
}));
const mockCreatePortableEntries = jest.fn(
  (
    _allEntries: unknown,
    _tagMap: unknown,
  ): {
    portableEntries: PortableEntryMock[];
  } => ({
    portableEntries: [],
  }),
);
const mockCreatePortableTags = jest.fn((_allTags: unknown): unknown[] => []);
const mockCreatePortablePrompts = jest.fn((_allPrompts: unknown): unknown[] => []);

// Keep this mock inline: this export suite only needs a tiny File shape and should
// not couple itself to the shared expo-file-system manual mock.
jest.mock('expo-file-system', () => ({
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

jest.mock('~/db', () => {
  const mockEntries = { created_at: 'created_at' };
  const mockUserProfile = {};

  return {
    db: {
      select: jest.fn(() => ({
        from: jest.fn((table: unknown) => {
          if (table === mockEntries) {
            return {
              orderBy: jest.fn(async () => []),
            };
          }

          if (table === mockUserProfile) {
            return { limit: jest.fn(async () => []) };
          }

          return Promise.resolve([]);
        }),
      })),
    },
    customPrompts: {},
    entries: mockEntries,
    entryTags: {},
    mediaAssets: {},
    tags: {},
    userProfile: mockUserProfile,
  };
});

jest.mock('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => mockGetState(),
  },
}));

jest.mock('~/lib/zip', () => ({
  createExpoZipWriter: (outputFile: unknown) => ({
    outputFile,
    addBytes: jest.fn(() => {}),
    addText: mockAddText,
    addStored: jest.fn(() => {}),
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
  createZipEntryLookup: (zip: {
    hasEntry: (path: string) => boolean;
    listEntries: () => { path: string }[];
  }) => ({
    hasPath: (path: string) => zip.hasEntry(path),
    findByBasename: (basename: string) => {
      const safeBasename = basename.trim();
      if (!safeBasename) {
        return null;
      }

      const match = zip
        .listEntries()
        .find((entry) => entry.path.split('/').at(-1) === safeBasename);

      return match?.path ?? null;
    },
    findByDirectoryAndBasename: (dirName: string, basename: string) => {
      const safeDirName = dirName.trim();
      const safeBasename = basename.trim();
      if (!safeDirName || !safeBasename) {
        return null;
      }

      const match = zip.listEntries().find((entry) => {
        const segments = entry.path.split('/');
        return segments.includes(safeDirName) && segments.at(-1) === safeBasename;
      });

      return match?.path ?? null;
    },
  }),
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

jest.mock('../backupImport/archiveUtils', () => ({
  VALID_MOODS: new Set(['Joyful', 'Calm', 'Neutral', 'Anxious', 'Sad', 'Angry']),
  normalizeOptionalText: jest.fn((value: string | null | undefined) => {
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
  isZipFile: (_uri: string) => true,
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
}));

jest.mock('./utils', () => ({
  generateTimestamp: jest.fn(() => '2026-04-22T10-00-00'),
  saveOrShareZipFile: (file: unknown, fileName: string) =>
    mockSaveGeneratedZipFile(file, fileName),
  cleanupDeferredBackupZipFiles: (minAgeMs?: number, now?: number) =>
    mockCleanupDeferredBackupZipFiles(minAgeMs, now),
  buildTagIdToNameMap: jest.fn(async () => new Map()),
  resolveTagIdsToTitles: (_tagIds: string, _tagMap: Map<string, string>) => [],
  getRelativeAssetFile: (relativeUri: string) => mockGetRelativeAssetFile(relativeUri),
  createArchiveAssetPath: (_type: string, relativeUri: string) =>
    `media/photos/${relativeUri}`,
  assetFileExists: (_asset: unknown) => true,
}));

jest.mock('./portable', () => ({
  createPortableEntries: (allEntries: unknown, tagMap: unknown) =>
    mockCreatePortableEntries(allEntries, tagMap),
  createPortablePrompts: (allPrompts: unknown) => mockCreatePortablePrompts(allPrompts),
  createPortableTags: (allTags: unknown) => mockCreatePortableTags(allTags),
}));

describe('exportToBackupZip', () => {
  beforeEach(() => {
    mockAddFile.mockReset();
    mockAddText.mockReset();
    mockClose.mockReset();
    mockAbort.mockReset();
    mockSaveGeneratedZipFile.mockReset();
    mockCleanupDeferredBackupZipFiles.mockReset();
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
    mockSaveGeneratedZipFile.mockResolvedValue('delete-immediately');
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
      mockAddText.mock.calls.find(([path]) => path === BACKUP_ENTRIES_PATH)?.[1] ??
        'null',
    );
    const profileJson = JSON.parse(
      mockAddText.mock.calls.find(([path]) => path === BACKUP_PROFILE_PATH)?.[1] ??
        'null',
    );
    const manifestJson = JSON.parse(
      mockAddText.mock.calls.find(([path]) => path === BACKUP_MANIFEST_PATH)?.[1] ??
        'null',
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
      photoAssetId: null,
      photoBlobHash: null,
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
    expect(mockCleanupDeferredBackupZipFiles).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test('keeps the temp zip file when sharing defers cleanup', async () => {
    mockAddFile.mockImplementation(async () => {});
    mockSaveGeneratedZipFile.mockResolvedValue('defer-cleanup');

    await exportToBackupZip();

    const sharedFile = mockSaveGeneratedZipFile.mock.calls[0]?.[0] as { exists: boolean };
    expect(sharedFile.exists).toBe(true);
  });
});
