import { useSettingsStore } from './store';

const mockDisk = new Map<string, string>();
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) => mockDisk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockDisk.set(key, value);
    },
    removeItem: async (key: string) => {
      mockDisk.delete(key);
    },
  },
}));
jest.mock('react-native', () => ({ Appearance: { getColorScheme: () => 'light' } }));
jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }));
jest.mock('~/lib/theme', () => ({
  DEFAULT_THEME_ID: 'light',
  getThemeConfig: (id: string) => ({ id }),
}));
jest.mock('~/lib/theme/typography', () => ({
  DEFAULT_BODY_FONT_SIZE: 16,
  DEFAULT_TITLE_FONT_SELECTION: 'default',
  normalizeBodyFontSize: (size: number) => size,
  normalizeTitleFontSelection: (font: string) => font,
  applyTitleFont: jest.fn(),
}));
jest.mock('~/lib/cloudSync/storage/repositories', () => ({}));

it.each([0, 1])(
  'removes legacy email when hydrating settings version %s',
  async (version) => {
    mockDisk.set(
      'tackbok-settings',
      JSON.stringify({
        version,
        state: {
          profileEmail: 'legacy@example.com',
          profileName: 'Ada',
          profileImageUri: 'photos/ada.jpg',
          legacyProfileMigrationComplete: false,
          googleDriveBackupEnabled: true,
          backupFrequency: 'daily',
          cloudSyncWifiOnlyMedia: true,
        },
      }),
    );
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState()).not.toHaveProperty('profileEmail');
    expect(useSettingsStore.getState()).not.toHaveProperty('setProfileEmail');
    expect(useSettingsStore.getState()).toMatchObject({
      profileName: 'Ada',
      profileImageUri: 'photos/ada.jpg',
      cloudSyncWifiOnlyMedia: true,
    });
    const saved = JSON.parse(mockDisk.get('tackbok-settings')!);
    expect(saved.version).toBe(2);
    expect(saved.state).not.toHaveProperty('profileEmail');
    expect(saved.state).not.toHaveProperty('googleDriveBackupEnabled');
    expect(saved.state).not.toHaveProperty('backupFrequency');
    expect(saved.state.profileName).toBe('Ada');
  },
);
