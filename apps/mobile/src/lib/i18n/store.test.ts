import type { LocalePreference } from './types';

const mockDisk = new Map<string, string>();
let mockWriteError: Error | undefined;
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => mockDisk.get(key) ?? null,
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
  expect(JSON.parse(mockDisk.get('tackbok-locale')!).state.localePreference).toBe(
    'device',
  );
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
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
