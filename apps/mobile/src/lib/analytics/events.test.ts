import * as fs from 'fs';
import * as path from 'path';
import {
  ANALYTICS_EVENT_NAMES,
  CLOUD_SYNC_ANALYTICS_EVENT_NAMES,
  getScreenName,
  SCREEN_ROUTE_MAP,
  SUPPORT_ANALYTICS_EVENT_NAMES,
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

describe('analytics privacy disclosure', () => {
  test('renders the compiler-enforced complete event catalog', () => {
    const privacyScreen = fs.readFileSync(
      path.resolve(__dirname, '../../screens/onboarding/PrivacyScreen.tsx'),
      'utf8',
    );

    expect(privacyScreen).toContain('ANALYTICS_EVENT_NAMES.map');
    expect(new Set(ANALYTICS_EVENT_NAMES).size).toBe(ANALYTICS_EVENT_NAMES.length);
  });
});

describe('cloud-sync analytics allowlist', () => {
  test('stays synchronized across the catalog and website policy', () => {
    expect(CLOUD_SYNC_ANALYTICS_EVENT_NAMES).toEqual([
      'cloud_sync_connected',
      'cloud_sync_started',
      'cloud_sync_succeeded',
      'cloud_sync_failed',
      'cloud_sync_conflict_recovered',
      'cloud_sync_repair_result',
    ]);
    // The website policy covers these events in plain language rather than by
    // name. Naming them there creates a second list that drifts silently the
    // next time the catalog changes; the in-app screen above already renders
    // the exact names straight from the catalog.
    const websitePolicy = fs.readFileSync(
      path.resolve(__dirname, '../../../../website/src/pages/privacy.astro'),
      'utf8',
    );
    expect(websitePolicy).not.toMatch(/cloud_sync_/);
    expect(websitePolicy).toContain('optional cloud backup');
  });

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

describe('support analytics allowlist', () => {
  test('contains only the reviewed support actions', () => {
    expect(SUPPORT_ANALYTICS_EVENT_NAMES).toEqual([
      'support_purchase_started',
      'support_purchase_completed',
      'support_purchase_cancelled',
      'support_purchase_pending',
      'support_purchase_failed',
      'support_share_opened',
      'support_rate_opened',
    ]);
  });

  test('purchase payloads contain only a tier and coarse failure category', () => {
    const completed: AnalyticsEvents['support_purchase_completed'] = { tier: 'small' };
    const failed: AnalyticsEvents['support_purchase_failed'] = {
      tier: 'deepest',
      category: 'store',
    };

    expect(Object.keys(completed)).toEqual(['tier']);
    expect(Object.keys(failed).sort()).toEqual(['category', 'tier']);
  });
});
