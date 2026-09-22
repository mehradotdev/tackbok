import type { LocalePreference } from './types';

const mockDisk = new Map<string, string>();
let mockWriteError: Error | undefined;
let mockReadError: Error | undefined;
let mockRTL = false;
let mockTags = ['en-US'];
const mockRemove = jest.fn(async (key: string) => {
  mockDisk.delete(key);
});
jest.mock('react-native', () => ({
  I18nManager: {
    get isRTL() {
      return mockRTL;
    },
  },
}));
jest.mock('expo-localization', () => ({
  getLocales: () => mockTags.map((languageTag) => ({ languageTag })),
}));
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => {
      if (mockReadError) throw mockReadError;
      return mockDisk.get(key) ?? null;
    },
    removeItem: (key: string) => mockRemove(key),
    setItem: (key: string, value: string) => {
      if (mockWriteError) return Promise.reject(mockWriteError);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          mockDisk.set(key, value);
          resolve();
        }, 1000);
      });
    },
    getItemSync: () => {
      throw new Error('Do not mix sync and async database handles');
    },
    setItemSync: () => {
      throw new Error('Do not mix sync and async database handles');
    },
  },
}));

function coldStart() {
  let store!: typeof import('./store').useLocaleStore;
  jest.isolateModules(() => {
    store = jest.requireActual<typeof import('./store')>('./store').useLocaleStore;
  });
  return store;
}

beforeEach(() => {
  mockWriteError = undefined;
  mockReadError = undefined;
  mockRTL = false;
  mockTags = ['en-US'];
  mockRemove.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.useFakeTimers();
  mockDisk.clear();
});

it('restores the visible language when the preference write fails', async () => {
  const store = coldStart();
  await store.persist.rehydrate();
  await jest.runAllTimersAsync();
  mockWriteError = new Error('database connection closed');
  await expect(store.getState().setLocalePreference('he')).rejects.toThrow(
    mockWriteError,
  );
  expect(store.getState().localePreference).toBe('device');
  expect(mockDisk.has('tackbok-locale')).toBe(false);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it.each<[LocalePreference, LocalePreference]>([
  ['device', 'he'],
  ['en', 'ar'],
  ['ar', 'en'],
  ['he', 'device'],
])(
  'persists %s → %s before an RTL restart can discard pending writes',
  async (from, to) => {
    mockDisk.set(
      'tackbok-locale',
      JSON.stringify({ state: { localePreference: from }, version: 0 }),
    );
    const store = coldStart();
    await store.persist.rehydrate();
    await jest.runAllTimersAsync();

    let saved = false;
    const saving = store
      .getState()
      .setLocalePreference(to)
      .then(() => {
        saved = true;
      });
    // A slow save must keep the restart waiting beyond the old 500 ms deadline.
    await jest.advanceTimersByTimeAsync(500);
    expect(saved).toBe(false);
    await jest.runAllTimersAsync();
    await saving;
    expect(saved).toBe(true);

    const restarted = coldStart();
    await restarted.persist.rehydrate();
    expect(restarted.getState().localePreference).toBe(to);
    expect(restarted.getState()._hasHydrated).toBe(true);
  },
);

it('restores the existing persisted format during asynchronous hydration', async () => {
  mockDisk.set(
    'tackbok-locale',
    JSON.stringify({ state: { localePreference: 'ar' }, version: 0 }),
  );
  const store = coldStart();
  await store.persist.rehydrate();
  expect(store.getState().localePreference).toBe('ar');
  expect(store.getState()._hasHydrated).toBe(true);
});

it('hydrates a fresh install with the device language preference', async () => {
  const store = coldStart();
  await store.persist.rehydrate();
  expect(store.getState().localePreference).toBe('device');
  expect(store.getState()._hasHydrated).toBe(true);
});

it('recovers from malformed JSON and removes only the corrupt locale entry', async () => {
  mockDisk.set('tackbok-locale', '{broken');
  mockDisk.set('tackbok-settings', 'keep');
  const store = coldStart();
  await store.persist.rehydrate();
  expect(store.getState()._hasHydrated).toBe(true);
  expect(store.getState().localePreference).toBe('en');
  expect(mockRemove).toHaveBeenCalledWith('tackbok-locale');
  expect(mockDisk.has('tackbok-locale')).toBe(false);
  expect(mockDisk.get('tackbok-settings')).toBe('keep');
});

it('unblocks startup even when corrupt-data cleanup fails', async () => {
  mockDisk.set('tackbok-locale', '{broken');
  mockRemove
    .mockRejectedValueOnce(new Error('read-only'))
    .mockRejectedValueOnce(new Error('read-only'));
  const store = coldStart();
  await store.persist.rehydrate();
  expect(store.getState()._hasHydrated).toBe(true);
  expect(mockDisk.get('tackbok-locale')).toBe('{broken');
});

it('does not mistake a storage SyntaxError for corrupt saved JSON', async () => {
  const saved = JSON.stringify({ state: { localePreference: 'he' }, version: 0 });
  mockDisk.set('tackbok-locale', saved);
  mockReadError = new SyntaxError('storage query failed');
  const store = coldStart();
  await store.persist.rehydrate();
  expect(store.getState()._hasHydrated).toBe(true);
  expect(mockRemove).not.toHaveBeenCalled();
  expect(mockDisk.get('tackbok-locale')).toBe(saved);
});

it.each([
  [false, ['en-US'], 'en'],
  [true, ['he-IL'], 'he'],
  [true, ['en-US', 'he-IL'], 'he'],
  [true, ['en-US'], 'ar'],
  [false, ['he-IL'], 'en'],
] as const)(
  'uses a session fallback matching RTL=%s and device=%s',
  async (rtl, tags, expected) => {
    const saved = JSON.stringify({ state: { localePreference: 'he' }, version: 0 });
    mockDisk.set('tackbok-locale', saved);
    mockReadError = new Error('database temporarily unavailable');
    mockWriteError = new Error('database temporarily unavailable');
    mockRTL = rtl;
    mockTags = [...tags];
    const store = coldStart();
    await store.persist.rehydrate();
    await jest.runAllTimersAsync();
    expect(store.getState()._hasHydrated).toBe(true);
    expect(store.getState().localePreference).toBe(expected);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockDisk.get('tackbok-locale')).toBe(saved);
    mockReadError = undefined;
    await store.persist.rehydrate();
    expect(store.getState().localePreference).toBe('he');
  },
);

it('keeps an already loaded RTL preference when a subsequent read fails', async () => {
  mockRTL = true;
  mockDisk.set(
    'tackbok-locale',
    JSON.stringify({ state: { localePreference: 'he' }, version: 0 }),
  );
  const store = coldStart();
  await store.persist.rehydrate();
  mockReadError = new Error('offline storage');
  await store.persist.rehydrate();
  expect(store.getState().localePreference).toBe('he');
  expect(store.getState()._hasHydrated).toBe(true);
});
