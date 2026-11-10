import * as ExpoFileSystemMock from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SharingUnavailableError } from './share-image';
import { MediaFileMissingError, shareMediaFile } from './share-media-file';

jest.mock('expo-file-system');
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const mockIsAvailable = Sharing.isAvailableAsync as jest.MockedFunction<
  typeof Sharing.isAvailableAsync
>;
const mockShare = Sharing.shareAsync as jest.MockedFunction<typeof Sharing.shareAsync>;
type MockFile = { uri: string; exists: boolean; copy: jest.Mock; delete: jest.Mock };
const { __mockFileSystemState } = ExpoFileSystemMock as typeof ExpoFileSystemMock & {
  __mockFileSystemState: {
    createdFiles: MockFile[];
    copyBehavior: (source: unknown, destination: unknown) => Promise<void>;
  };
};

const SOURCE_URI = 'file:///documents/voice_memos/abc-123.m4a';
const EXPORT_URI = '/tmp/tackbok-voice-note-20261111-090507.m4a';
const options = {
  fileUri: SOURCE_URI,
  filenamePrefix: 'tackbok-voice-note',
  dialogTitle: 'Share voice note',
};

/** URIs present on the fake disk; every mocked File's `exists` reads from it. */
const disk = new Set<string>();

function backFilesWithDisk() {
  const created = __mockFileSystemState.createdFiles;
  jest.spyOn(created, 'push').mockImplementation((...files: MockFile[]) => {
    for (const file of files) {
      Object.defineProperty(file, 'exists', { get: () => disk.has(file.uri) });
      file.delete.mockImplementation(() => disk.delete(file.uri));
    }
    return Array.prototype.push.apply(created, files);
  });
  __mockFileSystemState.copyBehavior = async (_source, destination) => {
    disk.add((destination as MockFile).uri);
  };
}

const sharedUris = () => mockShare.mock.calls.map(([uri]) => uri);

describe('shareMediaFile', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 11, 9, 5, 7));
    jest.clearAllMocks();
    jest.restoreAllMocks();
    __mockFileSystemState.createdFiles.length = 0;
    disk.clear();
    disk.add(SOURCE_URI);
    backFilesWithDisk();
    mockIsAvailable.mockResolvedValue(true);
    mockShare.mockResolvedValue();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('shares a readable, typed copy and deletes it only after the delay', async () => {
    await expect(shareMediaFile(options)).resolves.toBe('shared');

    expect(sharedUris()).toEqual([EXPORT_URI]);
    expect(mockShare).toHaveBeenCalledWith(EXPORT_URI, {
      mimeType: 'audio/mp4',
      UTI: 'com.apple.m4a-audio',
      dialogTitle: 'Share voice note',
    });
    expect(disk.has(EXPORT_URI)).toBe(true);

    jest.advanceTimersByTime(59_999);
    expect(disk.has(EXPORT_URI)).toBe(true);
    jest.advanceTimersByTime(1);
    expect(disk.has(EXPORT_URI)).toBe(false);
    expect(disk.has(SOURCE_URI)).toBe(true);
  });

  test('gives a second share in the same second its own file', async () => {
    await shareMediaFile(options);
    await shareMediaFile(options);

    const second = '/tmp/tackbok-voice-note-20261111-090507-2.m4a';
    expect(sharedUris()).toEqual([EXPORT_URI, second]);
    expect(disk.has(EXPORT_URI)).toBe(true);
    expect(disk.has(second)).toBe(true);
  });

  test('uses the photo type for JPEG files', async () => {
    const photoUri = 'file:///documents/photos/x.JPG';
    disk.add(photoUri);
    await shareMediaFile({ ...options, fileUri: photoUri });
    expect(mockShare).toHaveBeenCalledWith(
      expect.stringMatching(/\.jpg$/),
      expect.objectContaining({ mimeType: 'image/jpeg', UTI: 'public.jpeg' }),
    );
  });

  test('reports unavailable sharing before touching files', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await expect(shareMediaFile(options)).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(__mockFileSystemState.createdFiles).toHaveLength(0);
  });

  test('rejects a file that is no longer on disk', async () => {
    disk.delete(SOURCE_URI);
    await expect(shareMediaFile(options)).rejects.toBeInstanceOf(MediaFileMissingError);
    expect(mockShare).not.toHaveBeenCalled();
  });

  test('deletes the copy right away when the share sheet fails', async () => {
    mockShare.mockRejectedValue(new Error('share failed'));
    await expect(shareMediaFile(options)).rejects.toThrow('share failed');
    expect(mockShare).toHaveBeenCalledWith(EXPORT_URI, expect.anything());
    expect(disk.has(EXPORT_URI)).toBe(false);
    expect(disk.has(SOURCE_URI)).toBe(true);
  });

  test('ignores a second tap while a share is in flight', async () => {
    let finishShare: () => void = () => {};
    mockShare.mockImplementation(
      () => new Promise<void>((resolve) => (finishShare = resolve)),
    );
    const first = shareMediaFile(options);
    await expect(shareMediaFile(options)).resolves.toBe('busy');
    for (let i = 0; i < 20 && mockShare.mock.calls.length === 0; i++)
      await Promise.resolve();
    finishShare();
    await expect(first).resolves.toBe('shared');
    expect(mockShare).toHaveBeenCalledTimes(1);
  });
});
