import type { PostHogOptions } from 'posthog-react-native';

let mockEnabled = false;
let mockSubscriber: (
  state: { analyticsEnabled: boolean },
  prev: { analyticsEnabled: boolean },
) => void;
let mockAppStateListener: (state: string) => void;
let mockReady: Promise<void>;
let mockOptIn: Promise<void>;
const originalDev = __DEV__;
const testGlobals = globalThis as typeof globalThis & { __DEV__: boolean };
let mockStats: Promise<{ entryCount: number; daysWithEntries: number }>;
let mockExtra: Record<string, string>;
let mockPlatform = 'ios';
const mockInstances: any[] = [];
const mockConstructor = jest.fn();
const mockKv = new Map<string, string>();
let mockAppIcon = 'Classic';
let mockCloudSync = 'off';
let mockKvGet: ((key: string) => Promise<string | null>) | null = null;
let mockCloudSyncRead: (() => Promise<string>) | null = null;
jest.mock('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => ({
      analyticsEnabled: mockEnabled,
      theme: 'forest',
      titleFont: 'lora',
      bodyFontSize: 'large',
      dailyReminderEnabled: true,
      biometricUnlockEnabled: false,
      journalPromptsMode: 'off',
      profileName: 'Private Name',
      reminderTime: '07:15',
    }),
    subscribe: (callback: typeof mockSubscriber) => {
      mockSubscriber = callback;
    },
  },
}));
jest.mock('~/db/queries', () => ({
  getEntryStats: () => mockStats,
  getCloudSyncState: async () =>
    mockCloudSyncRead ? mockCloudSyncRead() : mockCloudSync,
}));
jest.mock('~/lib/appIcon', () => ({
  useAppIconStore: {
    getState: () => ({ current: mockAppIcon, refresh: async () => {} }),
  },
}));
jest.mock('~/lib/i18n/store', () => ({
  useLocaleStore: { getState: () => ({ localePreference: 'device' }) },
  getEffectiveSupportedLocale: (tags: string[]) => (tags[0] === 'sv-SE' ? 'sv' : 'en'),
}));
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: async (key: string) =>
      mockKvGet ? mockKvGet(key) : (mockKv.get(key) ?? null),
    setItem: async (key: string, value: string) => {
      mockKv.set(key, value);
    },
    removeItem: async (key: string) => {
      mockKv.delete(key);
    },
  },
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'SE', languageTag: 'sv-SE' }],
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, callback: typeof mockAppStateListener) => {
      mockAppStateListener = callback;
    },
  },
}));
jest.mock('posthog-react-native', () => ({
  PostHogPersistedProperty: { Queue: 'queue' },
  PostHog: function (_key: string, options: PostHogOptions) {
    mockConstructor(options);
    const instance = {
      options,
      ready: jest.fn(() => mockReady),
      optIn: jest.fn(() => mockOptIn),
      optOut: jest.fn(async () => {}),
      capture: jest.fn(),
      setPersistedProperty: jest.fn(),
      reset: jest.fn(),
      shutdown: jest.fn(async () => {}),
    };
    mockInstances.push(instance);
    return instance;
  },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function consent(enabled: boolean) {
  const previous = mockEnabled;
  mockEnabled = enabled;
  mockSubscriber({ analyticsEnabled: enabled }, { analyticsEnabled: previous });
}
function load() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./index') as typeof import('./index');
}
function events() {
  return mockInstances.flatMap((instance) => instance.capture.mock.calls);
}
beforeEach(() => {
  jest.resetModules();
  mockConstructor.mockClear();
  mockInstances.length = 0;
  mockEnabled = false;
  mockReady = Promise.resolve();
  mockOptIn = Promise.resolve();
  testGlobals.__DEV__ = false;
  mockStats = Promise.resolve({ entryCount: 4, daysWithEntries: 2 });
  mockExtra = { appVariant: 'production', androidStore: 'google' };
  mockPlatform = 'ios';
  mockKv.clear();
  mockAppIcon = 'Classic';
  mockCloudSync = 'off';
  mockKvGet = null;
  mockCloudSyncRead = null;
});

afterEach(() => {
  testGlobals.__DEV__ = originalDev;
});

test('no SDK before consent; enabling records the current screen', async () => {
  const a = load();
  a.initAnalytics();
  a.trackScreenView('/settings');
  a.track('search_used');
  await settle();
  expect(mockConstructor).not.toHaveBeenCalled();
  consent(true);
  await settle();
  expect(events().filter(([event]) => event === '$screen')).toEqual([
    ['$screen', expect.objectContaining({ $screen_name: 'settings' }), expect.anything()],
  ]);
  expect(events().some(([event]) => event === 'search_used')).toBe(false);
  expect(events()).toContainEqual([
    'app_opened',
    expect.objectContaining({ reason: 'consent_enabled' }),
    expect.anything(),
  ]);
});

test('queued screen and action events retain occurrence-time context without IDs', async () => {
  const ready = deferred<void>();
  mockReady = ready.promise;
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  a.trackScreenView('/gratitudeEntry/private-note-id');
  a.track('entry_deleted');
  a.trackScreenView('/settings');
  await settle();
  expect(events()).toEqual([]);
  ready.resolve();
  await settle();
  expect(events().slice(0, 3)).toEqual([
    [
      '$screen',
      expect.objectContaining({ $screen_name: 'entry_view' }),
      expect.anything(),
    ],
    [
      'entry_deleted',
      expect.objectContaining({ $screen_name: 'entry_view' }),
      expect.anything(),
    ],
    ['$screen', expect.objectContaining({ $screen_name: 'settings' }), expect.anything()],
  ]);
  expect(JSON.stringify(events())).not.toContain('private-note-id');
  expect(events().some(([event]) => event === 'screen_viewed')).toBe(false);
  a.trackScreenView('/unknown/private-id');
  a.track('search_used');
  expect(events().at(-1)[1]).not.toHaveProperty('$screen_name');
});

test('revocation blocks capture and clears the queue synchronously', async () => {
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  const instance = mockInstances[0];
  instance.capture.mockClear();
  consent(false);
  a.track('entry_deleted');
  expect(instance.capture).not.toHaveBeenCalled();
  expect(instance.setPersistedProperty).toHaveBeenCalledWith('queue', null);
  expect(instance.optOut).toHaveBeenCalled();
  expect(instance.options.before_send({ event: 'entry_deleted' })).toBeNull();
  await settle();
  expect(instance.reset).toHaveBeenCalled();
  expect(instance.shutdown).toHaveBeenCalled();
});

test('withdrawal before import prevents construction', async () => {
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  consent(false);
  await settle();
  expect(mockConstructor).not.toHaveBeenCalled();
});

test('withdrawal during initialization discards events even after re-enabling', async () => {
  const ready = deferred<void>();
  mockReady = ready.promise;
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  a.track('entry_deleted');
  await settle();
  consent(false);
  consent(true);
  ready.resolve();
  await settle();
  expect(mockInstances).toHaveLength(2);
  expect(mockInstances[0].optIn).not.toHaveBeenCalled();
  expect(mockInstances[0].capture).not.toHaveBeenCalled();
  expect(mockInstances[0].shutdown).toHaveBeenCalled();
  expect(mockInstances[0].options.before_send({ event: 'entry_deleted' })).toBeNull();
  expect(events().some(([event]) => event === 'entry_deleted')).toBe(false);
});

test('late stats from revoked consent cannot leak into a new consent period', async () => {
  const stats = deferred<{ entryCount: number; daysWithEntries: number }>();
  mockStats = stats.promise;
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  consent(false);
  mockStats = Promise.resolve({ entryCount: 1, daysWithEntries: 1 });
  consent(true);
  await settle();
  stats.resolve({ entryCount: 900, daysWithEntries: 900 });
  await settle();
  expect(events().filter(([event]) => event === 'app_opened')).toEqual([
    [
      'app_opened',
      expect.objectContaining({ reason: 'consent_enabled', entry_bucket: '1-10' }),
      expect.anything(),
    ],
  ]);
});

test('buffer commit survives onboarding unmount with original timestamps', async () => {
  const a = load();
  a.initAnalytics();
  a.startPreConsentBuffering();
  a.track('onboarding_step_viewed', { step: 'welcome' });
  const beforeConsent = new Date();
  consent(true);
  const committed = a.commitPreConsentBuffer();
  a.stopPreConsentBuffering();
  await committed;
  const welcome = events().find(([event]) => event === 'onboarding_step_viewed');
  expect(welcome[1]).toMatchObject({ step: 'welcome', analytics_schema_version: 2 });
  expect(welcome[2].timestamp.getTime()).toBeLessThanOrEqual(beforeConsent.getTime());
});

test('revocation invalidates a committed buffer', async () => {
  const a = load();
  a.initAnalytics();
  a.startPreConsentBuffering();
  a.track('onboarding_step_viewed', { step: 'welcome' });
  consent(true);
  const committed = a.commitPreConsentBuffer();
  consent(false);
  consent(true);
  await committed;
  await settle();
  expect(events().some(([event]) => event === 'onboarding_step_viewed')).toBe(false);
});

test('warm visits require background-to-active transition and consent', async () => {
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  a.trackScreenView('/');
  await settle();
  mockAppStateListener('inactive');
  mockAppStateListener('active');
  await settle();
  expect(events().filter(([event]) => event === 'app_opened')).toHaveLength(1);
  mockAppStateListener('background');
  mockAppStateListener('inactive');
  mockAppStateListener('active');
  await settle();
  expect(
    events()
      .filter(([event]) => event === 'app_opened')
      .map(([, props]) => props.reason),
  ).toEqual(['cold_start', 'foreground']);
  expect(events().filter(([event]) => event === '$screen')).toHaveLength(2);
  consent(false);
  mockAppStateListener('background');
  mockAppStateListener('active');
  await settle();
  expect(events().filter(([event]) => event === 'app_opened')).toHaveLength(2);
});

test.each([
  ['ios', 'production', 'google', 'PRODUCTION', 'apple'],
  ['android', 'production', 'google', 'PRODUCTION', 'google'],
  ['android', 'production', 'samsung', 'TEST', 'samsung'],
  ['android', 'beta', 'google', 'PRODUCTION', 'google'],
])(
  'safe metadata for %s/%s/%s/%s',
  async (platform, variant, store, mode, expectedStore) => {
    mockEnabled = true;
    mockPlatform = platform;
    mockExtra = { appVariant: variant, androidStore: store, galaxyBillingMode: mode };
    const a = load();
    a.initAnalytics();
    await settle();
    a.track('search_used');
    expect(events().at(-1)[1]).toMatchObject({
      analytics_schema_version: 2,
      app_variant: variant,
      app_store: expectedStore,
      is_development: variant === 'beta' || mode === 'TEST',
    });
    const options = mockConstructor.mock.calls[0][0];
    expect(options).toMatchObject({
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      disableRemoteConfig: true,
      personProfiles: 'identified_only',
    });
    expect(options.before_send({ event: '$autocapture' })).toBeNull();
    expect(options.before_send({ event: 'search_used' })).toEqual({
      event: 'search_used',
    });
  },
);

test('withdrawal while opt-in is pending cannot publish a client or buffered events', async () => {
  const optIn = deferred<void>();
  mockOptIn = optIn.promise;
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  a.track('entry_deleted');
  await settle();
  expect(mockInstances[0].optIn).toHaveBeenCalled();
  consent(false);
  optIn.resolve();
  await settle();
  expect(events()).toEqual([]);
  expect(mockInstances[0].shutdown).toHaveBeenCalled();
});

test('development runtime is marked even with production app identity', async () => {
  testGlobals.__DEV__ = true;
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  a.track('search_used');
  expect(events().at(-1)[1]).toMatchObject({
    app_variant: 'production',
    is_development: true,
  });
});

test('slow foreground stats do not block disabling and re-enabling analytics', async () => {
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  const stats = deferred<{ entryCount: number; daysWithEntries: number }>();
  mockStats = stats.promise;
  mockAppStateListener('background');
  mockAppStateListener('active');
  await settle();
  consent(false);
  mockStats = Promise.resolve({ entryCount: 1, daysWithEntries: 1 });
  consent(true);
  await settle();
  expect(mockInstances).toHaveLength(2);
  expect(mockInstances[0].shutdown).toHaveBeenCalled();
  stats.resolve({ entryCount: 900, daysWithEntries: 900 });
  await settle();
  expect(
    events().filter(
      ([event, props]) => event === 'app_opened' && props.reason === 'foreground',
    ),
  ).toEqual([]);
});

test('pre-consent screen view prevents duplicate fallback screen emission on opt-in', async () => {
  const a = load();
  a.initAnalytics();
  a.startPreConsentBuffering();
  a.trackScreenView('/settings');
  consent(true);
  const committed = a.commitPreConsentBuffer();
  a.stopPreConsentBuffering();
  await committed;
  await settle();
  const screenEvents = events().filter(([event]) => event === '$screen');
  expect(screenEvents).toHaveLength(1);
  expect(screenEvents[0][1]).toMatchObject({ $screen_name: 'settings' });
});

const SNAPSHOT_KEYS = [
  'theme',
  'locale',
  'locale_follows_device',
  'app_icon',
  'title_font',
  'body_font_size',
  'reminder_enabled',
  'app_lock_enabled',
  'cloud_sync',
  'journal_prompts_mode',
];

function appOpened() {
  return events()
    .filter(([event]) => event === 'app_opened')
    .map(([, props]) => props);
}

test('the first visit of the day carries the settings snapshot, later ones do not', async () => {
  mockEnabled = true;
  mockAppIcon = 'Ocean';
  mockCloudSync = 'paused';
  const a = load();
  a.initAnalytics();
  await settle();
  mockAppStateListener('background');
  mockAppStateListener('active');
  await settle();
  const [first, second] = appOpened();
  expect(first).toMatchObject({
    reason: 'cold_start',
    theme: 'forest',
    locale: 'sv',
    locale_follows_device: true,
    app_icon: 'Ocean',
    title_font: 'lora',
    body_font_size: 'large',
    reminder_enabled: true,
    app_lock_enabled: false,
    cloud_sync: 'paused',
    journal_prompts_mode: 'off',
    device_region: 'SE',
  });
  expect(second.reason).toBe('foreground');
  for (const key of SNAPSHOT_KEYS) expect(second).not.toHaveProperty(key);
  // Never personal settings, even though the store holds them.
  expect(JSON.stringify(events())).not.toMatch(/Private Name|07:15/);
});

test('a snapshot already sent today is not sent again after a restart', async () => {
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  expect(appOpened()[0]).toHaveProperty('theme');
  jest.resetModules();
  mockInstances.length = 0;
  const b = load();
  b.initAnalytics();
  await settle();
  expect(appOpened()).toHaveLength(1);
  for (const key of SNAPSHOT_KEYS) expect(appOpened()[0]).not.toHaveProperty(key);
});

test('a new local day sends the snapshot again', async () => {
  mockKv.set('analytics-settings-snapshot-day', '2000-01-01');
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  expect(appOpened()[0]).toHaveProperty('theme', 'forest');
});

test('concurrent visits claim the day once', async () => {
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  mockAppStateListener('background');
  mockAppStateListener('active');
  await settle();
  const withSnapshot = appOpened().filter((props) => 'theme' in props);
  expect(appOpened()).toHaveLength(2);
  expect(withSnapshot).toHaveLength(1);
});

test('revoking consent forgets the snapshot day', async () => {
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  expect(mockKv.has('analytics-settings-snapshot-day')).toBe(true);
  consent(false);
  await settle();
  expect(mockKv.has('analytics-settings-snapshot-day')).toBe(false);
  consent(true);
  await settle();
  const reenabled = appOpened().at(-1);
  expect(reenabled).toMatchObject({ reason: 'consent_enabled', theme: 'forest' });
});

test('no snapshot day is stored without consent', async () => {
  const a = load();
  a.initAnalytics();
  mockAppStateListener('background');
  mockAppStateListener('active');
  await settle();
  expect(mockKv.size).toBe(0);
});

test('revoking while the snapshot day loads stores nothing and re-enabling still sends it', async () => {
  const stored = deferred<string | null>();
  mockKvGet = () => stored.promise;
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  consent(false);
  stored.resolve(null);
  await settle();
  expect(mockKv.size).toBe(0);
  expect(appOpened()).toEqual([]);
  mockKvGet = null;
  consent(true);
  await settle();
  expect(appOpened().at(-1)).toMatchObject({
    reason: 'consent_enabled',
    theme: 'forest',
  });
  expect(mockKv.get('analytics-settings-snapshot-day')).toBeDefined();
});

test('a failed settings read leaves the day unclaimed for the next visit', async () => {
  mockCloudSyncRead = async () => {
    throw new Error('database locked');
  };
  mockEnabled = true;
  const a = load();
  a.initAnalytics();
  await settle();
  expect(appOpened()[0]).not.toHaveProperty('theme');
  expect(mockKv.size).toBe(0);
  mockCloudSyncRead = null;
  mockAppStateListener('background');
  mockAppStateListener('active');
  await settle();
  expect(appOpened()[1]).toMatchObject({ reason: 'foreground', theme: 'forest' });
});
