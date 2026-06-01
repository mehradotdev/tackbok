import type { ZipEntryInfo, ZipReader } from '~/lib/zip';
import { AssetType, type Asset } from '~/types';
import {
  buildGratitudeAppPortablePayload,
  importPortableEntries,
  upsertPortableTags,
} from './portable';
import { createBackupImportSummary } from './summary';

const spyOn = jest.spyOn;

const mockReadSafeZipBytes = jest.fn(
  async (_zip: ZipReader, _path: string) => new Uint8Array(),
);
const mockWriteImportedPhoto = jest.fn(
  async (_bytes: Uint8Array, _path: string): Promise<Asset> => ({
    type: AssetType.IMAGE,
    uri: 'photos/imported.jpg',
    width: 10,
    height: 10,
  }),
);
const mockWriteImportedAudio = jest.fn(
  (_bytes: Uint8Array, _path: string): Asset => ({
    type: AssetType.AUDIO,
    uri: 'voice-memos/imported.m4a',
  }),
);
const mockCleanupImportedFiles = jest.fn((_relativeUris: string[]): void => {});

jest.mock('~/db', () => ({
  db: {},
  customPrompts: {},
  entries: { note_id: 'note_id' },
  tags: {},
}));

jest.mock('react-native', () => ({
  Image: {
    getSize: (_uri: string, onSuccess: (width: number, height: number) => void) =>
      onSuccess(1, 1),
  },
  Platform: { OS: 'ios' },
}));

// Keep these mocks inline: the portable import tests need extra file APIs such as
// open().readBytes() that are more specific than the shared manual mocks.
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

