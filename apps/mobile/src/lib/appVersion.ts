import Constants from 'expo-constants';
import { useSettingsStore } from '~/lib/settings';

/** A strict `MAJOR.MINOR.PATCH` version as three numbers, or null. */
export function parseVersion(version: string | null | undefined): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  return match ? match.slice(1).map(Number) : null;
}

/** Numeric comparison of two parsed versions: negative, zero or positive. */
export function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** This bundle's app version, as in `package.json`. */
export function currentAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

let updatedThisLaunch: boolean | undefined;

/**
 * Whether this is the first launch after an update: onboarding was already done
 * and an older version was recorded, or none at all (1.x never stored one). A
 * fresh install hasn't finished onboarding, so it never counts. Decided from the
 * saved settings before this launch records its version, then fixed until the
 * next launch. Call only once the settings have loaded.
 */
export function appUpdatedThisLaunch(): boolean {
  if (updatedThisLaunch === undefined) {
    const { hasCompletedOnboarding, lastSeenAppVersion } = useSettingsStore.getState();
    const current = parseVersion(currentAppVersion());
    const lastSeen = parseVersion(lastSeenAppVersion);
    updatedThisLaunch =
      hasCompletedOnboarding &&
      current !== null &&
      (lastSeenAppVersion === null ||
        // An unreadable record is not a reason to interrupt.
        (lastSeen !== null && compareVersions(lastSeen, current) < 0));
  }
  return updatedThisLaunch;
}

/** For tests, which stand in for separate launches. */
export function resetAppUpdatedThisLaunch() {
  updatedThisLaunch = undefined;
}

/** Records this launch's version; see `lastSeenAppVersion` in the settings store. */
export function recordLastSeenAppVersion(): void {
  // Decide before the write below hides an update.
  appUpdatedThisLaunch();
  const version = currentAppVersion();
  const settings = useSettingsStore.getState();
  if (version && settings.lastSeenAppVersion !== version) {
    settings.setLastSeenAppVersion(version);
  }
}
