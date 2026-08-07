import type React from 'react';
import type { View } from 'react-native';
import * as ExpoFileSystemMock from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import {
  shareViewAsPng,
  ShareNotReadyError,
  SharingUnavailableError,
} from './share-image';

jest.mock('expo-file-system');
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(),
}));

const mockIsAvailable = Sharing.isAvailableAsync as jest.MockedFunction<
  typeof Sharing.isAvailableAsync
>;
const mockShare = Sharing.shareAsync as jest.MockedFunction<typeof Sharing.shareAsync>;
const mockCapture = captureRef as jest.MockedFunction<typeof captureRef>;
const { __mockFileSystemState } = ExpoFileSystemMock as typeof ExpoFileSystemMock & {
  __mockFileSystemState: {
    createdFiles: {
      uri: string;
      exists: boolean;
      copy: jest.Mock;
      move: jest.Mock;
    }[];
    copyBehavior: (source: unknown, destination: unknown) => Promise<void>;
    moveBehavior: (source: unknown, destination: unknown) => Promise<void>;
  };
};
const viewRef = { current: {} as View } as React.RefObject<View>;

const options = {
  ref: viewRef,
  dialogTitle: 'Share',
  filenamePrefix: 'tackbok-test',
  width: 1080,
  height: 1350,
  isReady: true,
};

describe('shareViewAsPng', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __mockFileSystemState.createdFiles.length = 0;
    __mockFileSystemState.copyBehavior = async () => {};
    __mockFileSystemState.moveBehavior = async () => {};
    mockIsAvailable.mockResolvedValue(true);
    mockCapture.mockResolvedValue('/tmp/captured.png');
    mockShare.mockResolvedValue();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('requires an explicitly ready capture target', async () => {
    await expect(shareViewAsPng({ ...options, isReady: false })).rejects.toBeInstanceOf(
      ShareNotReadyError,
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('reports unavailable native sharing before capture', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await expect(shareViewAsPng(options)).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('captures exact dimensions and shares a named PNG', async () => {
    await expect(shareViewAsPng(options)).resolves.toBe('shared');
    expect(mockCapture).toHaveBeenCalledWith(viewRef, {
      format: 'png',
      result: 'tmpfile',
      width: 1080,
      height: 1350,
      quality: 1,
    });
    expect(mockShare).toHaveBeenCalledWith(
      expect.stringMatching(/tackbok-test-\d+\.png$/),
      { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share' },
    );
  });

  test('runs presentation preparation after capture and before native sharing', async () => {
    const beforePresentShareSheet = jest.fn(async () => {});

    await expect(shareViewAsPng({ ...options, beforePresentShareSheet })).resolves.toBe(
      'shared',
    );

    expect(mockCapture.mock.invocationCallOrder[0]).toBeLessThan(
      beforePresentShareSheet.mock.invocationCallOrder[0],
    );
    expect(beforePresentShareSheet.mock.invocationCallOrder[0]).toBeLessThan(
      mockShare.mock.invocationCallOrder[0],
    );
  });

  test('renames the capture into place instead of copying its bytes', async () => {
    await expect(shareViewAsPng(options)).resolves.toBe('shared');

    const capturedFile = __mockFileSystemState.createdFiles[0]!;
    expect(capturedFile.move).toHaveBeenCalledTimes(1);
    expect(capturedFile.copy).not.toHaveBeenCalled();
  });

  test('rejects a re-entrant share while availability is pending', async () => {
    let resolveAvailability!: (value: boolean) => void;
    mockIsAvailable.mockImplementationOnce(
      () => new Promise((resolve) => (resolveAvailability = resolve)),
    );

    const first = shareViewAsPng(options);
    await expect(shareViewAsPng(options)).resolves.toBe('busy');
    resolveAvailability(true);
    await expect(first).resolves.toBe('shared');
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  test('deletes a named capture immediately when native sharing fails', async () => {
    mockShare.mockRejectedValue(new Error('share failed'));
    await expect(shareViewAsPng(options)).rejects.toThrow('share failed');

    // The named destination is the last file constructed by the helper.
    const namedFile = __mockFileSystemState.createdFiles.at(-1);
    expect(namedFile?.uri).toMatch(/tackbok-test-\d+\.png$/);
    expect(namedFile?.exists).toBe(false);
  });
});
