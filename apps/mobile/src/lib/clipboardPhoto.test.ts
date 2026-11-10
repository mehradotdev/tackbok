import * as ExpoFileSystemMock from 'expo-file-system';
import { addImageFromDataUri, parseImageDataUri } from './clipboardPhoto';

jest.mock('expo-file-system');
jest.mock('expo-clipboard', () => ({ getImageAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'paste-uuid' }));

const { __mockFileSystemState } = ExpoFileSystemMock as typeof ExpoFileSystemMock & {
  __mockFileSystemState: {
    createdFiles: {
      uri: string;
      exists: boolean;
      delete: jest.Mock;
      write: jest.Mock;
    }[];
    writeBehavior: (file: unknown, content: unknown, options?: unknown) => Promise<void>;
  };
};

const PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgo=';

describe('parseImageDataUri', () => {
  test('accepts base64 image data URIs', () => {
    expect(parseImageDataUri(PNG_DATA_URI)).toEqual({
      extension: 'png',
      base64: 'iVBORw0KGgo=',
    });
    expect(parseImageDataUri('data:image/JPEG;base64,/9j/4AAQ')).toEqual({
      extension: 'jpeg',
      base64: '/9j/4AAQ',
    });
  });

  test('keeps only safe characters in the extension', () => {
    expect(parseImageDataUri('data:image/svg+xml;base64,PHN2Zz4=')?.extension).toBe(
      'svgxml',
    );
  });

  test.each([
    ['plain text', 'hello there'],
    ['a link', 'https://example.com/photo.png'],
    ['a file URI', 'file:///tmp/photo.png'],
    ['a non-image data URI', 'data:text/plain;base64,aGVsbG8='],
    ['a non-base64 image data URI', 'data:image/svg+xml,<svg></svg>'],
    ['an empty payload', 'data:image/png;base64,'],
    ['a missing MIME subtype', 'data:image/;base64,AAAA'],
    ['a non-string', 42],
  ])('rejects %s', (_label, value) => {
    expect(parseImageDataUri(value)).toBeNull();
  });
});

describe('addImageFromDataUri', () => {
  beforeEach(() => {
    __mockFileSystemState.createdFiles.length = 0;
    __mockFileSystemState.writeBehavior = async () => {};
  });

  test('reports no image without touching the file system', async () => {
    const addPhotos = jest.fn();

    await expect(addImageFromDataUri(null, addPhotos)).resolves.toBe('no-image');

    expect(addPhotos).not.toHaveBeenCalled();
    expect(__mockFileSystemState.createdFiles).toHaveLength(0);
  });

  test('never adds text or links', async () => {
    const addPhotos = jest.fn();

    await expect(addImageFromDataUri('https://example.com', addPhotos)).resolves.toBe(
      'invalid-image',
    );

    expect(addPhotos).not.toHaveBeenCalled();
    expect(__mockFileSystemState.createdFiles).toHaveLength(0);
  });

  test('passes a temporary cache file to the photo path, then deletes it', async () => {
    const addPhotos = jest.fn(async () => {
      const [file] = __mockFileSystemState.createdFiles;
      expect(file.delete).not.toHaveBeenCalled();
    });

    await expect(addImageFromDataUri(PNG_DATA_URI, addPhotos)).resolves.toBe('added');

    const [file] = __mockFileSystemState.createdFiles;
    expect(file.uri).toBe('/tmp/clipboard-paste-uuid.png');
    expect(file.write).toHaveBeenCalledWith('iVBORw0KGgo=', { encoding: 'base64' });
    expect(addPhotos).toHaveBeenCalledWith({ status: 'success', uris: [file.uri] });
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  test('deletes the temporary file when adding fails', async () => {
    const addPhotos = jest.fn(async () => {
      throw new Error('save failed');
    });

    await expect(addImageFromDataUri(PNG_DATA_URI, addPhotos)).rejects.toThrow(
      'save failed',
    );

    expect(__mockFileSystemState.createdFiles[0].delete).toHaveBeenCalledTimes(1);
  });

  test('reports an invalid image when the data cannot be written', async () => {
    const addPhotos = jest.fn();
    __mockFileSystemState.writeBehavior = async () => {
      throw new Error('bad base64');
    };

    await expect(addImageFromDataUri(PNG_DATA_URI, addPhotos)).resolves.toBe(
      'invalid-image',
    );

    expect(addPhotos).not.toHaveBeenCalled();
    expect(__mockFileSystemState.createdFiles[0].delete).toHaveBeenCalledTimes(1);
  });
});
