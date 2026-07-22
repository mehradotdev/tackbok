/**
 * The exhaustive, typed catalog of every analytics event this app can emit.
 *
 * This file is the single source of truth for what leaves the device:
 * autocapture and session replay are disabled, so if an event is not in this
 * map, it cannot be sent. Keep the Analytics section of the public privacy
 * policy (`apps/website/src/pages/privacy.astro`, tackbok.org/privacy) in
 * sync with this file — it links here as the exhaustive list.
 *
 * Rules for adding events:
 * - Bucketed values only — never raw text, lengths, dates, or ids that could
 *   fingerprint journal content or a person.
 * - No PII, ever (no names, emails, entry text, file names, precise location).
 */

export type CharBucket = '0-50' | '51-200' | '200+';

/** Order-of-magnitude bucket for entry counts / journaled-day counts. */
export type CountBucket = '0' | '1-10' | '11-50' | '51-200' | '200+';

/** Logical screens — derived from the route, never the raw pathname/params. */
export type ScreenName = 'home' | 'entry_new' | 'entry_view' | 'date_entries' | 'settings';

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
