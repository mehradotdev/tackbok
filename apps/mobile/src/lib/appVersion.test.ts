import {
  appUpdatedThisLaunch,
  recordLastSeenAppVersion,
  resetAppUpdatedThisLaunch,
} from './appVersion';

let mockSettings: { hasCompletedOnboarding: boolean; lastSeenAppVersion: string | null };
const mockSetLastSeen = jest.fn((version: string) => {
  mockSettings.lastSeenAppVersion = version;
});
jest.mock('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => ({ ...mockSettings, setLastSeenAppVersion: mockSetLastSeen }),
  },
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '2.0.0' } }));

function launch(hasCompletedOnboarding: boolean, lastSeenAppVersion: string | null) {
  mockSettings = { hasCompletedOnboarding, lastSeenAppVersion };
  resetAppUpdatedThisLaunch();
}

test.each([
  ['an update from 1.x, which stored no version', true, null, true],
  ['an update from an older 2.x', true, '1.9.9', true],
  ['the same version again', true, '2.0.0', false],
  ['a fresh install', false, null, false],
  ['a newer recorded version', true, '2.1.0', false],
  ['an unreadable record', true, 'v2', false],
] as const)('%s', (_name, onboarded, lastSeen, expected) => {
  launch(onboarded, lastSeen);
  expect(appUpdatedThisLaunch()).toBe(expected);
});

test('recording this launch does not hide the update until the next launch', () => {
  launch(true, '1.0.3');
  recordLastSeenAppVersion();
  expect(mockSetLastSeen).toHaveBeenCalledWith('2.0.0');
  expect(appUpdatedThisLaunch()).toBe(true);
  resetAppUpdatedThisLaunch();
  expect(appUpdatedThisLaunch()).toBe(false);
});

test('a fresh install that finishes onboarding this launch still does not count', () => {
  launch(false, null);
  recordLastSeenAppVersion();
  mockSettings.hasCompletedOnboarding = true;
  expect(appUpdatedThisLaunch()).toBe(false);
});
