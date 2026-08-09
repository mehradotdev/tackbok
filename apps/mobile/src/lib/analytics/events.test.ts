import {
  getScreenName,
  SCREEN_ROUTE_MAP,
  toCloudSyncCountBucket,
  toCloudSyncDurationBucket,
  type AnalyticsEvents,
} from './events';

describe('analytics screen routes', () => {
  test.each(Object.entries(SCREEN_ROUTE_MAP))(
    'maps %s to %s',
    (pattern, screen) => {
      const pathname = pattern.replace(/\[[^/]+\]/g, 'example');
      expect(getScreenName(pathname)).toBe(screen);
    },
  );

  test.each([
    '/not-allowlisted',
    '/onboarding/welcome',
    '/gratitudeEntry/note-123/extra',
    '/dateEntries',
  ])('does not track unknown route %s', (pathname) => {
    expect(getScreenName(pathname)).toBeNull();
  });
});

describe('cloud-sync analytics allowlist', () => {
  test('uses coarse buckets only', () => {
    expect([0, 1, 10, 11, 100, 101].map(toCloudSyncCountBucket)).toEqual([
      '0', '1-10', '1-10', '11-100', '11-100', '100+',
    ]);
    expect([999, 1_000, 10_000, 60_000].map(toCloudSyncDurationBucket)).toEqual([
      '<1s', '1-10s', '10-60s', '60s+',
    ]);
  });

  test('payload shapes cannot accept identifiers or content', () => {
    const success: AnalyticsEvents['cloud_sync_succeeded'] = {
      duration_bucket: '<1s',
      pulled_bucket: '1-10',
      pushed_bucket: '0',
    };
    expect(Object.keys(success).sort()).toEqual([
      'duration_bucket', 'pulled_bucket', 'pushed_bucket',
    ]);
  });
});
