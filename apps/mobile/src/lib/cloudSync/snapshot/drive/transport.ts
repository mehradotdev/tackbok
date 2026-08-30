import { CloudAuthError, type CloudAuthorization } from '../../auth/types';
import { providerErrorCodeForAuthError } from '../../failureClassification';
import type { SnapshotProviderErrorCode } from '../sync/types';
import { SnapshotProviderError } from '../sync/types';
import {
  driveByteBucket,
  driveDurationBucket,
  driveQuotaUnits,
  type DriveInstrumentationSink,
  type DriveMethodClass,
  type DriveResultClass,
} from './instrumentation';
import type { DriveProviderStateStore } from './state';

const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

export interface DriveResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body?: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  } | null;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type DriveFetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<DriveResponseLike>;

const defaultDriveFetch: DriveFetchLike = async (url, init) => {
  const { fetch } = await import('expo/fetch');
  return fetch(url, init as never) as unknown as DriveResponseLike;
};

export class DriveRequestError extends SnapshotProviderError {
  constructor(
    code: SnapshotProviderErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(code, message);
    this.name = 'DriveRequestError';
  }
}

function requestBodyBytes(body: unknown): number {
  if (body instanceof Uint8Array) return body.byteLength;
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength;
  return 0;
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

async function errorReason(response: DriveResponseLike): Promise<string | null> {
  try {
    const body = await response.json() as {
      error?: { errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] };
    };
    const reasons = [
      ...(body.error?.errors ?? []),
      ...(body.error?.details ?? []),
    ].map((value) => value.reason).filter((value): value is string =>
      typeof value === 'string');
    return reasons[0] ?? null;
  } catch {
    return null;
  }
}

function resultClass(error: DriveRequestError): DriveResultClass {
  if (error.code === 'authorization-required') return 'authorization';
  if (error.code === 'permission-denied') return 'permission';
  if (error.code === 'quota-full') return 'quota';
  if (error.code === 'rate-limited') return 'rate-limit';
  if (error.code === 'invalid-data') return 'invalid';
  if (error.status === 404 || error.status === 410) return 'not-found';
  return 'transient';
}

function mapStatus(
  status: number,
  reason: string | null,
  retryAfterMs: number | null,
): DriveRequestError {
  if (status === 401) {
    return new DriveRequestError('authorization-required', status, 'Drive authorization failed');
  }
  if (status === 403 && reason === 'storageQuotaExceeded') {
    return new DriveRequestError('quota-full', status, 'Drive storage quota is full');
  }
  if (status === 403 && [
    'userRateLimitExceeded', 'rateLimitExceeded', 'sharingRateLimitExceeded',
    'dailyLimitExceeded',
  ].includes(reason ?? '')) {
    return new DriveRequestError('rate-limited', status, 'Drive rate limit reached', retryAfterMs);
  }
  if (status === 403) {
    return new DriveRequestError('permission-denied', status, 'Drive permission denied');
  }
  if (status === 429) {
    return new DriveRequestError('rate-limited', status, 'Drive rate limit reached', retryAfterMs);
  }
  if (status === 400) {
    return new DriveRequestError('invalid-data', status, 'Drive rejected an invalid request');
  }
  if (status === 404 || status === 410) {
    return new DriveRequestError('transient', status, 'Drive object or cursor was not found');
  }
  if (status === 507) {
    return new DriveRequestError('quota-full', status, 'Drive storage quota is full');
  }
  return new DriveRequestError('transient', status, 'Drive request failed', retryAfterMs);
}

export interface DriveTransportOptions {
  auth: CloudAuthorization;
  state: DriveProviderStateStore;
  fetch?: DriveFetchLike;
  instrumentation?: DriveInstrumentationSink;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
  now: () => number;
}

export class DriveTransport {
  private readonly fetcher: DriveFetchLike;

  constructor(private readonly options: DriveTransportOptions) {
    this.fetcher = options.fetch ?? defaultDriveFetch;
  }