jest.mock('./archiveUtils', () => ({
  VALID_MOODS: new Set(['Joyful', 'Calm', 'Neutral', 'Anxious', 'Sad', 'Angry']),
  generateTimestamp: () => '2026-04-22T10-00-00',
  normalizeOptionalText: (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  },
  assertSafeArchivePath: (path: string) => path,
  buildSubstantiveCheck: ({
    textTitle,
    textContent,
    mood,
    assets,
  }: {
    textTitle?: string | null;
    textContent?: string | null;
    mood?: string | null;
    assets?: Asset[];
  }) => Boolean(textTitle || textContent || mood || (assets?.length ?? 0) > 0),
  cleanupImportedFiles: (relativeUris: string[]) =>
    mockCleanupImportedFiles(relativeUris),
  writeImportedPhoto: (bytes: Uint8Array, path: string) =>
    mockWriteImportedPhoto(bytes, path),
  writeImportedAudio: (bytes: Uint8Array, path: string) =>
    mockWriteImportedAudio(bytes, path),
  saveZipFile: async (_zipBytes: Uint8Array, _fileName: string) => {},
  saveGeneratedZipFile: async (_file: unknown, _fileName: string) => {},
  readSafeZipJson: <T>(zip: ZipReader, path: string) => zip.readEntryJson<T>(path),
  readSafeZipBytes: (zip: ZipReader, path: string) => mockReadSafeZipBytes(zip, path),
  loadZipFromUri: async (_uri: string) => mockCreateFakeStreamingZipArchive({}),
  isZipFile: (_uri: string) => true,
  buildTagIdToNameMap: async () => new Map(),
  resolveTagIdsToTitles: (_tagIds: string, _tagMap: Map<string, string>) => [],
  getRelativeAssetFile: (_relativeUri: string) => null,
  createArchiveAssetPath: (_type: string, relativeUri: string) =>
    `media/photos/${relativeUri}`,
  assetFileExists: (_asset: unknown) => true,
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

function mockCreateFakeStreamingZipArchive(
  entries: Record<string, string | Uint8Array>,
): ZipReader {
  const byteEntries = new Map(
    Object.entries(entries).map(([path, value]) => [
      path,
      typeof value === 'string' ? new TextEncoder().encode(value) : value,
    ]),
  );

  return {
    listEntries(): readonly ZipEntryInfo[] {
      return Array.from(byteEntries.entries()).map(([path, value]) => ({
        path,
        compressedSize: BigInt(value.length),
        uncompressedSize: BigInt(value.length),
        compressionMethod: 0,
        isEncrypted: false,
      }));
    },
    hasEntry(path: string): boolean {
      return byteEntries.has(path);
    },
    getEntryInfo(path: string): ZipEntryInfo | null {
      const value = byteEntries.get(path);
      if (!value) {
        return null;
      }

      return {
        path,
        compressedSize: BigInt(value.length),
        uncompressedSize: BigInt(value.length),
        compressionMethod: 0,
        isEncrypted: false,
      };
    },
    async readEntryBytes(path: string): Promise<Uint8Array> {
      const value = byteEntries.get(path);
      if (!value) {
        throw new Error(`Missing entry: ${path}`);
      }

      return value.slice();
    },
    async readEntryText(path: string): Promise<string> {
      const value = byteEntries.get(path);
      if (!value) {
        throw new Error(`Missing entry: ${path}`);
      }

      return new TextDecoder().decode(value);
    },
    async readEntryJson<T>(path: string): Promise<T> {
      return JSON.parse(await this.readEntryText(path)) as T;
    },
    async close(): Promise<void> {},
  };
}

function createTransactionMock() {
  const limit = jest.fn(async (_count?: number): Promise<{ note_id: string }[]> => []);
  const where = jest.fn(() => ({ limit }));
  const from = jest.fn(() => ({ where, limit }));
  const select = jest.fn(() => ({ from }));
  const onConflictDoUpdate = jest.fn(async (_value: unknown): Promise<void> => {});
  const values = jest.fn(() => ({ onConflictDoUpdate }));
  const insert = jest.fn(() => ({ values }));

  return {
    tx: { insert, select },
    insert,
    select,
    from,
    where,
    limit,
    values,
    onConflictDoUpdate,
  };
}

beforeEach(() => {
  mockReadSafeZipBytes.mockReset();
  mockWriteImportedPhoto.mockReset();
  mockWriteImportedAudio.mockReset();
  mockCleanupImportedFiles.mockReset();
});

describe('buildGratitudeAppPortablePayload', () => {
  test('resolves Gratitude media entries by basename when the zip has a parent folder', async () => {
    const zip = mockCreateFakeStreamingZipArchive({
      'gratitudeEntries.json': JSON.stringify([
        {
          noteId: 'entry-1',
          noteText: 'hello',
          createdOn: 1,
          updatedOn: 2,
          prompt: null,
          imagePath: null,
        },
      ]),
      'gratitudeAssets.json': JSON.stringify([
        {
          entityId: 'entry-1',
          assetType: 'image',
          assetPath: 'photo-1.jpg',
        },
      ]),
      'gratitudePrompts.json': JSON.stringify([]),
      'journalTags.json': JSON.stringify([]),
      'journalRecordings.json': JSON.stringify([
        {
          noteId: 'entry-1',
          recordingPath: 'memo-1.mp3',
        },
      ]),
      'gratitudeConfig.json': JSON.stringify([{}]),
      'backup-2026/gratitudeImages/photo-1.jpg': new Uint8Array([1, 2, 3]),
      'backup-2026/journalRecordingsFolder/memo-1.mp3': new Uint8Array([4, 5, 6]),
    });

    const payload = await buildGratitudeAppPortablePayload(zip);

    expect(payload.portableEntries).toHaveLength(1);
    expect(payload.portableEntries[0]?.assets).toEqual([
      {
        type: AssetType.IMAGE,
        path: 'backup-2026/gratitudeImages/photo-1.jpg',
      },
      {
        type: AssetType.AUDIO,
        path: 'backup-2026/journalRecordingsFolder/memo-1.mp3',
      },
    ]);
  });
});

describe('importPortableEntries', () => {
  let warnSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = undefined;
  });

  test('continues importing textual entries when a media asset fails', async () => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const { tx, insert, values } = createTransactionMock();
    const summary = createBackupImportSummary();
    const createdFiles: string[] = [];

    mockReadSafeZipBytes.mockRejectedValueOnce(
      new Error('Missing entry: media/photos/photo-1.jpg'),
    );

    await importPortableEntries(
      tx as never,
      [
        {
          noteId: 'entry-1',
          textTitle: 'Title',
          textContent: 'Body',
          mood: null,
          tagTitles: [],
          createdAt: 1,
          updatedAt: 2,
          assets: [{ type: AssetType.IMAGE, path: 'media/photos/photo-1.jpg' }],
        },
      ],
      new Set(),
      new Map(),
      summary,
      'overwrite',
      mockCreateFakeStreamingZipArchive({}),
      createdFiles,
      'tackbok',
    );

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        note_id: 'entry-1',
        text_title: 'Title',
        text_content: 'Body',
        assets: null,
      }),
    );
    expect(summary.importedEntries).toBe(1);
    expect(summary.failedAssets).toBe(1);
    expect(summary.failedEntries).toBe(0);
    expect(summary.warnings[0]).toMatchObject({
      kind: 'entry-asset',
      noteId: 'entry-1',
      assetPath: 'media/photos/photo-1.jpg',
    });
    expect(createdFiles).toEqual([]);
  });

  test('marks asset-only entries as failed when every media asset fails', async () => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const { tx, insert } = createTransactionMock();
    const summary = createBackupImportSummary();

    mockReadSafeZipBytes.mockRejectedValueOnce(
      new Error('Missing entry: media/photos/photo-2.jpg'),
    );

    await importPortableEntries(
      tx as never,
      [
        {
          noteId: 'entry-2',
          textTitle: null,
          textContent: null,
          mood: null,
          tagTitles: [],
          createdAt: 1,
          updatedAt: 2,
          assets: [{ type: AssetType.IMAGE, path: 'media/photos/photo-2.jpg' }],
        },
      ],
      new Set(),
      new Map(),
      summary,
      'overwrite',
      mockCreateFakeStreamingZipArchive({}),
      [],
      'tackbok',
    );

    expect(insert).not.toHaveBeenCalled();
    expect(summary.importedEntries).toBe(0);
    expect(summary.failedAssets).toBe(1);
    expect(summary.failedEntries).toBe(1);
    expect(summary.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'entry-asset', noteId: 'entry-2' }),
        expect.objectContaining({ kind: 'entry-skipped', noteId: 'entry-2' }),
      ]),
    );
  });

  test('cleans up written entry files when the database write fails', async () => {
    const { tx, onConflictDoUpdate } = createTransactionMock();
    const summary = createBackupImportSummary();

    mockReadSafeZipBytes.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    mockWriteImportedPhoto.mockResolvedValueOnce({
      type: AssetType.IMAGE,
      uri: 'photos/photo-3.jpg',
      width: 12,
      height: 24,
    });
    onConflictDoUpdate.mockRejectedValueOnce(new Error('database write failed'));

    await expect(
      importPortableEntries(
        tx as never,
        [
          {
            noteId: 'entry-3',
            textTitle: null,
            textContent: 'Body',
            mood: null,
            tagTitles: [],
            createdAt: 1,
            updatedAt: 2,
            assets: [{ type: AssetType.IMAGE, path: 'media/photos/photo-3.jpg' }],
          },
        ],
        new Set(),
        new Map(),
        summary,
        'overwrite',
        mockCreateFakeStreamingZipArchive({}),
        [],
        'tackbok',
      ),
    ).rejects.toThrow('database write failed');

    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/photo-3.jpg']);
  });
});

describe('upsertPortableTags', () => {
  test('reuses existing tags when portable titles normalize to the same key', async () => {
    const existingTagId = 'existing-tag-id';
    const insertedValues = jest.fn(async (_value: unknown): Promise<void> => {});
    const tx = {
      select: () => ({
        from: async () => [{ tag_id: existingTagId, title: 'Work,Focus' }],
      }),
      insert: () => ({
        values: insertedValues,
      }),
    };
    const summary = createBackupImportSummary();

    const tagMap = await upsertPortableTags(
      tx as never,
      [{ title: 'Work|Focus', createdAt: 1, updatedAt: 2 }],
      summary,
    );

    expect(insertedValues).not.toHaveBeenCalled();
    expect(tagMap.get('work focus')).toBe(existingTagId);
    expect(summary.importedTags).toBe(0);
  });
});
