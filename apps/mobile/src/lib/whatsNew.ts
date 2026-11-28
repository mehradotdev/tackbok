import Constants from 'expo-constants';
import { compareVersions, parseVersion } from './appVersion';

/**
 * The release whose highlights the "What's new" sheet lists. Bump it (and the
 * sheet's items) for a later release that deserves one; everyone who last saw
 * an older version then sees it once.
 */
export const WHATS_NEW_VERSION = '2.0.0';

/** This bundle's app version, the one recorded as seen. */
export function currentAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/**
 * Whether someone should see the "What's new" sheet. 1.x stored no version, so
 * a finished onboarding with nothing recorded means an update from 1.x. A fresh
 * install records the version as onboarding finishes, so it never sees it.
 */
export function shouldShowWhatsNew({
  hasCompletedOnboarding,
  lastSeenAppVersion,
  appVersion,
  whatsNewVersion = WHATS_NEW_VERSION,
}: {
  hasCompletedOnboarding: boolean;
  lastSeenAppVersion: string | null;
  appVersion: string | null;
  whatsNewVersion?: string;
}): boolean {
  if (!hasCompletedOnboarding) return false;
  const current = parseVersion(appVersion);
  const highlights = parseVersion(whatsNewVersion);
  // The sheet describes a release this build doesn't have yet.
  if (!current || !highlights || compareVersions(current, highlights) < 0) return false;
  if (lastSeenAppVersion === null) return true;
  const lastSeen = parseVersion(lastSeenAppVersion);
  // An unreadable record is not a reason to interrupt.
  return lastSeen !== null && compareVersions(lastSeen, highlights) < 0;
}
