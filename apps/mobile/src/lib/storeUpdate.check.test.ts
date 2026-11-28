// checkForStoreUpdate reads the build at import, so each case loads it afresh.
const mockFetch = jest.fn(async () => ({
  status: 200,
  text: async () =>
    JSON.stringify({
      schema: 1,
      ios: {
        latest: '2.0.1',
        minimumSupported: '1.0.0',
        storeUrl: 'https://apps.apple.com/us/app/tackbok-gratitude-journal/id6757330507',
      },
    }),
}));

function load(extra: Record<string, unknown>, native: string) {
  jest.resetModules();
  jest.doMock('~/lib/kvStorage', () => ({
    kvStorage: { getItem: async () => null, setItem: async () => {} },
  }));
  jest.doMock('~/lib/settings', () => ({ useSettingsStore: { getState: () => ({}) } }));
  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  // The JS bundle (an OTA update) can be newer than the installed app.
  jest.doMock('expo-constants', () => ({ expoConfig: { version: '9.9.9', extra } }));
  jest.doMock('expo-application', () => ({ nativeApplicationVersion: native }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./storeUpdate') as typeof import('./storeUpdate');
}

beforeEach(() => {
  mockFetch.mockClear();
  global.fetch = mockFetch as unknown as typeof fetch;
});

test('compares the installed app version, not the JS bundle version', async () => {
  const { checkForStoreUpdate } = load({}, '2.0.0');
  expect(await checkForStoreUpdate()).toMatchObject({ latest: '2.0.1' });
});

test('never checks on beta builds', async () => {
  const { checkForStoreUpdate } = load({ appVariant: 'beta' }, '2.0.0');
  expect(await checkForStoreUpdate()).toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
});
