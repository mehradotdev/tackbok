import { CloudAuthError, type CloudAuthorization } from '../../auth/types';
import { providerErrorCodeForAuthError } from '../../failureClassification';
import { SyncCancelledError, throwIfCancelled, untilCancelled } from '../sync/errors';
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
/** Bounds waiting for response headers and each later body read (inactivity). */
const REQUEST_TIMEOUT_MS = 60_000;
/** Uploads below this sustained rate (64 KB/s) are treated as stalled. */
const MIN_UPLOAD_BYTES_PER_MS = 64;

export interface DriveResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body?: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel?(): Promise<void>;
    };
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

/**
 * One request's cancellation: the pass signal plus a deadline for each phase
 * (headers, then every body read). Either aborts the fetch, so expo/fetch
 * cancels the native request and errors its body stream.
 */
class RequestGuard {
  private readonly controller = new AbortController();
  private timedOut = false;

  constructor(private readonly passSignal: AbortSignal | null) {
    passSignal?.addEventListener('abort', () => this.controller.abort());
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Runs one phase. Rejects promptly on abort even if `work` never settles. */
  phase<T>(work: () => Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (this.controller.signal.aborted) return Promise.reject(this.abortError());
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(this.abortError());
      const timer = setTimeout(() => {
        this.timedOut = true;
        this.controller.abort();
      }, timeoutMs);
      const settle = () => {
        clearTimeout(timer);
        this.controller.signal.removeEventListener('abort', onAbort);
      };
      this.controller.signal.addEventListener('abort', onAbort);
      work().then(
        (value) => {
          settle();
          resolve(value);
        },
        (error: unknown) => {
          settle();
          reject(this.controller.signal.aborted ? this.abortError() : error);
        },
      );
    });
  }

  private abortError(): Error {
    if (this.passSignal?.aborted || !this.timedOut) return new SyncCancelledError();
    return new DriveRequestError('transient', 0, 'Google Drive request timed out');
  }

  /** Bounds every later body read by the same guard. */
  wrap(response: DriveResponseLike): DriveResponseLike {
    const body = response.body;
    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      body: body
        ? {
            getReader: () => {
              const reader = body.getReader();
              return {
                read: () => this.phase(() => reader.read()),
                cancel: async () => {
                  this.controller.abort();
                  await reader.cancel?.().catch(() => undefined);
                },
              };
            },
          }
        : body,
      json: () => this.phase(() => response.json()),
      arrayBuffer: () => this.phase(() => response.arrayBuffer()),
    };
  }
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
    const body = (await response.json()) as {
      error?: { errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] };
    };
    const reasons = [...(body.error?.errors ?? []), ...(body.error?.details ?? [])]
      .map((value) => value.reason)
      .filter((value): value is string => typeof value === 'string');
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
  if (error.code === 'invalid-data' || error.code === 'invalid-request') return 'invalid';
  if (error.status === 404 || error.status === 410) return 'not-found';
  return 'transient';
}

