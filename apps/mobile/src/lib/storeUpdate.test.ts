import { compareVersions, parseVersion } from './appVersion';
import {
  CHECK_INTERVAL_MS,
  getStoreRelease,
  readStoreRelease,
  storeForBuild,
  storeUpdatePromptFor,
} from './storeUpdate';
import versionFile from '../../../website/public/app-version.json';
import { version as appVersion } from '../../package.json';

const mockSaved = new Map<string, string>();
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => mockSaved.get(key) ?? null,
    setItem: async (key: string, value: string) => void mockSaved.set(key, value),
  },
}));
jest.mock('~/lib/settings', () => ({ useSettingsStore: { getState: () => ({}) } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '2.0.0' }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '2.0.0', extra: {} } }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const file = {
  schema: 1,
  ios: {
    latest: '2.0.1',
    minimumSupported: '1.0.0',
    storeUrl: 'https://apps.apple.com/us/app/tackbok-gratitude-journal/id6757330507',
  },
  android: {
    latest: '2.0.2',
    minimumSupported: '2.0.0',
    storeUrl: 'https://play.google.com/store/apps/details?id=dev.mehra.tackbok',
  },
  galaxy: {
    latest: '2.0.0',
    minimumSupported: '1.0.0',
    storeUrl: 'https://galaxystore.samsung.com/detail/dev.mehra.tackbok',
  },
};

describe('versions', () => {
  test.each(['2.0', '2.0.0.1', 'v2.0.0', '2.0.0-beta', ' 2.0.0', '', null])(
    'rejects %p',
    (input) => expect(parseVersion(input)).toBeNull(),
  );

  test('compare numerically, not as text', () => {
    expect(
      compareVersions(parseVersion('1.10.0')!, parseVersion('1.9.0')!),
    ).toBeGreaterThan(0);
    expect(compareVersions(parseVersion('2.0.0')!, parseVersion('10.0.0')!)).toBeLessThan(
      0,
    );
  });
});

test('Galaxy builds read the galaxy entry', () => {
  expect(storeForBuild('ios', undefined)).toBe('ios');
  expect(storeForBuild('android', 'google')).toBe('android');
  expect(storeForBuild('android', 'samsung')).toBe('galaxy');
  expect(storeForBuild('web', undefined)).toBeNull();
});

describe('readStoreRelease', () => {
  test('another app on Play or Galaxy is ignored too', () => {
    const other = {
      ...file,
      android: {
        ...file.android,
        storeUrl: 'https://play.google.com/store/apps/details?id=com.example',
      },
      galaxy: {
        ...file.galaxy,
        storeUrl: 'https://galaxystore.samsung.com/detail/com.example',
      },
    };
    expect(readStoreRelease(other, 'android')).toBeNull();
    expect(readStoreRelease(other, 'galaxy')).toBeNull();
  });

  test('reads each store', () => {
    expect(readStoreRelease(file, 'galaxy')?.latest).toBe('2.0.0');
    expect(readStoreRelease(file, 'android')?.minimumSupported).toBe('2.0.0');
  });

  test.each([
    ['another schema', { ...file, schema: 2 }],
    ['a loose version', { ...file, ios: { ...file.ios, latest: '2.1' } }],
    ['no minimum', { ...file, ios: { ...file.ios, minimumSupported: undefined } }],
    [
      'plain http',
      { ...file, ios: { ...file.ios, storeUrl: 'http://apps.apple.com/x' } },
    ],
    ['another store', { ...file, ios: { ...file.ios, storeUrl: file.android.storeUrl } }],
    [
      'a look-alike host',
      { ...file, ios: { ...file.ios, storeUrl: 'https://apps.apple.com.evil.test/' } },
    ],
    [
      'a minimum above the latest',
      { ...file, ios: { ...file.ios, minimumSupported: '2.0.2' } },
    ],
    [
      'another app in the right store',
      {
        ...file,
        ios: { ...file.ios, storeUrl: 'https://apps.apple.com/us/app/other/id123' },
      },
    ],
    ['no entry', { schema: 1 }],
    ['not an object', '<!doctype html>'],
  ])('ignores %s', (_name, input) => {
    expect(readStoreRelease(input, 'ios')).toBeNull();
  });

  test('the published file is valid and never prompts this app version', () => {
    for (const store of ['ios', 'android', 'galaxy'] as const) {
      const release = readStoreRelease(versionFile, store);
      expect(release).not.toBeNull();
      expect(storeUpdatePromptFor(appVersion, release, null)).toBeNull();
    }
  });
});

describe('storeUpdatePromptFor', () => {
  const release = readStoreRelease(file, 'ios');

  test('offers a newer store version, until "Not now" for that version', () => {
    expect(storeUpdatePromptFor('2.0.0', release, null)).toEqual({
      latest: '2.0.1',
      storeUrl: file.ios.storeUrl,
      required: false,
    });
    expect(storeUpdatePromptFor('2.0.0', release, '2.0.1')).toBeNull();
    // An older "Not now" doesn't cover a newer version.
    expect(storeUpdatePromptFor('2.0.0', release, '2.0.0')).not.toBeNull();
  });

  test('stays quiet on the latest version, a newer one, or an unreadable one', () => {
    expect(storeUpdatePromptFor('2.0.1', release, null)).toBeNull();
    expect(storeUpdatePromptFor('2.1.0', release, null)).toBeNull();
    expect(storeUpdatePromptFor(null, release, null)).toBeNull();
    expect(storeUpdatePromptFor('2.0.0', null, null)).toBeNull();
  });

  test('below the minimum, "Not now" does not keep it away', () => {
    const android = readStoreRelease(file, 'android');
    expect(storeUpdatePromptFor('1.0.3', android, '2.0.2')).toMatchObject({
      required: true,
    });
  });
});

describe('getStoreRelease', () => {
  const now = 1_800_000_000_000;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockSaved.clear();
    fetchMock = jest.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify(file),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test('checks at most once a day and reuses the cached file', async () => {
    expect((await getStoreRelease('ios', { now }))?.latest).toBe('2.0.1');
    expect((await getStoreRelease('android', { now: now + 1000 }))?.latest).toBe('2.0.2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getStoreRelease('ios', { now: now + CHECK_INTERVAL_MS });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('sends a plain GET with no identifying headers', async () => {
    await getStoreRelease('ios', { now });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tackbok.org/app-version.json');
    expect(init.method).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  test.each([
    [
      'a 404 page',
      async () => ({ status: 404, text: async () => '<html>Not found</html>' }),
    ],
    [
      'a 200 that is not JSON',
      async () => ({ status: 200, text: async () => '<html></html>' }),
    ],
    ['a network error', async () => Promise.reject(new Error('offline'))],
  ])(
    'treats %s as no prompt, and waits a day before asking again',
    async (_name, reply) => {
      fetchMock.mockImplementation(reply);
      expect(await getStoreRelease('ios', { now })).toBeNull();
      expect(await getStoreRelease('ios', { now: now + 1000 })).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  test('an uncached check (a dev test file) leaves the daily cache alone', async () => {
    await getStoreRelease('ios', {
      now,
      url: 'http://127.0.0.1/test.json',
      useCache: false,
    });
    expect(mockSaved.size).toBe(0);
  });

  test('a clock set back checks again', async () => {
    await getStoreRelease('ios', { now });
    await getStoreRelease('ios', { now: now - 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
