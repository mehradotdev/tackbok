/**
 * Consent-gated analytics wrapper — the ONLY file allowed to import
 * `posthog-react-native`.
 *
 * Privacy contract (public version: tackbok.org/privacy or `apps/website/src/pages/privacy.astro` — keep in sync):
 * - The SDK is lazily constructed only after `analyticsEnabled === true`.
 *   Before consent it does not exist in memory, phones nothing home, and
 *   persists nothing to disk. Never initialize-then-mute.
 * - `track()` is always safe to call: it no-ops while disabled (or routes to
 *   the RAM-only pre-consent buffer during onboarding).
 * - Disable wipes everything: opt-out, drop any queued events, reset the
 *   anonymous id, shut the SDK down.
 * - Anonymous person mode only — `identify()` is never called, no PII is ever
 *   attached to an event.
 */

import type { PostHog } from 'posthog-react-native';
import { getLocales } from 'expo-localization';
import { useSettingsStore } from '~/lib/settings';
import { getEntryStats } from '~/db/queries';
import {
  getScreenName,
  toCountBucket,
  type AnalyticsEventName,
  type AnalyticsEvents,
} from './events';
import {
  drainPreConsentBuffer,
  isPreConsentBuffering,
  pushPreConsentEvent,
  type AnalyticsEventProps,
} from './preConsentBuffer';

export { startPreConsentBuffering, stopPreConsentBuffering } from './preConsentBuffer';
export { toCharBucket, toCountBucket } from './events';

// PostHog project API keys are public by design (they can only ingest events,
// never read data), so committing this is normal for a FOSS app.
const POSTHOG_API_KEY = 'phc_7mxfX8NwwP9KA8MUqN5QLhnpYtVeBYdK5WJ3qwvLHyl';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

let client: PostHog | null = null;
let initialized = false;

// Events tracked after consent but while the async SDK construction is still
// in flight (e.g. the first screen_viewed on an analytics-enabled cold start).
// RAM-only: flushed once `enable()` finishes, dropped by `disable()`. Capped
// as a leak guard in case initialization never completes.
const MAX_INIT_PENDING_EVENTS = 20;
let initPendingEvents: {
  event: AnalyticsEventName;
  props?: AnalyticsEventProps;
}[] = [];

// Enable/disable/flush are async and can be toggled rapidly from Settings;
// serializing them through one chain prevents interleaved init/shutdown.
let opChain: Promise<void> = Promise.resolve();
function enqueue(op: () => Promise<void>): Promise<void> {
  opChain = opChain.then(op).catch((error) => {
    console.warn('Analytics operation failed:', error);
  });
  return opChain;
}

async function enable(): Promise<void> {
  if (client) return;
  // Dynamic import so the SDK is not even loaded into memory pre-consent.
  const { PostHog } = await import('posthog-react-native');
  const instance = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    // Manual events only — the catalog in ./events.ts must stay exhaustive
    // and truthful, so everything automatic is off.
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    // Anonymous person mode: we never call identify(), so no person profiles
    // are ever created.
    personProfiles: 'identified_only',
    // No feature flags / surveys / error tracking — avoids their network
    // calls entirely.
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableSurveys: true,
    // Do not resolve IP to city-level geolocation on ingestion.
    disableGeoip: true,
  });
  await instance.optIn();
  client = instance;
  for (const pending of initPendingEvents.splice(0)) {
    instance.capture(pending.event, pending.props);
  }
}

async function disable(): Promise<void> {
  if (!client) return;
  const instance = client;
  client = null; // track() becomes a no-op immediately
  initPendingEvents = [];
  const { PostHogPersistedProperty } = await import('posthog-react-native');
  await instance.optOut();
  // Drop any queued-but-unsent events so shutdown's final flush sends nothing.
  instance.setPersistedProperty(PostHogPersistedProperty.Queue, null);
  instance.reset(); // wipes the anonymous id + super properties
  await instance.shutdown();
}

async function captureAppOpened(): Promise<void> {
  try {
    const stats = await getEntryStats();
    client?.capture('app_opened', {
      entry_bucket: toCountBucket(stats.entryCount),
      days_journaled_bucket: toCountBucket(stats.daysWithEntries),
      // Country from device settings — coarse, user-controlled, and avoids
      // IP geolocation (disableGeoip stays on).
      device_region: getLocales()[0]?.regionCode ?? 'unknown',
    });
  } catch (error) {
    console.warn('Failed to capture app_opened:', error);
  }
}

/**
 * Bootstraps analytics from persisted settings and reacts to the Settings
 * toggle at runtime. Call once on app launch, after settings hydration.
 */
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;

  if (useSettingsStore.getState().analyticsEnabled) {
    enqueue(enable);
    enqueue(captureAppOpened);
  }

  useSettingsStore.subscribe((state, prevState) => {
    if (state.analyticsEnabled === prevState.analyticsEnabled) return;
    if (state.analyticsEnabled) {
      enqueue(enable);
    } else {
      enqueue(disable);
    }
  });
}

type TrackArgs<E extends AnalyticsEventName> = AnalyticsEvents[E] extends undefined
  ? [event: E]
  : [event: E, props: AnalyticsEvents[E]];

/**
 * Records an event from the typed catalog. Always safe to call: no-ops when
 * analytics is disabled, routes to the RAM-only buffer while the onboarding
 * consent flow is active, and queues events while consent is granted but the
 * SDK is still initializing (so nothing is dropped on an enabled cold start).
 */
export function track<E extends AnalyticsEventName>(
  ...[event, props]: TrackArgs<E>
): void {
  if (!client) {
    if (isPreConsentBuffering()) {
      pushPreConsentEvent(event, props as AnalyticsEventProps | undefined);
    } else if (
      useSettingsStore.getState().analyticsEnabled &&
      initPendingEvents.length < MAX_INIT_PENDING_EVENTS
    ) {
      initPendingEvents.push({
        event,
        props: props as AnalyticsEventProps | undefined,
      });
    }
    return;
  }
  client.capture(event, props as AnalyticsEventProps | undefined);
}

/** Route pathname → screen_viewed event; unknown routes are never sent. */
export function trackScreenView(pathname: string): void {
  const screen = getScreenName(pathname);
  if (screen) track('screen_viewed', { screen });
}

/**
 * Called by onboarding when the user explicitly accepts analytics (after
 * `setAnalyticsEnabled(true)`): flushes the pre-consent buffer with original
 * timestamps. The anonymous id is created here, at flush time — buffered
 * events never had one.
 */
export function commitPreConsentBuffer(): Promise<void> {
  return enqueue(async () => {
    await enable();
    for (const buffered of drainPreConsentBuffer()) {
      client?.capture(buffered.event, buffered.props, {
        timestamp: buffered.timestamp,
      });
    }
  });
}
