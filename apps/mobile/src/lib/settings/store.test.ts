import {
  applyProfileCacheReload,
  getProfileCacheRevision,
  hydrateProfileCache,
  useSettingsStore,
} from './store';

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
let mockCommit: Promise<void> = Promise.resolve();
jest.mock('~/lib/cloudSync/storage/repositories', () => ({
  runInCloudSyncTransaction: async (work: (tx: object) => Promise<unknown>) => {
    await mockCommit;
    return work({});
  },
  updateProfileInTransaction: async () => {},
}));

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

describe('profile cache reloads', () => {
  const restored = {
    profileName: 'Restored',
    profileEmail: null,
    profileImageUri: 'photos/restored.jpg',
  };

  test('a reload with no profile write meanwhile applies', () => {
    useSettingsStore.setState({ profileName: null, profileImageUri: null });
    expect(applyProfileCacheReload(getProfileCacheRevision(), restored)).toBe(true);
    expect(useSettingsStore.getState().profileImageUri).toBe('photos/restored.jpg');
  });

  test('a reload never puts back a value a local edit replaced while it read', async () => {
    useSettingsStore.setState({ profileImageUri: null });
    let commit!: () => void;
    mockCommit = new Promise((resolve) => {
      commit = resolve;
    });
    // The edit starts, then a reload reads the database before it commits.
    const edit = useSettingsStore.getState().setProfileImageUri('photos/mine.jpg');
    const revision = getProfileCacheRevision();
    commit();
    await edit;
    expect(applyProfileCacheReload(revision, restored)).toBe(false);
    expect(useSettingsStore.getState().profileImageUri).toBe('photos/mine.jpg');
    mockCommit = Promise.resolve();
  });

  test('a reload that started before an edit is dropped too', async () => {
    const revision = getProfileCacheRevision();
    await useSettingsStore.getState().setProfileName('Mine');
    expect(applyProfileCacheReload(revision, restored)).toBe(false);
    expect(useSettingsStore.getState().profileName).toBe('Mine');
  });

  test('an import or conflict choice written to the cache also wins', () => {
    const revision = getProfileCacheRevision();
    hydrateProfileCache({ profileImageUri: 'photos/imported.jpg' });
    expect(applyProfileCacheReload(revision, restored)).toBe(false);
    expect(useSettingsStore.getState().profileImageUri).toBe('photos/imported.jpg');
  });
});
