export const __mockFileSystemState = {
  pickDirectoryAsync: jest.fn(async () => ({
    createFile: jest.fn((name: string) => ({
      uri: `picked/${name}`,
      write: jest.fn(() => {}),
    })),
  })),
  cacheEntries: [] as unknown[],
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
  copy = jest.fn((_destination: unknown) => {});
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
  }

  delete() {
    this.exists = false;
  }

  write(_content: Uint8Array) {}
}

export class Directory {
  static pickDirectoryAsync() {
    return __mockFileSystemState.pickDirectoryAsync();
  }

  exists = true;

  constructor(...args: unknown[]) {
    void args;
  }

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