function mapStatus(
  status: number,
  reason: string | null,
  retryAfterMs: number | null,
): DriveRequestError {
  if (status === 401) {
    return new DriveRequestError(
      'authorization-required',
      status,
      'Drive authorization failed',
    );
  }
  if (status === 403 && reason === 'storageQuotaExceeded') {
    return new DriveRequestError('quota-full', status, 'Drive storage quota is full');
  }
  if (
    status === 403 &&
    [
      'userRateLimitExceeded',
      'rateLimitExceeded',
      'sharingRateLimitExceeded',
      'dailyLimitExceeded',
    ].includes(reason ?? '')
  ) {
    return new DriveRequestError(
      'rate-limited',
      status,
      'Drive rate limit reached',
      retryAfterMs,
    );
  }
  if (status === 403) {
    return new DriveRequestError('permission-denied', status, 'Drive permission denied');
  }
  if (status === 429) {
    return new DriveRequestError(
      'rate-limited',
      status,
      'Drive rate limit reached',
      retryAfterMs,
    );
  }
  if (status === 400) {
    return new DriveRequestError(
      'invalid-request',
      status,
      'Drive rejected an invalid request',
    );
  }
  if (status === 404 || status === 410) {
    return new DriveRequestError(
      'transient',
      status,
      'Drive object or cursor was not found',
    );
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
  /** The running pass's cancellation signal, read at the start of each request. */
  signal?: () => AbortSignal | null | undefined;
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
    const signal = this.options.signal?.() ?? null;
    let authRetried = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      throwIfCancelled(signal);
      // Re-read the durable window before every attempt: another request may
      // have recorded a longer server-mandated delay while this one waited.
      const retryWait =
        this.options.state.loadDiscovery(vaultId).retryNotBefore - this.options.now();
      if (retryWait > 0) {
        if (attempt === 0 || retryWait > MAX_RETRY_DELAY_MS) {
          throw new DriveRequestError(
            'rate-limited',
            429,
            'Drive retry window is still active',
            retryWait,
          );
        }
        await this.sleep(retryWait, signal);
      }
      let token: string;
      try {
        // shortcut: the token refresh takes no signal and is awaited, not
        // abandoned, so a Disconnect drain waits for it. An abandoned refresh
        // could store new tokens after sign-out cleared them. Revisit if the
        // auth modules accept an AbortSignal.
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
      throwIfCancelled(signal);
      const started = this.options.now();
      const guard = new RequestGuard(signal);
      let response: DriveResponseLike;
      try {
        response = guard.wrap(
          await guard.phase(
            () =>
              this.fetcher(url, {
                ...init,
                headers: {
                  ...((init.headers as Record<string, string> | undefined) ?? {}),
                  Authorization: `Bearer ${token}`,
                },
                signal: guard.signal,
              }),
            REQUEST_TIMEOUT_MS +
              Math.ceil(requestBodyBytes(init.body) / MIN_UPLOAD_BYTES_PER_MS),
          ),
        );
      } catch (failure) {
        if (failure instanceof SyncCancelledError) throw failure;
        const error =
          failure instanceof DriveRequestError
            ? failure
            : new DriveRequestError('transient', 0, 'Unable to reach Google Drive');
        this.recordAttempt(methodClass, error, started, init.body, null, attempt > 0);
        if (options.idempotent && attempt < 2) {
          await this.sleep(this.retryDelay(attempt), signal);
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
      const reason = await errorReason(response);
      // errorReason swallows read failures; never map a cancelled read to a
      // provider failure that could record Attention.
      throwIfCancelled(signal);
      const error = mapStatus(response.status, reason, retryAfterMs);
      this.recordAttempt(methodClass, error, started, init.body, response, attempt > 0);
      if (response.status === 401 && !authRetried) {
        authRetried = true;
        await this.options.auth.clearInvalidAccessToken();
        continue;
      }
      if (error.code === 'rate-limited' && retryAfterMs !== null) {
        this.options.state.setRetryNotBefore(vaultId, this.options.now() + retryAfterMs);
      }
      if (
        options.idempotent &&
        attempt < 2 &&
        (error.code === 'rate-limited' || error.code === 'transient') &&
        ![404, 410].includes(error.status)
      ) {
        // Never retry before the server's Retry-After. A longer delay than this
        // pass will wait ends the pass; the durable window gates later passes.
        const delay = retryAfterMs ?? this.retryDelay(attempt);
        if (delay > MAX_RETRY_DELAY_MS) throw error;
        await this.sleep(delay, signal);
        continue;
      }
      throw error;
    }
    throw new SnapshotProviderError('transient', 'Drive retry limit reached');
  }

  private sleep(milliseconds: number, signal: AbortSignal | null): Promise<void> {
    return untilCancelled(this.options.sleep(milliseconds), signal);
  }

  private retryDelay(attempt: number): number {
    return Math.min(
      BASE_RETRY_DELAY_MS * 2 ** attempt + Math.floor(this.options.random() * 1_000),
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
    const parsedResponseLength =
      responseLength === null || responseLength === undefined
        ? null
        : Number(responseLength);
    this.options.instrumentation.record({
      methodClass,
      resultClass: error ? resultClass(error) : 'success',
      durationBucket: driveDurationBucket(Math.max(0, this.options.now() - startedAt)),
      requestBytesBucket: driveByteBucket(requestBodyBytes(requestBody)),
      responseBytesBucket:
        parsedResponseLength !== null &&
        Number.isSafeInteger(parsedResponseLength) &&
        parsedResponseLength >= 0
          ? driveByteBucket(parsedResponseLength)
          : 'unknown',
      retry,
      quotaUnits: driveQuotaUnits(methodClass),
    });
  }
}
