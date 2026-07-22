/**
 * In-memory (RAM-only) buffer for events emitted before a consent decision.
 *
 * Privacy contract:
 * - Never persisted to disk, never transmitted. If the app is killed before a
 *   consent decision, the data ceases to exist — there is no pre-consent
 *   footprint on the device between sessions.
 * - Buffering is active only while the onboarding flow is mounted.
 * - On consent accept, events are flushed to PostHog with their original
 *   timestamps (see `commitPreConsentBuffer` in `./index`). On decline — or
 *   any exit that is not an explicit accept — the buffer is cleared
 *   immediately.
 * - Buffered events carry no identifier; the anonymous id is created by the
 *   SDK only after consent, at flush time.
 */

import type { AnalyticsEventName } from './events';

/** All catalog payloads are flat primitive maps (JSON-safe by construction). */
export type AnalyticsEventProps = Record<string, string | number | boolean>;

export type BufferedAnalyticsEvent = {
  event: AnalyticsEventName;
  props?: AnalyticsEventProps;
  timestamp: Date;
};

// Leak guard, not a feature: onboarding produces far fewer events than this.
const MAX_BUFFERED_EVENTS = 50;

let buffer: BufferedAnalyticsEvent[] = [];
let buffering = false;

/** Call when the onboarding flow mounts. */
export function startPreConsentBuffering(): void {
  buffering = true;
}

/**
 * Call on decline or any non-accept exit from onboarding.
 * Clears immediately — decline must not be lazy.
 */
export function stopPreConsentBuffering(): void {
  buffering = false;
  buffer = [];
}

export function isPreConsentBuffering(): boolean {
  return buffering;
}

export function pushPreConsentEvent(
  event: AnalyticsEventName,
  props?: AnalyticsEventProps,
): void {
  if (!buffering) return;
  if (buffer.length >= MAX_BUFFERED_EVENTS) {
    buffer.shift(); // drop-oldest
  }
  buffer.push({ event, props, timestamp: new Date() });
}

/** Returns all buffered events, clearing the buffer and ending buffering. */
export function drainPreConsentBuffer(): BufferedAnalyticsEvent[] {
  const drained = buffer;
  buffer = [];
  buffering = false;
  return drained;
}
