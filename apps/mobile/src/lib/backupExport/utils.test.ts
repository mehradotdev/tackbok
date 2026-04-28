import { beforeEach, describe, expect, mock, test } from 'bun:test';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const mockPickDirectoryAsync = mock(async () => ({
  createFile: mock(() => ({
    write: mock(() => {}),
  })),
}));
const mockShareAsync = mock(async (_uri?: string, _options?: unknown) => {});
const mockIsAvailableAsync = mock(async () => true);
const mockCacheEntries: unknown[] = [];
const mockPlatform = {
  OS: 'ios',
};

mock.module('expo-file-system', () => ({
  File: class MockFile {
    exists = true;
    modificationTime: number | null = Date.now();
    creationTime: number | null = Date.now();
    bytes = mock(async () => new Uint8Array([1, 2, 3]));
    copy = mock((_destination: unknown) => {});

    constructor(...args: string[]) {
      this.uri = args.join('/');
    }

    uri: string;

    delete() {
      this.exists = false;
    }

    write(_content: Uint8Array) {}
  },
  Directory: class MockDirectory {
    static pickDirectoryAsync = () => mockPickDirectoryAsync();
    exists = true;

    constructor(...args: unknown[]) {
      void args;
    }

    createFile(name: string, _mimeType: string | null) {
      return {
        uri: `picked/${name}`,
        write: mock(() => {}),
      };
    }

    list() {
      return mockCacheEntries as unknown[];
    }
  },
  Paths: {
    cache: '/tmp',
    document: '/documents',
  },
}));

mock.module('expo-sharing', () => ({
  shareAsync: (uri: string, options?: unknown) => mockShareAsync(uri, options),
  isAvailableAsync: () => mockIsAvailableAsync(),
}));

mock.module('react-native', () => ({
  Platform: mockPlatform,
}));

mock.module('~/db', () => ({
  db: {
    select: mock(() => ({
      from: mock(async () => []),
    })),
  },
  customPrompts: {},
  entries: { created_at: 'created_at' },
  tags: {},
}));

mock.module('~/lib/photoUtils', () => ({
  photoFileExists: (_uri: string) => true,
}));

mock.module('~/lib/voiceMemoUtils', () => ({
  voiceMemoFileExists: (_uri: string) => true,
}));

const { cleanupDeferredBackupZipFiles, getRelativeAssetFile, saveOrShareZipFile } =
  await import('./utils');
const { File } = await import('expo-file-system');

describe('backup export utils', () => {
  beforeEach(() => {
    mockPickDirectoryAsync.mockReset();
    mockShareAsync.mockReset();
    mockIsAvailableAsync.mockReset();
    mockCacheEntries.length = 0;
    mockPlatform.OS = 'ios';

    mockPickDirectoryAsync.mockResolvedValue({
      createFile: mock(() => ({
        write: mock(() => {}),
      })),
    });
    mockShareAsync.mockResolvedValue();
    mockIsAvailableAsync.mockResolvedValue(true);
  });

  test('returns deferred cleanup when using the iOS share sheet', async () => {
    const file = new File('/tmp/TackbokBackup_test.zip');

    await expect(saveOrShareZipFile(file, 'TackbokBackup_test.zip')).resolves.toBe(
      'defer-cleanup',
    );
    expect(mockShareAsync).toHaveBeenCalledWith(file.uri, expect.any(Object));
  });

  test('returns immediate cleanup after android directory copy', async () => {
    mockPlatform.OS = 'android';
    const file = new File('/tmp/TackbokBackup_test.zip');

    await expect(saveOrShareZipFile(file, 'TackbokBackup_test.zip')).resolves.toBe(
      'delete-immediately',
    );
    expect(mockPickDirectoryAsync).toHaveBeenCalledTimes(1);
    expect(file.copy).toHaveBeenCalledTimes(1);
    expect(file.bytes).not.toHaveBeenCalled();
  });

  test('deletes only stale deferred backup zip files', () => {
    const staleBackup = new File('/tmp/TackbokBackup_stale.zip');
    staleBackup.modificationTime = 1_000;

    const freshBackup = new File('/tmp/TackbokBackup_fresh.zip');
    freshBackup.modificationTime = 9_500;

    const unrelatedFile = new File('/tmp/not-a-backup.zip');
    unrelatedFile.modificationTime = 1_000;

    mockCacheEntries.push(staleBackup, freshBackup, unrelatedFile);

    cleanupDeferredBackupZipFiles(5_000, 10_000);

    expect(staleBackup.exists).toBe(false);
    expect(freshBackup.exists).toBe(true);
    expect(unrelatedFile.exists).toBe(true);
  });

  test('keeps deferred backup zip files with unknown timestamps for the grace period', () => {
    const unknownAgeBackup = new File('/tmp/TackbokBackup_unknown.zip');
    unknownAgeBackup.modificationTime = null;
    unknownAgeBackup.creationTime = null;
    mockCacheEntries.push(unknownAgeBackup);

    cleanupDeferredBackupZipFiles(5_000, 10_000);

    expect(unknownAgeBackup.exists).toBe(true);
  });

  test('returns a file for managed photo and voice memo URIs', () => {
    expect(getRelativeAssetFile('photos/example.jpg')?.uri).toBe(
      '/documents/photos/example.jpg',
    );
    expect(getRelativeAssetFile('voice_memos/example.m4a')?.uri).toBe(
      '/documents/voice_memos/example.m4a',
    );
  });

  test('rejects traversal and absolute asset URIs', () => {
    expect(getRelativeAssetFile('photos/../secret.jpg')).toBeNull();
    expect(getRelativeAssetFile('voice_memos/../secret.m4a')).toBeNull();
    expect(getRelativeAssetFile('/photos/example.jpg')).toBeNull();
  });
});
