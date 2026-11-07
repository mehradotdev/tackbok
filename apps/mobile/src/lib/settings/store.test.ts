import { useSettingsStore } from './store';

const mockSaved = new Map<string, string>();
let mockReadFailure = false;
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => {
      if (mockReadFailure) throw new Error('transient read failure');
      return mockSaved.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => void mockSaved.set(key, value),
    removeItem: async (key: string) => void mockSaved.delete(key),
  },
}));
jest.mock('react-native', () => ({ Appearance: { getColorScheme: () => 'light' } }));
jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }));
jest.mock('~/lib/theme/typography', () => ({
  ...jest.requireActual('~/lib/theme/typography'),
  applyTitleFont: jest.fn(),
}));
jest.mock('~/lib/cloudSync/storage/repositories', () => ({}));

beforeEach(() => {
  mockSaved.clear();
  mockReadFailure = false;
});

// The profile backfill uses this to tell a fresh install's empty profile from
// an older install's possibly deliberate clear.
it('records whether an earlier launch saved settings', async () => {
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()._hadSavedSettings).toBe(false);

  mockSaved.set(
    'tackbok-settings',
    JSON.stringify({ state: { profileName: null }, version: 1 }),
  );
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()._hadSavedSettings).toBe(true);
});

it('treats an unreadable settings store as prior use', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  useSettingsStore.setState({ _hadSavedSettings: false, _hasHydrated: false });
  mockSaved.set(
    'tackbok-settings',
    JSON.stringify({
      state: { profileName: null, hasCompletedOnboarding: true },
      version: 1,
    }),
  );
  mockReadFailure = true;
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()._hasHydrated).toBe(true);
  expect(useSettingsStore.getState()._hadSavedSettings).toBe(true);
  warn.mockRestore();
});
