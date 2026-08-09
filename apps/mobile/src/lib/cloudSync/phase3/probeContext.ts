import type { DriveFetchLike, DriveResponseLike } from '../providers/googleDrive';

/**
 * Endpoints that revoke a grant for the whole Google account. Per-device
 * Disconnect must be a local sign-out and must never reach these.
 */
const GLOBAL_REVOCATION_PATTERNS = [
  /^https:\/\/accounts\.google\.com\/o\/oauth2\/revoke/,
  /^https:\/\/oauth2\.googleapis\.com\/revoke/,
];

export function isGlobalRevocationEndpoint(url: string): boolean {
  return GLOBAL_REVOCATION_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Reduces a URL to origin + path. Query strings carry upload IDs and page
 * tokens, so they are dropped before anything is recorded as evidence.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '<unparseable url>';
  }
}

export interface DriveRequestStats {
  requests: number;
  statusCounts: Record<string, number>;
  /** Distinct origin+path endpoints contacted, in first-contact order. */
  endpoints: string[];
  globalRevocationRequests: number;
  networkFailures: number;
}

export interface InstrumentedDriveFetch {
  fetch: DriveFetchLike;
  stats: DriveRequestStats;
  reset(): void;
  snapshot(): DriveRequestStats;
}

/**
 * Wraps the adapter's fetcher so a probe can report request counts, status
 * codes, and pagination behavior without the adapter knowing it is observed.
 */
export function createInstrumentedDriveFetch(
  inner?: DriveFetchLike,
): InstrumentedDriveFetch {
  const stats: DriveRequestStats = {
    requests: 0,
    statusCounts: {},
    endpoints: [],
    globalRevocationRequests: 0,
    networkFailures: 0,
  };

  const fetcher: DriveFetchLike = async (url, init) => {
    stats.requests += 1;
    if (isGlobalRevocationEndpoint(url)) stats.globalRevocationRequests += 1;
    const endpoint = redactUrl(url);
    if (!stats.endpoints.includes(endpoint)) stats.endpoints.push(endpoint);

    const call =
      inner ??
      (async (target: string, options?: Record<string, unknown>) => {
        const { fetch } = await import('expo/fetch');
        return fetch(target, options as never) as unknown as DriveResponseLike;
      });

    try {
      const response = await call(url, init);
      const key = String(response.status);
      stats.statusCounts[key] = (stats.statusCounts[key] ?? 0) + 1;
      return response;
    } catch (error) {
      stats.networkFailures += 1;
      throw error;
    }
  };

  return {
    fetch: fetcher,
    stats,
    reset() {
      stats.requests = 0;
      stats.statusCounts = {};
      stats.endpoints.length = 0;
      stats.globalRevocationRequests = 0;
      stats.networkFailures = 0;
    },
    snapshot() {
      return {
        requests: stats.requests,
        statusCounts: { ...stats.statusCounts },
        endpoints: [...stats.endpoints],
        globalRevocationRequests: stats.globalRevocationRequests,
        networkFailures: stats.networkFailures,
      };
    },
  };
}

export interface ObservedFetchCalls {
  urls: string[];
  globalRevocationRequests: number;
}

/**
 * Observes every `globalThis.fetch` call made while `body` runs. Disconnect
 * does not go through the Drive adapter's fetcher, so this is how the probe
 * shows that local sign-out issued no global revocation request from
 * JavaScript. Native module calls are out of reach and stay an operator check.
 */
export async function observeGlobalFetch<T>(
  body: () => Promise<T>,
): Promise<{ result: T; observed: ObservedFetchCalls }> {
  const observed: ObservedFetchCalls = { urls: [], globalRevocationRequests: 0 };
  const original = globalThis.fetch;

  globalThis.fetch = ((input: unknown, init?: unknown) => {
    const url =
      typeof input === 'string'
        ? input
        : input && typeof input === 'object' && 'url' in input
          ? String((input as { url: unknown }).url)
          : '';
    if (url) {
      if (isGlobalRevocationEndpoint(url)) observed.globalRevocationRequests += 1;
      const endpoint = redactUrl(url);
      if (!observed.urls.includes(endpoint)) observed.urls.push(endpoint);
    }
    return original(input as never, init as never);
  }) as typeof globalThis.fetch;

  try {
    return { result: await body(), observed };
  } finally {
    globalThis.fetch = original;
  }
}
