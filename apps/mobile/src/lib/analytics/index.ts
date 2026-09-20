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
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import { useSettingsStore } from '~/lib/settings';
import { getEntryStats } from '~/db/queries';
import {
  ANALYTICS_EVENT_NAMES,
  getScreenName,
  type ScreenName,
  toCountBucket,
  type AnalyticsEventName,
  type AnalyticsEvents,
} from './events';
import {
  drainPreConsentBuffer,
  isPreConsentBuffering,
  pushPreConsentEvent,
  stopPreConsentBuffering,
  type BufferedAnalyticsEvent,
  type AnalyticsEventProps,
} from './preConsentBuffer';

export { startPreConsentBuffering, stopPreConsentBuffering } from './preConsentBuffer';
export { toCharBucket, toCountBucket } from './events';

// PostHog project API keys are public by design (they can only ingest events,
// never read data), so committing this is normal for a FOSS app.
const POSTHOG_API_KEY = 'phc_p7Pod5VpEVAq7hoYERvjUo5wqmRPRQPRkgxp3352qBYD';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

type ClientSession = {
  instance: PostHog;
  clearQueue: () => void;
};
let session: ClientSession | null = null;
let client: PostHog | null = null;
let initialized = false;
let generation = 0;
let currentScreen: ScreenName | null = null;
const MAX_INIT_PENDING_EVENTS = 20;
let initPendingEvents: BufferedAnalyticsEvent[] = [];
const allowedEvents = new Set<string>(ANALYTICS_EVENT_NAMES);

// Lifecycle work is ordered, but consent revocation detaches the client and
// clears its queue synchronously rather than waiting behind this chain.
let opChain: Promise<void> = Promise.resolve();
function enqueue(op: () => Promise<void>): Promise<void> {
  opChain = opChain.then(op).catch((error) => {
    console.warn('Analytics operation failed:', error);
  });
  return opChain;
}

function hasConsent(expectedGeneration = generation): boolean {
  return (
    expectedGeneration === generation && useSettingsStore.getState().analyticsEnabled
  );
}

function eventProperties(props?: AnalyticsEventProps): AnalyticsEventProps {
  const extra = Constants.expoConfig?.extra;
  const appVariant = extra?.appVariant === 'beta' ? 'beta' : 'production';
  const appStore =
    Platform.OS === 'ios'
      ? 'apple'
      : Platform.OS === 'android'
        ? extra?.androidStore === 'samsung'
          ? 'samsung'
          : 'google'
        : 'unknown';
  return {
    analytics_schema_version: 2,
    app_variant: appVariant,
    app_store: appStore,
    is_development:
      __DEV__ ||
      appVariant === 'beta' ||
      (appStore === 'samsung' && extra?.galaxyBillingMode === 'TEST'),
    ...(currentScreen ? { $screen_name: currentScreen } : {}),
    ...props,
  };
}

function capture(event: BufferedAnalyticsEvent): void {
  if (!hasConsent() || !client) return;
  // Capture the standard $screen event directly. Unlike SDK screen(), this
  // preserves occurrence-time context for queued events and adds no async gap
  // between the consent check and capture. All events get their own safe context.
  client.capture(event.event, event.props, { timestamp: event.timestamp });
}

async function enable(expectedGeneration: number): Promise<void> {
  if (!hasConsent(expectedGeneration) || client) return;
  // Keep SDK loading inside the consent gate; never import it at module scope.
  const { PostHog, PostHogPersistedProperty } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('posthog-react-native') as typeof import('posthog-react-native');
  const instance = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    defaultOptIn: false,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    personProfiles: 'identified_only',
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableRemoteConfig: true,
    disableSurveys: true,
    errorTracking: { autocapture: false, exceptionSteps: { enabled: false } },
    disableGeoip: true,
    // Also guards SDK work deferred until its own storage initialization ends.
    before_send: (event) =>
      hasConsent(expectedGeneration) && event && allowedEvents.has(event.event)
        ? event
        : null,
  });
  session = {
    instance,
    clearQueue: () => instance.setPersistedProperty(PostHogPersistedProperty.Queue, null),
  };
  await instance.ready();
  if (!hasConsent(expectedGeneration)) return;
  await instance.optIn();
  if (!hasConsent(expectedGeneration)) return;
  client = instance;
  const pending = initPendingEvents.splice(0);
  for (const event of pending) capture(event);
  // Consent can be enabled without a navigation change (e.g. in Settings).
  if (currentScreen && !pending.some((event) => event.event === '$screen')) {
    track('$screen', { $screen_name: currentScreen });
  }
}

