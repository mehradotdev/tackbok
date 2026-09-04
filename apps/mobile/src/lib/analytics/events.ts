/**
 * The exhaustive, typed catalog of every analytics event this app can emit.
 *
 * This file is the single source of truth for what leaves the device:
 * autocapture and session replay are disabled, so if an event is not in this
 * map, it cannot be sent. Keep the Analytics section of the public privacy
 * policy (`apps/website/src/pages/privacy.astro`, tackbok.org/privacy) in
 * sync with this file.
 *
 * Rules for adding events:
 * - Bucketed values only — never raw text, lengths, dates, or ids that could
 *   fingerprint journal content or a person.
 * - No PII, ever (no names, emails, entry text, file names, precise location).
 */

import type { SupportTierId } from '~/lib/purchases/support-catalog';

export type CharBucket = '0-50' | '51-200' | '200+';

/** Order-of-magnitude bucket for entry counts / journaled-day counts. */
export type CountBucket = '0' | '1-10' | '11-50' | '51-200' | '200+';

/**
 * Expo Router path pattern → logical analytics screen name.
 *
 * This is the single source of truth for tracked screens. Dynamic segments
 * match exactly one non-empty path segment; raw parameter values are never
 * included in analytics events.
 */
export const SCREEN_ROUTE_MAP = {
  '/': 'home',
  '/gratitudeEntry': 'entry_new',
  '/gratitudeEntry/[noteId]': 'entry_view',
  '/share-entry/[noteId]': 'entry_share',
  '/dateEntries/[dateMs]': 'date_entries',
  '/appearance': 'appearance',
  '/insights': 'insights',
  '/settings': 'settings',
  '/support': 'support',
  '/cloud-backup': 'cloud_backup',
} as const;

export type ScreenName = (typeof SCREEN_ROUTE_MAP)[keyof typeof SCREEN_ROUTE_MAP];

type ScreenRoutePattern = keyof typeof SCREEN_ROUTE_MAP;

function matchesRoutePattern(pathname: string, pattern: ScreenRoutePattern): boolean {
  const pathSegments = pathname.split('/').filter(Boolean);
  const patternSegments = pattern.split('/').filter(Boolean);

  return (
    pathSegments.length === patternSegments.length &&
    patternSegments.every(
      (segment, index) =>
        (segment.startsWith('[') && segment.endsWith(']')) ||
        segment === pathSegments[index],
    )
  );
}

/** Resolves a pathname to its allowlisted logical name; unknown routes are ignored. */
export function getScreenName(pathname: string): ScreenName | null {
  const patterns = Object.keys(SCREEN_ROUTE_MAP) as ScreenRoutePattern[];
  const pattern = patterns.find((candidate) => matchesRoutePattern(pathname, candidate));
  return pattern ? SCREEN_ROUTE_MAP[pattern] : null;
}

export type ImportSource = 'tackbok' | 'gratitudeApp' | 'presently';
export type CloudSyncTrigger =
  | 'app-active'
  | 'connectivity-restored'
  | 'backgrounding'
  | 'periodic'
  | 'local-mutation'
  | 'manual';
export type CloudSyncFailureCategory =
  | 'auth'
  | 'quota'
  | 'rate-limit'
  | 'offline'
  | 'wifi-only-media'
  | 'corrupt'
  | 'transient'
  | 'unknown';
export type CloudSyncCountBucket = '0' | '1-10' | '11-100' | '100+';
export type CloudSyncDurationBucket = '<1s' | '1-10s' | '10-60s' | '60s+';
export type SupportPurchaseFailureCategory =
  | 'offline'
  | 'configuration'
  | 'store'
  | 'not_allowed'
  | 'unknown';

/**
 * Event name → payload type. `undefined` means the event carries no payload.
 */
