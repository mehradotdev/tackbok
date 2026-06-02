import * as ExpoFileSystemMock from 'expo-file-system';
import { File, type File as ExpoFile } from 'expo-file-system';
import * as ReactNativeMock from 'react-native';
import {
  cleanupDeferredBackupZipFiles,
  getRelativeAssetFile,
  saveOrShareZipFile,
} from './utils';

type MockExpoFile = InstanceType<typeof File> & ExpoFile;

const { __mockFileSystemState } = ExpoFileSystemMock as typeof ExpoFileSystemMock & {
  __mockFileSystemState: {
    pickDirectoryAsync: jest.Mock;
    cacheEntries: unknown[];
  };
};
const { __mockReactNativeState } = ReactNativeMock as typeof ReactNativeMock & {
  __mockReactNativeState: {
    Platform: {
      OS: string;
    };
  };
};

const mockSaveZipWithAndroidDocumentPicker = jest.fn(
  async (_file: ExpoFile, _fileName: string) => {},
);

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const mockShareAsync = jest.fn(async (_uri?: string, _options?: unknown) => {});
const mockIsAvailableAsync = jest.fn(async () => true);
// These suites reuse the shared manual mocks in apps/mobile/__mocks__.
jest.mock('expo-file-system');

jest.mock('expo-sharing', () => ({
  shareAsync: (uri: string, options?: unknown) => mockShareAsync(uri, options),
  isAvailableAsync: () => mockIsAvailableAsync(),
}));

jest.mock('./androidSave', () => ({
  saveZipWithAndroidDocumentPicker: (file: ExpoFile, fileName: string) =>
    mockSaveZipWithAndroidDocumentPicker(file, fileName),
}));

jest.mock('react-native');

jest.mock('~/db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(async () => []),
    })),
  },
  customPrompts: {},
  entries: { created_at: 'created_at' },
  tags: {},
}));

jest.mock('~/lib/photoUtils', () => ({
  photoFileExists: (_uri: string) => true,
}));

jest.mock('~/lib/voiceMemoUtils', () => ({
  voiceMemoFileExists: (_uri: string) => true,
}));

describe('backup export utils', () => {
  beforeEach(() => {
    __mockFileSystemState.pickDirectoryAsync.mockReset();
    mockShareAsync.mockReset();
    mockIsAvailableAsync.mockReset();
    mockSaveZipWithAndroidDocumentPicker.mockReset();
    __mockFileSystemState.cacheEntries.length = 0;
    __mockReactNativeState.Platform.OS = 'ios';

    __mockFileSystemState.pickDirectoryAsync.mockResolvedValue({
      createFile: jest.fn(() => ({
        write: jest.fn(() => {}),
      })),
    });
    mockSaveZipWithAndroidDocumentPicker.mockResolvedValue(undefined);
    mockShareAsync.mockResolvedValue();
    mockIsAvailableAsync.mockResolvedValue(true);
  });

  test('returns deferred cleanup when using the iOS share sheet', async () => {
    const file = new File('/tmp/TackbokBackup_test.zip') as MockExpoFile;

    await expect(saveOrShareZipFile(file, 'TackbokBackup_test.zip')).resolves.toBe(
      'defer-cleanup',
    );
    expect(mockShareAsync).toHaveBeenCalledWith(file.uri, expect.any(Object));
  });

  test('returns immediate cleanup after android save-as flow', async () => {
    __mockReactNativeState.Platform.OS = 'android';
    const file = new File('/tmp/TackbokBackup_test.zip') as MockExpoFile;

    await expect(saveOrShareZipFile(file, 'TackbokBackup_test.zip')).resolves.toBe(
      'delete-immediately',
    );
    expect(mockSaveZipWithAndroidDocumentPicker).toHaveBeenCalledWith(
      file,
      'TackbokBackup_test.zip',
    );
    expect(__mockFileSystemState.pickDirectoryAsync).not.toHaveBeenCalled();
    expect(file.bytes).not.toHaveBeenCalled();
    expect(file.copy).not.toHaveBeenCalled();
  });

  test('deletes only stale deferred backup zip files', () => {
    const staleBackup = new File('/tmp/TackbokBackup_stale.zip');
    staleBackup.modificationTime = 1_000;

    const freshBackup = new File('/tmp/TackbokBackup_fresh.zip');
    freshBackup.modificationTime = 9_500;

    const unrelatedFile = new File('/tmp/not-a-backup.zip');
    unrelatedFile.modificationTime = 1_000;

    __mockFileSystemState.cacheEntries.push(staleBackup, freshBackup, unrelatedFile);

    cleanupDeferredBackupZipFiles(5_000, 10_000);

    expect(staleBackup.exists).toBe(false);
    expect(freshBackup.exists).toBe(true);
    expect(unrelatedFile.exists).toBe(true);
  });

  test('keeps deferred backup zip files with unknown timestamps for the grace period', () => {
    const unknownAgeBackup = new File('/tmp/TackbokBackup_unknown.zip');
    unknownAgeBackup.modificationTime = null;
    unknownAgeBackup.creationTime = null;
    __mockFileSystemState.cacheEntries.push(unknownAgeBackup);

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
