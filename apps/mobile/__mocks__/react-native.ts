// Shared manual Jest mock for tests that only need a lightweight React Native surface.
// Prefer suite-local inline mocks when a test needs a different module shape.
export const Platform = {
  OS: 'ios',
  select<T>(options: { ios?: T; android?: T; default?: T }) {
    return options[this.OS as 'ios' | 'android'] ?? options.default;
  },
};

export const NativeModules = {
  BackupExportSaveModule: {
    saveZip: jest.fn(async (_sourceUri: string, _suggestedFileName: string) => {}),
  },
};

export const Image = {
  getSize: jest.fn(
    (
      _uri: string,
      success: (width: number, height: number) => void,
      _failure?: (error: Error) => void,
    ) => success(1200, 800),
  ),
};

export const __mockReactNativeState = {
  Platform,
  NativeModules,
  Image,
};
