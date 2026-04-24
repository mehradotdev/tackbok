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
import type { ZipEntryInfo, ZipReader } from '~/lib/zip';
import { AssetType, type Asset } from '~/types';
import { createBackupImportSummary } from './summary';

type PortableModule = typeof import('./portable');

let buildGratitudeAppPortablePayload: PortableModule['buildGratitudeAppPortablePayload'];
let importPortableEntries: PortableModule['importPortableEntries'];

const mockReadSafeZipBytes = mock(async (_zip: ZipReader, _path: string) => new Uint8Array());
const mockWriteImportedPhoto = mock(
  async (_bytes: Uint8Array, _path: string): Promise<Asset> => ({
    type: AssetType.IMAGE,
    uri: 'photos/imported.jpg',
    width: 10,
    height: 10,
  }),
);
const mockWriteImportedAudio = mock((_bytes: Uint8Array, _path: string): Asset => ({
  type: AssetType.AUDIO,
  uri: 'voice-memos/imported.m4a',
}));
const mockCleanupImportedFiles = mock((_relativeUris: string[]): void => {});

mock.module('~/db', () => ({
  db: {},
  customPrompts: {},
  entries: { note_id: 'note_id' },
  tags: {},
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
  cleanupImportedFiles: (relativeUris: string[]) => mockCleanupImportedFiles(relativeUris),
  writeImportedPhoto: (bytes: Uint8Array, path: string) => mockWriteImportedPhoto(bytes, path),
  writeImportedAudio: (bytes: Uint8Array, path: string) => mockWriteImportedAudio(bytes, path),
  saveZipFile: async (_zipBytes: Uint8Array, _fileName: string) => {},
  saveGeneratedZipFile: async (_file: unknown, _fileName: string) => {},
  readSafeZipJson: <T>(zip: ZipReader, path: string) => zip.readEntryJson<T>(path),
  readSafeZipBytes: (zip: ZipReader, path: string) => mockReadSafeZipBytes(zip, path),
  loadZipFromUri: async (_uri: string) => createFakeStreamingZipArchive({}),
  isZipFile: async (_uri: string) => true,
  buildTagIdToNameMap: async () => new Map(),
  resolveTagIdsToTitles: (_tagIds: string, _tagMap: Map<string, string>) => [],
  getRelativeAssetFile: (_relativeUri: string) => null,
  createArchiveAssetPath: (_type: string, relativeUri: string) => `media/photos/${relativeUri}`,
  assetFileExists: (_asset: unknown) => true,
  deriveGratitudeTitle: (title: string | null | undefined) => {
    const trimmed = title?.trim();
    return trimmed ? trimmed : null;
  },
});

mock.module('./archiveUtils', archiveUtilsMockFactory);
mock.module('./archiveUtils.ts', archiveUtilsMockFactory);

function createFakeStreamingZipArchive(
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
  const onConflictDoUpdate = mock(async (_value: unknown): Promise<void> => {});
  const values = mock(() => ({ onConflictDoUpdate }));
  const insert = mock(() => ({ values }));

  return {
    tx: { insert },
    insert,
    values,
    onConflictDoUpdate,
  };
}

beforeAll(async () => {
  const portableModule = await import('./portable');
  buildGratitudeAppPortablePayload = portableModule.buildGratitudeAppPortablePayload;
  importPortableEntries = portableModule.importPortableEntries;
});

beforeEach(() => {
  mockReadSafeZipBytes.mockReset();
  mockWriteImportedPhoto.mockReset();
  mockWriteImportedAudio.mockReset();
  mockCleanupImportedFiles.mockReset();
});

describe('buildGratitudeAppPortablePayload', () => {
  test('resolves Gratitude media entries by basename when the zip has a parent folder', async () => {
    const zip = createFakeStreamingZipArchive({
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
  test('continues importing textual entries when a media asset fails', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const { tx, insert, values } = createTransactionMock();
    const summary = createBackupImportSummary();
    const createdFiles: string[] = [];

    mockReadSafeZipBytes.mockRejectedValueOnce(new Error('Missing entry: media/photos/photo-1.jpg'));

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
      createFakeStreamingZipArchive({}),
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

    warnSpy.mockRestore();
  });

  test('marks asset-only entries as failed when every media asset fails', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const { tx, insert } = createTransactionMock();
    const summary = createBackupImportSummary();

    mockReadSafeZipBytes.mockRejectedValueOnce(new Error('Missing entry: media/photos/photo-2.jpg'));

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
      createFakeStreamingZipArchive({}),
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

    warnSpy.mockRestore();
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
        createFakeStreamingZipArchive({}),
        [],
        'tackbok',
      ),
    ).rejects.toThrow('database write failed');

    expect(mockCleanupImportedFiles).toHaveBeenCalledWith(['photos/photo-3.jpg']);
  });
});

afterAll(() => {
  mock.restore();
});
