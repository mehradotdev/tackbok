import { useSettingsStore } from './store';

const mockSaved = new Map<string, string>();
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => mockSaved.get(key) ?? null,
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

beforeEach(() => mockSaved.clear());

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
