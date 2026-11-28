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

/** Records this launch's version; see `lastSeenAppVersion` in the settings store. */
export function recordLastSeenAppVersion(): void {
  const version = currentAppVersion();
  const settings = useSettingsStore.getState();
  if (version && settings.lastSeenAppVersion !== version) {
    settings.setLastSeenAppVersion(version);
  }
}
