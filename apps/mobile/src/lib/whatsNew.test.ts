import { compareVersions, parseVersion } from './appVersion';
import { shouldShowWhatsNew } from './whatsNew';

jest.mock('expo-constants', () => ({ expoConfig: { version: '2.0.0' } }));

describe('parseVersion', () => {
  test.each([
    ['2.0.0', [2, 0, 0]],
    ['10.12.3', [10, 12, 3]],
  ])('reads %s', (input, expected) => {
    expect(parseVersion(input)).toEqual(expected);
  });

  test.each([
    '',
    '2.0',
    '2.0.0.1',
    'v2.0.0',
    '2.0.0-beta',
    ' 2.0.0',
    '2.x.0',
    null,
    undefined,
  ])('rejects %p', (input) => {
    expect(parseVersion(input)).toBeNull();
  });
});

test('compares numerically, not as text', () => {
  expect(compareVersions([1, 10, 0], [1, 9, 0])).toBeGreaterThan(0);
  expect(compareVersions([2, 0, 0], [10, 0, 0])).toBeLessThan(0);
  expect(compareVersions([2, 0, 1], [2, 0, 1])).toBe(0);
});

describe('shouldShowWhatsNew', () => {
  const updater = {
    hasCompletedOnboarding: true,
    lastSeenAppVersion: null,
    appVersion: '2.0.0',
  };

  test('shows once to someone updating from 1.x', () => {
    expect(shouldShowWhatsNew(updater)).toBe(true);
    expect(shouldShowWhatsNew({ ...updater, lastSeenAppVersion: '2.0.0' })).toBe(false);
  });

  test('never shows before onboarding is finished', () => {
    expect(shouldShowWhatsNew({ ...updater, hasCompletedOnboarding: false })).toBe(false);
  });

  test('shows a later release to someone who last saw an older one', () => {
    expect(
      shouldShowWhatsNew({
        ...updater,
        lastSeenAppVersion: '2.0.0',
        appVersion: '2.1.0',
        whatsNewVersion: '2.1.0',
      }),
    ).toBe(true);
    // A patch release with no new highlights stays quiet.
    expect(
      shouldShowWhatsNew({
        ...updater,
        lastSeenAppVersion: '2.0.0',
        appVersion: '2.0.1',
      }),
    ).toBe(false);
  });

  test('stays quiet when a version cannot be read or the build predates the highlights', () => {
    expect(shouldShowWhatsNew({ ...updater, appVersion: null })).toBe(false);
    expect(shouldShowWhatsNew({ ...updater, appVersion: '1.9.0' })).toBe(false);
    expect(shouldShowWhatsNew({ ...updater, lastSeenAppVersion: 'garbage' })).toBe(false);
  });
});