export type AnalyticsEvents = {
  /** Fired once per cold start, only when analytics is already enabled. */
  app_opened: {
    entry_bucket: CountBucket;
    days_journaled_bucket: CountBucket;
    /** ISO country code from device settings (not IP geolocation), e.g. 'SE'. */
    device_region: string;
  };
  screen_viewed: { screen: ScreenName };
  entry_created: {
    has_photo: boolean;
    has_audio: boolean;
    has_mood: boolean;
    // Deliberately un-bucketed: entries carry a handful of tags at most
    // (usually 0-2), so the exact count is too coarse to fingerprint content,
    // and CountBucket would collapse nearly all values into '1-10'.
    tag_count: number;
    char_bucket: CharBucket;
  };
  entry_deleted: undefined;
  search_used: undefined;
  theme_changed: { theme: string };
  language_changed: { locale: string };
  import_completed: { source: ImportSource; entry_bucket: CountBucket };
  backup_exported: undefined;
  reminder_enabled: undefined;
  reminder_disabled: undefined;
  cloud_sync_connected: { provider: 'google-drive' | 'dropbox' };
  cloud_sync_started: { trigger: CloudSyncTrigger };
  cloud_sync_succeeded: {
    duration_bucket: CloudSyncDurationBucket;
    pulled_bucket: CloudSyncCountBucket;
    pushed_bucket: CloudSyncCountBucket;
  };
  cloud_sync_failed: { category: CloudSyncFailureCategory };
  cloud_sync_conflict_recovered: { entity_type: 'entry' | 'tag' | 'prompt' | 'profile' };
  cloud_sync_repair_result: { result: 'repaired' | 'unrecoverable' | 'not-needed' };
  support_purchase_started: { tier: SupportTierId };
  support_purchase_completed: { tier: SupportTierId };
  support_purchase_cancelled: { tier: SupportTierId };
  support_purchase_pending: { tier: SupportTierId };
  support_purchase_failed: {
    tier: SupportTierId;
    category: SupportPurchaseFailureCategory;
  };
  support_share_opened: undefined;
  support_rate_opened: undefined;
  // Onboarding funnel — defined now, fired only once the onboarding flow ships
  // (see z-onboarding-flow.md). Buffered pre-consent, sent only on opt-in.
  onboarding_step_viewed: { step: string };
  onboarding_completed: undefined;
  onboarding_skipped: { step: string };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

/**
 * Complete runtime catalog used by the in-app privacy disclosure. The Record
 * constraint makes TypeScript fail whenever AnalyticsEvents gains or loses an
 * event without this catalog being updated too.
 */
const ANALYTICS_EVENT_CATALOG = {
  app_opened: true,
  screen_viewed: true,
  entry_created: true,
  entry_deleted: true,
  search_used: true,
  theme_changed: true,
  language_changed: true,
  import_completed: true,
  backup_exported: true,
  reminder_enabled: true,
  reminder_disabled: true,
  cloud_sync_connected: true,
  cloud_sync_started: true,
  cloud_sync_succeeded: true,
  cloud_sync_failed: true,
  cloud_sync_conflict_recovered: true,
  cloud_sync_repair_result: true,
  support_purchase_started: true,
  support_purchase_completed: true,
  support_purchase_cancelled: true,
  support_purchase_pending: true,
  support_purchase_failed: true,
  support_share_opened: true,
  support_rate_opened: true,
  onboarding_step_viewed: true,
  onboarding_completed: true,
  onboarding_skipped: true,
} as const satisfies Record<AnalyticsEventName, true>;

export const ANALYTICS_EVENT_NAMES = Object.keys(
  ANALYTICS_EVENT_CATALOG,
) as AnalyticsEventName[];

export const ANALYTICS_SOURCE_URL =
  'https://github.com/mehradotdev/tackbok/blob/main/apps/mobile/src/lib/analytics/events.ts';

/** Privacy-audited cloud-sync subset used by focused tests and safeguards. */
export const CLOUD_SYNC_ANALYTICS_EVENT_NAMES = [
  'cloud_sync_connected',
  'cloud_sync_started',
  'cloud_sync_succeeded',
  'cloud_sync_failed',
  'cloud_sync_conflict_recovered',
  'cloud_sync_repair_result',
] as const satisfies readonly AnalyticsEventName[];

/** Privacy-audited support events. Prices, transaction ids, and customer ids are excluded. */
export const SUPPORT_ANALYTICS_EVENT_NAMES = [
  'support_purchase_started',
  'support_purchase_completed',
  'support_purchase_cancelled',
  'support_purchase_pending',
  'support_purchase_failed',
  'support_share_opened',
  'support_rate_opened',
] as const satisfies readonly AnalyticsEventName[];

export function toCharBucket(charCount: number): CharBucket {
  if (charCount <= 50) return '0-50';
  if (charCount <= 200) return '51-200';
  return '200+';
}

export function toCountBucket(count: number): CountBucket {
  if (count <= 0) return '0';
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  return '200+';
}

export function toCloudSyncCountBucket(count: number): CloudSyncCountBucket {
  if (count <= 0) return '0';
  if (count <= 10) return '1-10';
  if (count <= 100) return '11-100';
  return '100+';
}

export function toCloudSyncDurationBucket(durationMs: number): CloudSyncDurationBucket {
  if (durationMs < 1_000) return '<1s';
  if (durationMs < 10_000) return '1-10s';
  if (durationMs < 60_000) return '10-60s';
  return '60s+';
}
