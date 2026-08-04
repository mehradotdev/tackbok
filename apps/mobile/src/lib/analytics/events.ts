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
  '/dateEntries/[dateMs]': 'date_entries',
  '/appearance': 'appearance',
  '/insights': 'insights',
  '/settings': 'settings',
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
  // Onboarding funnel — defined now, fired only once the onboarding flow ships
  // (see z-onboarding-flow.md). Buffered pre-consent, sent only on opt-in.
  onboarding_step_viewed: { step: string };
  onboarding_completed: undefined;
  onboarding_skipped: { step: string };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

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
