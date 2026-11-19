const mockStorage = new Map<string, string>();
const mockSettings = {
  setTheme: jest.fn(),
  setTitleFont: jest.fn(),
  setBodyFontSize: jest.fn(),
  setHasCompletedOnboarding: jest.fn(),
  setHasSeenHomeCoachMarks: jest.fn(),
  resetToDefaults: jest.fn(),
};
const mockSetLocale = jest.fn(async () => {});
const mockReset = jest.fn(async () => [] as string[]);
const mockStopSync = jest.fn();
const mockImport = jest.fn(async () => ({ importedEntries: 3, updatedEntries: 0 }));
// A real reload never returns to this runtime.
const mockReload = jest.fn(() => new Promise<void>(() => {}));
const mockAlert = jest.fn();
const mockI18n = { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() };
const mockFiles = new Set<string>();
let mockLaunchArgument: string | null = null;
let mockAppVariant = 'beta';

jest.mock('react-native', () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  I18nManager: mockI18n,
  Linking: { getInitialURL: async () => null },
  Platform: { OS: 'ios' },
  Settings: { get: () => mockLaunchArgument },
}));
jest.mock('expo', () => ({ reloadAppAsync: () => mockReload() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { appVariant: mockAppVariant } };
    },
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///docs/' } },
  File: class {
    uri: string;
    constructor(directory: { uri: string }, name: string) {
      this.uri = directory.uri + name;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
  },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRootNavigationState: () => undefined,
}));
jest.mock('~/lib/backupImport', () => ({
  importFromTackbokBackup: (...args: unknown[]) => mockImport(...(args as [])),
}));
jest.mock('~/lib/cloudSync/runtime', () => ({
  stopProductionSyncRuntime: () => mockStopSync(),
}));
jest.mock('~/lib/cloudSync/ui', () => ({ resetThisDeviceOnly: () => mockReset() }));
jest.mock('~/lib/i18n', () => ({
  RTL_LOCALES: ['ar', 'he'],
  getEffectiveSupportedLocale: (_tags: string[], preference: string) =>
    preference === 'device' ? 'en' : preference,
  useLocaleStore: { getState: () => ({ setLocalePreference: mockSetLocale }) },
}));
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => void mockStorage.set(key, value),
    removeItem: async (key: string) => void mockStorage.delete(key),
  },
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: { getState: () => mockSettings },
}));
jest.mock('~/screens/home/Header', () => ({ hideBetaBadge: jest.fn() }));
jest.mock('~/screens/home/header-greeting', () => ({ skipLaunchGreeting: jest.fn() }));
jest.mock('./parse', () => jest.requireActual('./parse'));
jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }));

/** Starts a fresh JS runtime (a launch or a reload) and resolves once the app may render. */
async function launch(): Promise<boolean> {
  let ready = false;
  let useDevSetup!: typeof import('./index').useDevSetup;
  let renderer!: typeof import('react-test-renderer');
  // The isolated registry gets its own React, so render with the same copy.
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ useDevSetup } = require('./index'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    renderer = require('react-test-renderer');
  });
  function Probe({ onReady }: { onReady: (value: boolean) => void }) {
    onReady(useDevSetup(true));
    return null;
  }
  await renderer.act(async () => {
    renderer.create(<Probe onReady={(value) => (ready = value)} />);
  });
  return ready;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  mockFiles.clear();
  mockLaunchArgument = null;
  mockAppVariant = 'beta';
  mockI18n.isRTL = false;
});

test('renders at once without a launch argument', async () => {
  expect(await launch()).toBe(true);
  expect(mockSettings.setTheme).not.toHaveBeenCalled();
  expect(mockAlert).not.toHaveBeenCalled();
});

test('applies a request once, and again only with a new run token', async () => {
  mockFiles.add('file:///docs/demo.zip');
  mockLaunchArgument = 'reset=1,restore=demo.zip,theme=dark,onboarding=done,run=1';
  expect(await launch()).toBe(true);
  expect(mockReset).toHaveBeenCalledTimes(1);
  expect(mockStopSync).toHaveBeenCalledTimes(1);
  expect(mockImport).toHaveBeenCalledWith('file:///docs/demo.zip', 'overwrite');
  expect(mockSettings.setTheme).toHaveBeenCalledWith('dark');
  // A reset without a locale returns to the device language.
  expect(mockSetLocale).toHaveBeenCalledWith('device');

  // A reload (for example a language change in Settings) keeps the argument.
  await launch();
  expect(mockReset).toHaveBeenCalledTimes(1);
  expect(mockImport).toHaveBeenCalledTimes(1);
  expect(mockSettings.setTheme).toHaveBeenCalledTimes(1);

  mockLaunchArgument = mockLaunchArgument.replace('run=1', 'run=2');
  await launch();
  expect(mockReset).toHaveBeenCalledTimes(2);
  expect(mockImport).toHaveBeenCalledTimes(2);
});

test('reloads once for a direction change and never loops', async () => {
  mockLaunchArgument = 'locale=ar';
  await launch();
  expect(mockI18n.forceRTL).toHaveBeenCalledWith(true);
  expect(mockReload).toHaveBeenCalledTimes(1);

  // The direction did not change on reload: report it instead of reloading again.
  await launch();
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(mockAlert).toHaveBeenCalledWith(
    'Dev setup',
    expect.stringContaining('layout direction did not change'),
  );

  mockI18n.isRTL = true;
  mockAlert.mockClear();
  await launch();
  expect(mockAlert).not.toHaveBeenCalled();
});

test('reports a missing backup and invalid values but applies the rest', async () => {
  mockLaunchArgument = 'restore=missing.zip,theme=nope,fontSize=large';
  expect(await launch()).toBe(true);
  expect(mockImport).not.toHaveBeenCalled();
  expect(mockSettings.setBodyFontSize).toHaveBeenCalledWith('large');
  const message = mockAlert.mock.calls[0]?.[1] as string;
  expect(message).toContain('theme: unsupported value "nope"');
  expect(message).toContain('restore: file:///docs/missing.zip not found');
});

test('a failed restore still applies the other settings', async () => {
  mockFiles.add('file:///docs/broken.zip');
  mockImport.mockRejectedValueOnce(new Error('not a ZIP'));
  mockLaunchArgument = 'restore=broken.zip,theme=dark,onboarding=done';
  expect(await launch()).toBe(true);
  expect(mockSettings.setTheme).toHaveBeenCalledWith('dark');
  expect(mockSettings.setHasCompletedOnboarding).toHaveBeenCalledWith(true);
  expect(mockAlert).toHaveBeenCalledWith('Dev setup', 'restore: not a ZIP');
});

test('a failing step still lets the app render', async () => {
  mockLaunchArgument = 'reset=1,theme=dark';
  mockReset.mockRejectedValueOnce(new Error('database busy'));
  expect(await launch()).toBe(true);
  expect(mockAlert).toHaveBeenCalledWith('Dev setup', 'database busy');
});

test('does nothing outside beta builds', async () => {
  mockAppVariant = 'production';
  mockLaunchArgument = 'theme=dark';
  expect(await launch()).toBe(true);
  expect(mockSettings.setTheme).not.toHaveBeenCalled();
});
