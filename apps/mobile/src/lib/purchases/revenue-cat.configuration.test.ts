import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';

jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('~/lib/externalAuthentication', () => ({
  withExternalAuthentication: (action: () => unknown) => action(),
}));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(async () => false),
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    LOG_LEVEL: { DEBUG: 'DEBUG' },
  },
}));

const originalEnv = { ...process.env };
const originalDev = __DEV__;
const testGlobal = globalThis as typeof globalThis & { __DEV__: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = 'goog_test';
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_test';
  process.env.EXPO_PUBLIC_REVENUECAT_GALAXY_API_KEY = 'galx_test';
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = 'test_test';
  testGlobal.__DEV__ = false;
});

afterAll(() => {
  process.env = originalEnv;
  testGlobal.__DEV__ = originalDev;
});

// A fresh initialization promise for each case, sharing the configured mocks.
function initialize() {
  let result!: Promise<void>;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    result = require('./revenue-cat').initializeRevenueCat();
  });
  return result;
}

test.each([
  ['google', 'android', 'production', 'PRODUCTION', false, { apiKey: 'goog_test' }],
  [
    'samsung',
    'android',
    'production',
    'PRODUCTION',
    false,
    { apiKey: 'galx_test', store: 'GALAXY', galaxyBillingMode: 'PRODUCTION' },
  ],
  [
    'samsung',
    'android',
    'beta',
    'TEST',
    true,
    { apiKey: 'galx_test', store: 'GALAXY', galaxyBillingMode: 'TEST' },
  ],
  ['google', 'android', 'beta', 'PRODUCTION', false, { apiKey: 'test_test' }],
  ['google', 'android', 'production', 'PRODUCTION', true, { apiKey: 'test_test' }],
  ['samsung', 'ios', 'production', 'PRODUCTION', false, { apiKey: 'appl_test' }],
] as const)(
  'configures %s on %s (%s, %s, dev=%s)',
  async (androidStore, platform, appVariant, galaxyBillingMode, dev, expected) => {
    Constants.expoConfig!.extra = { androidStore, appVariant, galaxyBillingMode };
    Platform.OS = platform;
    testGlobal.__DEV__ = dev;
    await initialize();
    expect(Purchases.configure).toHaveBeenCalledWith(expected);
  },
);

test('missing Samsung key fails rather than falling back to Google or Test Store', async () => {
  Constants.expoConfig!.extra = { androidStore: 'samsung' };
  delete process.env.EXPO_PUBLIC_REVENUECAT_GALAXY_API_KEY;
  await expect(initialize()).rejects.toMatchObject({ category: 'configuration' });
  expect(Purchases.configure).not.toHaveBeenCalled();
});

test('rejects invalid Galaxy billing mode', async () => {
  Constants.expoConfig!.extra = { androidStore: 'samsung', galaxyBillingMode: 'typo' };
  await expect(initialize()).rejects.toMatchObject({ category: 'configuration' });
  expect(Purchases.configure).not.toHaveBeenCalled();
});
