import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { kvStorage } from '~/lib/kvStorage';
import { compareVersions, parseVersion } from '~/lib/appVersion';

/**
 * The live store versions, kept by hand in `apps/website/public/app-version.json`
 * (see CONTRIBUTING.md). A plain GET of a static file: nothing identifies the
 * device or the person.
 */
export const APP_VERSION_URL = 'https://tackbok.org/app-version.json';

export type StoreKey = 'ios' | 'android' | 'galaxy';

export interface StoreRelease {
  latest: string;
  minimumSupported: string;
  storeUrl: string;
}

/** The only places an update button may open: Tackbok's own listing in each store. */
const STORE_LISTINGS: Record<
  StoreKey,
  { host: string; isTackbok: (url: URL) => boolean }
> = {
  ios: {
    host: 'apps.apple.com',
    isTackbok: (url) => url.pathname.endsWith('/id6757330507'),
  },
  android: {
    host: 'play.google.com',
    isTackbok: (url) => url.searchParams.get('id') === 'dev.mehra.tackbok',
  },
  galaxy: {
    host: 'galaxystore.samsung.com',
    isTackbok: (url) => url.pathname === '/detail/dev.mehra.tackbok',
  },
};

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_KEY = 'store-update.check';
const DISMISSED_KEY = 'store-update.not-now';

/** Which store this build came from: Galaxy builds have their own entry. */
export function storeForBuild(
  os: string = Platform.OS,
  androidStore: unknown = Constants.expoConfig?.extra?.androidStore,
): StoreKey | null {
  if (os === 'ios') return 'ios';
  if (os === 'android') return androidStore === 'samsung' ? 'galaxy' : 'android';
  return null;
}

/**
 * Reads one store's entry from the version file. Anything unexpected (another
 * schema, a loose version, a link to anything but Tackbok in that store) is null:
 * no prompt.
 */
export function readStoreRelease(file: unknown, store: StoreKey): StoreRelease | null {
  if (typeof file !== 'object' || file === null) return null;
  const { schema } = file as { schema?: unknown };
  if (schema !== 1) return null;
  const entry = (file as Record<string, unknown>)[store];
  if (typeof entry !== 'object' || entry === null) return null;
  const { latest, minimumSupported, storeUrl } = entry as Record<string, unknown>;
  if (typeof latest !== 'string' || !parseVersion(latest)) return null;
  if (typeof minimumSupported !== 'string' || !parseVersion(minimumSupported))
    return null;
  // A minimum above the latest could never be met: every update would ask again.
  if (compareVersions(parseVersion(minimumSupported)!, parseVersion(latest)!) > 0)
    return null;
  if (typeof storeUrl !== 'string') return null;
  try {
    const url = new URL(storeUrl);
    const listing = STORE_LISTINGS[store];
    if (url.protocol !== 'https:' || url.hostname !== listing.host) return null;
    if (!listing.isTackbok(url)) return null;
  } catch {
    return null;
  }
  return { latest, minimumSupported, storeUrl };
}

export interface StoreUpdatePrompt {
  latest: string;
  storeUrl: string;
  /** Below `minimumSupported`: "Not now" doesn't keep it away. */
  required: boolean;
}

/** Whether to offer the store update, given the installed native version. */
export function storeUpdatePromptFor(
  installed: string | null,
  release: StoreRelease | null,
  notNowVersion: string | null,
): StoreUpdatePrompt | null {
  const current = parseVersion(installed);
  const latest = parseVersion(release?.latest);
  const minimum = parseVersion(release?.minimumSupported);
  if (!current || !release || !latest || !minimum) return null;
  if (compareVersions(current, latest) >= 0) return null;
  const required = compareVersions(current, minimum) < 0;
  if (!required && notNowVersion === release.latest) return null;
  return { latest: release.latest, storeUrl: release.storeUrl, required };
}

/** Anything but a 200 with JSON that parses is null. */
async function fetchVersionFile(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status !== 200) return null;
    return JSON.parse(await response.text()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface CachedCheck {
  checkedAt: number;
  release: StoreRelease | null;
}

async function readCache(store: StoreKey): Promise<CachedCheck | null> {
  try {
    const raw = await kvStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { checkedAt?: unknown; file?: unknown };
    if (typeof cached.checkedAt !== 'number') return null;
    return { checkedAt: cached.checkedAt, release: readStoreRelease(cached.file, store) };
  } catch {
    return null;
  }
}

/**
 * This store's release, from a check at most once a day. A failed check counts
 * as a check, so a broken network or file is not retried on every launch.
 */
export async function getStoreRelease(
  store: StoreKey,
  { now = Date.now(), url = APP_VERSION_URL, useCache = true } = {},
): Promise<StoreRelease | null> {
  if (useCache) {
    const cached = await readCache(store);
    // A clock set back also asks again.
    if (cached && now >= cached.checkedAt && now - cached.checkedAt < CHECK_INTERVAL_MS) {
      return cached.release;
    }
  }
  const file = await fetchVersionFile(url);
  // Uncached checks (a dev test file) must not stand in for the real one later.
  if (useCache) {
    try {
      await kvStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: now, file }));
    } catch {
      // Unsaved, the next launch simply checks again.
    }
  }
  return readStoreRelease(file, store);
}

export async function getNotNowVersion(): Promise<string | null> {
  try {
    return await kvStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** "Not now" keeps this version's prompt away; a newer one asks again. */
export async function setNotNowVersion(version: string): Promise<void> {
  try {
    await kvStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // Worst case it asks again tomorrow.
  }
}

const IS_BETA_BUILD = Constants.expoConfig?.extra?.appVariant === 'beta';

/**
 * Dev builds only: `EXPO_PUBLIC_APP_VERSION_URL` points the check at a test file
 * and skips the beta rule and the daily cache, to try the prompt with a fake
 * higher version.
 */
const DEV_VERSION_URL = __DEV__ ? process.env.EXPO_PUBLIC_APP_VERSION_URL : undefined;

/** The prompt due now, if any. Never on beta builds. */
export async function checkForStoreUpdate(): Promise<StoreUpdatePrompt | null> {
  if (IS_BETA_BUILD && !DEV_VERSION_URL) return null;
  const store = storeForBuild();
  if (!store) return null;
  const release = await getStoreRelease(
    store,
    DEV_VERSION_URL ? { url: DEV_VERSION_URL, useCache: false } : {},
  );
  return storeUpdatePromptFor(
    Application.nativeApplicationVersion,
    release,
    await getNotNowVersion(),
  );
}
