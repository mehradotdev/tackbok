import { create } from 'zustand';

/**
 * Launch animation that continues the native splash (see `SplashAnimation`).
 *
 * - `story`: every cold start. The book closes, opens on the heart, the heart
 *   beats, then it grows into the theme background.
 * - `fade`: Reduce Motion; a plain cross-fade into the app.
 * - `none`: get out of the way (app lock, or opened from a link or reminder).
 */
export type SplashMode = 'story' | 'fade' | 'none';

export interface SplashModeInput {
  appLockEnabled: boolean;
  openedFromLink: boolean;
  reduceMotion: boolean;
}

export function getSplashMode({
  appLockEnabled,
  openedFromLink,
  reduceMotion,
}: SplashModeInput): SplashMode {
  if (appLockEnabled || openedFromLink) return 'none';
  return reduceMotion ? 'fade' : 'story';
}

/**
 * Whether the launch came from a deep link or a reminder tap (whose data
 * carries an in-app path, as `useReminderTapObserver` reads it). The dev
 * client launches through its own URL; that is not a deep link.
 */
export function isLaunchFromLink(
  initialUrl: string | null,
  notificationData: Record<string, unknown> | null | undefined,
): boolean {
  if (initialUrl && !initialUrl.includes('expo-development-client')) return true;
  const url = notificationData?.url;
  return typeof url === 'string' && url.startsWith('/');
}

/** Times in ms from the hand-off; ranges are `[start, end]`. */
export interface SplashTimeline {
  duration: number;
  /** Book closes over the first range, then opens over the second. */
  fold?: { close: [number, number]; open: [number, number] };
  /** One heartbeat once the book is open again. */
  beat?: [number, number];
  /** Heart grows to fill the screen while the background turns into the theme's. */
  zoom?: [number, number];
  /** The whole overlay fades to reveal the app. */
  fadeOut: [number, number];
}

export const SPLASH_TIMELINES: Record<Exclude<SplashMode, 'none'>, SplashTimeline> = {
  // Moves from the first frame: a still logo here would read as a pause after
  // the native splash, which already showed it.
  story: {
    duration: 1900,
    fold: { close: [0, 470], open: [590, 1080] },
    beat: [1080, 1300],
    zoom: [1300, 1820],
    fadeOut: [1720, 1900],
  },
  fade: {
    duration: 250,
    fadeOut: [0, 250],
  },
};

/**
 * Size (pt/dp) of the logo's 250-unit viewBox in the native splash:
 * `splash-icon-light.png` draws the viewBox at 535/1024 of its width and the
 * splash plugin shows that image at `imageWidth` 200, centred on screen.
 */
export const NATIVE_SPLASH_LOGO_SIZE = (200 * 535) / 1024;

/** Native splash colours (`app.config.ts`, expo-splash-screen plugin). */
export const NATIVE_SPLASH_BACKGROUND = '#000000';
export const NATIVE_SPLASH_LOGO_COLOR = '#E9DFC5';

/**
 * True until the launch animation finishes or is skipped. Native modals draw
 * above the overlay, so screens hold their loading modal back while it runs.
 */
export const useSplashActive = create<{ active: boolean; revealed: boolean }>(() => ({
  active: true,
  revealed: false,
}));

/** The launch frame is still black: status bar icons should be light. */
export function useSplashIsDark() {
  return useSplashActive((s) => s.active && !s.revealed);
}

/** The animation has reached the theme background. */
export function revealSplash() {
  useSplashActive.setState({ revealed: true });
}

export function endSplash() {
  useSplashActive.setState({ active: false });
}