function revokeConsent(): void {
  initPendingEvents = [];
  stopPreConsentBuffering();
  client = null;
  const previous = session;
  session = null;
  if (!previous) return;
  previous.clearQueue();
  void previous.instance.optOut().catch((error) => {
    console.warn('Analytics opt-out failed:', error);
  });
  void enqueue(async () => {
    await previous.instance.ready();
    await previous.instance.optOut();
    // Clear again after storage initialization to remove any persisted queue.
    previous.clearQueue();
    previous.instance.reset();
    await previous.instance.shutdown();
  });
}

async function captureAppOpened(
  reason: AnalyticsEvents['app_opened']['reason'],
  expectedGeneration: number,
): Promise<void> {
  if (!hasConsent(expectedGeneration)) return;
  const props = eventProperties({ reason });
  const timestamp = new Date();
  try {
    const stats = await getEntryStats();
    if (!hasConsent(expectedGeneration)) return;
    capture({
      event: 'app_opened',
      timestamp,
      props: {
        ...props,
        entry_bucket: toCountBucket(stats.entryCount),
        days_journaled_bucket: toCountBucket(stats.daysWithEntries),
        device_region: getLocales()[0]?.regionCode ?? 'unknown',
      },
    });
  } catch (error) {
    console.warn('Failed to capture app_opened:', error);
  }
}

function scheduleEnable(reason: 'cold_start' | 'consent_enabled'): void {
  const expectedGeneration = generation;
  void enqueue(async () => {
    await enable(expectedGeneration);
    // Stats loading must not hold up revocation or onboarding buffer commits.
    if (hasConsent(expectedGeneration)) {
      void captureAppOpened(reason, expectedGeneration);
    }
  });
}

/** Call once after settings hydration. Never initializes the SDK without consent. */
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;
  if (hasConsent()) scheduleEnable('cold_start');
  useSettingsStore.subscribe((state, prevState) => {
    if (state.analyticsEnabled === prevState.analyticsEnabled) return;
    generation += 1;
    if (state.analyticsEnabled) scheduleEnable('consent_enabled');
    else revokeConsent();
  });

  // Ignore transient inactive states (permission prompts, control center).
  // A real background -> active transition is a warm app visit.
  let wasBackgrounded = AppState.currentState === 'background';
  AppState.addEventListener('change', (state) => {
    if (state === 'background') wasBackgrounded = true;
    if (state !== 'active' || !wasBackgrounded) return;
    wasBackgrounded = false;
    if (!hasConsent()) return;
    if (currentScreen) track('$screen', { $screen_name: currentScreen });
    const expectedGeneration = generation;
    void enqueue(async () => {
      void captureAppOpened('foreground', expectedGeneration);
    });
  });
}

type TrackArgs<E extends AnalyticsEventName> = AnalyticsEvents[E] extends undefined
  ? [event: E]
  : [event: E, props: AnalyticsEvents[E]];

/** Consent-gated events with occurrence-time screen context and timestamps. */
export function track<E extends AnalyticsEventName>(
  ...[event, props]: TrackArgs<E>
): void {
  const properties = eventProperties(props as AnalyticsEventProps | undefined);
  if (!hasConsent()) {
    if (isPreConsentBuffering()) pushPreConsentEvent(event, properties);
    return;
  }
  const pending = { event, props: properties, timestamp: new Date() };
  if (!client) {
    if (initPendingEvents.length < MAX_INIT_PENDING_EVENTS)
      initPendingEvents.push(pending);
    return;
  }
  capture(pending);
}

/** Remember only allowlisted logical names, never raw paths or route parameters. */
export function trackScreenView(pathname: string): void {
  currentScreen = getScreenName(pathname);
  if (currentScreen) track('$screen', { $screen_name: currentScreen });
}

/** Take ownership of the buffer synchronously, before onboarding can unmount. */
export function commitPreConsentBuffer(): Promise<void> {
  const expectedGeneration = generation;
  const buffered = drainPreConsentBuffer();
  if (!hasConsent(expectedGeneration)) return Promise.resolve();
  if (client) {
    for (const event of buffered) capture(event);
    return Promise.resolve();
  }
  initPendingEvents.unshift(...buffered);
  return enqueue(async () => {
    await enable(expectedGeneration);
  });
}
