// Shared manual Jest mock for tests that reuse the default Expo FileSystem behavior.
// Prefer suite-local inline mocks when a test needs ZIP- or import-specific file APIs.
export const __mockFileSystemState = {
  pickDirectoryAsync: jest.fn(async () => ({
    createFile: jest.fn((name: string) => ({
      uri: `picked/${name}`,
      write: jest.fn(() => {}),
    })),
  })),
  cacheEntries: [] as unknown[],
  createdFiles: [] as unknown[],
  copyBehavior: async (_source: unknown, _destination: unknown) => {},
  paths: {
    cache: '/tmp',
    document: '/documents',
  },
};

export class File {
  exists = true;
  modificationTime: number | null = Date.now();
  creationTime: number | null = Date.now();
  bytes = jest.fn(async () => new Uint8Array([1, 2, 3]));
  copy = jest.fn((destination: unknown) =>
    __mockFileSystemState.copyBehavior(this, destination),
  );
  uri: string;

  constructor(...args: unknown[]) {
    this.uri = args
      .map((arg) => {
        if (typeof arg === 'string') {
          return arg;
        }

        if (arg && typeof arg === 'object' && 'uri' in arg) {
          return String((arg as { uri?: unknown }).uri ?? '');
        }

        return '';
      })
      .filter(Boolean)
      .join('/');

    __mockFileSystemState.createdFiles.push(this);
  }

  delete = jest.fn(() => {
    this.exists = false;
  });

  write = jest.fn((_content: Uint8Array) => {});
}

export class Directory {
  static pickDirectoryAsync() {
    return __mockFileSystemState.pickDirectoryAsync();
  }

  exists = true;

  constructor(...args: unknown[]) {
    void args;
  }

  create = jest.fn(() => {
    this.exists = true;
  });

  createFile(name: string, _mimeType: string | null) {
    return {
      uri: `picked/${name}`,
      write: jest.fn(() => {}),
    };
  }

  list() {
    return __mockFileSystemState.cacheEntries as File[];
  }
}

export const Paths = __mockFileSystemState.paths;
