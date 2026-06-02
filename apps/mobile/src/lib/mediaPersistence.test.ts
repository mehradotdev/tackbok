import * as ExpoFileSystemMock from 'expo-file-system';
import * as ReactNativeMock from 'react-native';
import { compressAndSavePhoto } from './photoUtils';
import { saveVoiceMemo } from './voiceMemoUtils';

const mockResize = jest.fn();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();
const mockManipulate = jest.fn(() => ({
  resize: mockResize,
  renderAsync: mockRenderAsync,
}));
const mockGenerateUUID = jest.fn(() => 'generated-uuid');

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
  },
}));
jest.mock('~/lib/utils', () => ({
  generateUUID: () => mockGenerateUUID(),
}));

const { __mockFileSystemState } = ExpoFileSystemMock as typeof ExpoFileSystemMock & {
  __mockFileSystemState: {
    createdFiles: Array<{
      uri: string;
      delete: jest.Mock;
    }>;
    copyBehavior: (source: unknown, destination: unknown) => Promise<void>;
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
    mockGenerateUUID.mockReset();

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
    mockGenerateUUID.mockImplementation(() => 'generated-uuid');
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
});