  async request(
    vaultId: string,
    methodClass: DriveMethodClass,
    url: string,
    init: Record<string, unknown> = {},
    options: { idempotent: boolean; accepted?: readonly number[] },
  ): Promise<DriveResponseLike> {
    const accepted = options.accepted ?? [];
    const retryNotBefore = this.options.state.loadDiscovery(vaultId).retryNotBefore;
    if (retryNotBefore > this.options.now()) {
      throw new DriveRequestError(
        'rate-limited', 429, 'Drive retry window is still active',
        retryNotBefore - this.options.now(),
      );
    }
    let authRetried = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let token: string;
      try {
        token = await this.options.auth.getFreshAccessToken();
      } catch (error) {
        if (error instanceof CloudAuthError) {
          const code = providerErrorCodeForAuthError(error.code);
          throw new SnapshotProviderError(
            code,
            code === 'transient'
              ? 'Google authorization is temporarily unavailable'
              : 'Google Drive authorization required',
          );
        }
        throw error;
      }
      const started = this.options.now();
      let response: DriveResponseLike;
      try {
        response = await this.fetcher(url, {
          ...init,
          headers: {
            ...((init.headers as Record<string, string> | undefined) ?? {}),
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        const error = new DriveRequestError('transient', 0, 'Unable to reach Google Drive');
        this.recordAttempt(methodClass, error, started, init.body, null, attempt > 0);
        if (options.idempotent && attempt < 2) {
          await this.options.sleep(this.retryDelay(attempt));
          continue;
        }
        throw error;
      }
      if (response.ok || accepted.includes(response.status)) {
        this.recordAttempt(methodClass, null, started, init.body, response, attempt > 0);
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get('retry-after'),
        this.options.now(),
      );
      const error = mapStatus(response.status, await errorReason(response), retryAfterMs);
      this.recordAttempt(methodClass, error, started, init.body, response, attempt > 0);
      if (response.status === 401 && !authRetried) {
        authRetried = true;
        await this.options.auth.clearInvalidAccessToken();
        continue;
      }
      if (error.code === 'rate-limited' && retryAfterMs !== null) {
        this.options.state.setRetryNotBefore(vaultId, this.options.now() + retryAfterMs);
      }
      if (options.idempotent && attempt < 2 &&
          (error.code === 'rate-limited' || error.code === 'transient') &&
          ![404, 410].includes(error.status)) {
        await this.options.sleep(Math.min(
          retryAfterMs ?? this.retryDelay(attempt),
          MAX_RETRY_DELAY_MS,
        ));
        continue;
      }
      throw error;
    }
    throw new SnapshotProviderError('transient', 'Drive retry limit reached');
  }

  private retryDelay(attempt: number): number {
    return Math.min(
      BASE_RETRY_DELAY_MS * (2 ** attempt) + Math.floor(this.options.random() * 1_000),
      MAX_RETRY_DELAY_MS,
    );
  }

  private recordAttempt(
    methodClass: DriveMethodClass,
    error: DriveRequestError | null,
    startedAt: number,
    requestBody: unknown,
    response: DriveResponseLike | null,
    retry: boolean,
  ): void {
    if (!this.options.instrumentation) return;
    const responseLength = response?.headers.get('content-length');
    const parsedResponseLength = responseLength === null || responseLength === undefined
      ? null
      : Number(responseLength);
    this.options.instrumentation.record({
      methodClass,
      resultClass: error ? resultClass(error) : 'success',
      durationBucket: driveDurationBucket(Math.max(0, this.options.now() - startedAt)),
      requestBytesBucket: driveByteBucket(requestBodyBytes(requestBody)),
      responseBytesBucket: parsedResponseLength !== null &&
        Number.isSafeInteger(parsedResponseLength) && parsedResponseLength >= 0
        ? driveByteBucket(parsedResponseLength)
        : 'unknown',
      retry,
      quotaUnits: driveQuotaUnits(methodClass),
    });
  }
}
