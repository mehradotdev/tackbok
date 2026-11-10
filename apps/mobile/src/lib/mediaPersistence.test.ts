import * as ExpoFileSystemMock from 'expo-file-system';
import * as ReactNativeMock from 'react-native';
import { compressAndSavePhoto, takeUrisWithinCapacity } from './photoUtils';
import { saveVoiceMemo } from './voiceMemoUtils';

const mockResize = jest.fn();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();
const mockManipulate = jest.fn(() => ({
  resize: mockResize,
  renderAsync: mockRenderAsync,
}));
const mockRandomUUID = jest.fn(() => 'generated-uuid');

jest.mock('expo-file-system');
jest.mock('react-native');
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: (...args: Parameters<typeof mockManipulate>) => mockManipulate(...args),
  },
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
  },
}));
const mockDrawColor = jest.fn();
const mockDrawImage = jest.fn();
const mockEncodeToBytes = jest.fn(async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
const mockMakeFromEncoded = jest.fn(() => ({ width: () => 1200, height: () => 600 }));
jest.mock('react-native-skia', () => ({
  ImageFormat: { JPEG: 3 },
  Skia: {
    Color: (color: string) => color,
    Data: { fromBytes: (bytes: Uint8Array) => bytes },
    Image: {
      MakeFromEncoded: (...args: unknown[]) => mockMakeFromEncoded(...(args as [])),
    },
    Surface: {
      MakeRaster: () => ({
        getCanvas: () => ({ drawColor: mockDrawColor, drawImage: mockDrawImage }),
        flush: jest.fn(),
        makeImageSnapshot: () => ({ encodeToBytes: mockEncodeToBytes }),
      }),
    },
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

const { __mockFileSystemState } = ExpoFileSystemMock as typeof ExpoFileSystemMock & {
  __mockFileSystemState: {
    createdFiles: {
      uri: string;
      delete: jest.Mock;
      write: jest.Mock;
      copy: jest.Mock;
    }[];
    copyBehavior: (source: unknown, destination: unknown) => Promise<void>;
    fileHeader: number[];
  };
};

const { __mockReactNativeState } = ReactNativeMock as typeof ReactNativeMock & {
  __mockReactNativeState: {
    Image: {
      getSize: jest.Mock;
    };
  };
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('media persistence', () => {
  beforeEach(() => {
    __mockFileSystemState.createdFiles.length = 0;
    __mockFileSystemState.copyBehavior = async () => {};
    __mockFileSystemState.fileHeader = [0xff, 0xd8, 0xff];
    mockDrawColor.mockClear();
    mockDrawImage.mockClear();
    mockEncodeToBytes.mockClear();

    __mockReactNativeState.Image.getSize.mockReset();
    __mockReactNativeState.Image.getSize.mockImplementation(
      (
        _uri: string,
        success: (width: number, height: number) => void,
        _failure?: (error: Error) => void,
      ) => success(2400, 1200),
    );

    mockResize.mockReset();
    mockRenderAsync.mockReset();
    mockSaveAsync.mockReset();
    mockManipulate.mockReset();
    mockRandomUUID.mockReset();

    mockResize.mockImplementation(() => undefined);
    mockRenderAsync.mockResolvedValue({
      width: 1200,
      height: 600,
      saveAsync: mockSaveAsync,
    });
    mockSaveAsync.mockResolvedValue({ uri: '/tmp/image-manipulator-result.jpg' });
    mockManipulate.mockImplementation(() => ({
      resize: mockResize,
      renderAsync: mockRenderAsync,
    }));
    mockRandomUUID.mockImplementation(() => 'generated-uuid');
  });

  test('waits for photo copy before deleting the temp manipulator file', async () => {
    const copyDeferred = createDeferred<void>();
    __mockFileSystemState.copyBehavior = jest.fn(async () => copyDeferred.promise);

    const savePromise = compressAndSavePhoto('content://picked-photo');
    await flushMicrotasks();

    const tempFile = __mockFileSystemState.createdFiles.find(
      (file) => file.uri === '/tmp/image-manipulator-result.jpg',
    );

    expect(tempFile).toBeDefined();
    expect(tempFile?.delete).not.toHaveBeenCalled();

    copyDeferred.resolve();

    await expect(savePromise).resolves.toEqual({
      type: 'IMAGE',
      uri: 'photos/generated-uuid.jpg',
      width: 1200,
      height: 600,
    });
    expect(tempFile?.delete).toHaveBeenCalledTimes(1);
  });

  test('waits for voice memo copy before deleting the temp recording', async () => {
    const copyDeferred = createDeferred<void>();
    __mockFileSystemState.copyBehavior = jest.fn(async () => copyDeferred.promise);

    const savePromise = saveVoiceMemo('/tmp/recording.m4a');
    await flushMicrotasks();

    const tempFile = __mockFileSystemState.createdFiles.find(
      (file) => file.uri === '/tmp/recording.m4a',
    );

    expect(tempFile).toBeDefined();
    expect(tempFile?.delete).not.toHaveBeenCalled();

    copyDeferred.resolve();

    await expect(savePromise).resolves.toEqual({
      type: 'AUDIO',
      uri: 'voice_memos/generated-uuid.m4a',
    });
    expect(tempFile?.delete).toHaveBeenCalledTimes(1);
  });

  test('places images that may be transparent on white before saving as JPEG', async () => {
    __mockFileSystemState.fileHeader = [0x89, 0x50, 0x4e, 0x47]; // PNG signature
    mockSaveAsync.mockResolvedValue({ uri: '/tmp/image-manipulator-result.png' });

    await expect(compressAndSavePhoto('file:///cache/clipboard.png')).resolves.toEqual({
      type: 'IMAGE',
      uri: 'photos/generated-uuid.jpg',
      width: 1200,
      height: 600,
    });

    expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'png' });
    expect(mockDrawColor).toHaveBeenCalledWith('white');
    expect(mockDrawImage).toHaveBeenCalledTimes(1);
    expect(mockDrawColor.mock.invocationCallOrder[0]).toBeLessThan(
      mockDrawImage.mock.invocationCallOrder[0],
    );
    expect(mockEncodeToBytes).toHaveBeenCalledWith(3, 70);

    const files = __mockFileSystemState.createdFiles;
    const tempFile = files.find((f) => f.uri === '/tmp/image-manipulator-result.png');
    const destFile = files.find((f) => f.uri.endsWith('generated-uuid.jpg'));
    expect(tempFile?.copy).not.toHaveBeenCalled();
    expect(tempFile?.delete).toHaveBeenCalledTimes(1);
    expect(destFile?.write).toHaveBeenCalledWith(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    );
  });

  test('keeps JPEG sources on the direct JPEG path', async () => {
    await compressAndSavePhoto('file:///camera.jpg');

    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.7, format: 'jpeg' });
    expect(mockDrawColor).not.toHaveBeenCalled();
  });

  test('removes temp and partial output when the white-background pass fails', async () => {
    __mockFileSystemState.fileHeader = [0x89, 0x50, 0x4e, 0x47];
    mockSaveAsync.mockResolvedValue({ uri: '/tmp/image-manipulator-result.png' });
    mockMakeFromEncoded.mockReturnValueOnce(null as never);

    await expect(compressAndSavePhoto('file:///cache/broken.png')).rejects.toThrow(
      'Could not decode image',
    );

    const files = __mockFileSystemState.createdFiles;
    const tempFile = files.find((f) => f.uri === '/tmp/image-manipulator-result.png');
    const destFile = files.find((f) => f.uri.endsWith('generated-uuid.jpg'));
    expect(tempFile?.delete).toHaveBeenCalledTimes(1);
    expect(destFile?.delete).toHaveBeenCalledTimes(1);
  });
});

describe('takeUrisWithinCapacity', () => {
  const uris = ['a', 'b', 'c', 'd'];

  test('keeps every URI while there is room', () => {
    expect(takeUrisWithinCapacity(uris, 2, 0)).toEqual(uris);
  });

  test('caps URIs to the remaining capacity, counting in-flight saves', () => {
    expect(takeUrisWithinCapacity(uris, 6, 1)).toEqual(['a', 'b', 'c']);
    expect(takeUrisWithinCapacity(uris, 8, 1)).toEqual(['a']);
  });

  test('returns nothing when the entry is full or over capacity', () => {
    expect(takeUrisWithinCapacity(uris, 9, 1)).toEqual([]);
    expect(takeUrisWithinCapacity(uris, 12, 0)).toEqual([]);
  });
});
