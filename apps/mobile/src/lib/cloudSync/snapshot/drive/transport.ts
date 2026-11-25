import { CloudAuthError, type CloudAuthorization } from '../../auth/types';
import { providerErrorCodeForAuthError } from '../../failureClassification';
import { SyncCancelledError, throwIfCancelled, untilCancelled } from '../sync/errors';
import type { SnapshotProviderErrorCode, SyncProgressReport } from '../sync/types';
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
/**
 * Uploads below this sustained rate (64 KB/s), combined across the uploads in
 * flight, are treated as stalled (see `UploadFloor`).
 */
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
 * The upload stall floor, shared by the uploads in flight. Neither expo/fetch
 * nor its native clients bound an upload or report its progress, so an upload
 * is stalled once the floor rate could have carried its body, after the usual
 * 60 s grace. While n uploads are in flight each is credited 1/n of the
 * elapsed time (processor sharing): six parallel uploads on a slow uplink are
 * judged on their combined rate, not each on the full floor (#264), and a dead
 * connection still aborts once the floor could have carried every body in
 * flight. A lone upload keeps the plain 60 s + bytes / floor deadline.
 */
class UploadFloor {
  private inFlight = 0;
  /** Floor time credited to each upload in flight, summed since creation. */
  private credited = 0;
  private at: number;

  constructor(private readonly now: () => number) {
    this.at = now();
  }

  private advance(): number {
    const now = this.now();
    if (this.inFlight > 0) this.credited += (now - this.at) / this.inFlight;
    this.at = now;
    return this.credited;
  }

  /**
   * Starts one upload. `remaining` is the real time left before it counts as
   * stalled if the number in flight stays as it is; `finish` must be called
   * once its response headers arrive or it fails.
   */
  start(bodyBytes: number): { remaining: () => number; finish: () => void } {
    this.advance();
    this.inFlight += 1;
    const started = this.now();
    const due = bodyBytes / MIN_UPLOAD_BYTES_PER_MS;
    let creditedAtGraceEnd: number | null = null;
    let finished = false;
    return {
      remaining: () => {
        const grace = REQUEST_TIMEOUT_MS - (this.now() - started);
        if (grace > 0) return grace;
        creditedAtGraceEnd ??= this.advance();
        return Math.ceil((due - (this.advance() - creditedAtGraceEnd)) * this.inFlight);
      },
      finish: () => {
        if (finished) return;
        finished = true;
        this.advance();
        this.inFlight -= 1;
      },
    };
  }
}

/**
 * One request's cancellation: the pass signal plus a deadline for each phase
 * (headers, then every body read). Either aborts the fetch, so expo/fetch
 * cancels the native request and errors its body stream. Listeners and timers
 * live only while a phase runs, so a completed or discarded response retains
 * nothing on the pass signal.
 */
class RequestGuard {
  private readonly controller = new AbortController();
  private timedOut = false;

  constructor(private readonly passSignal: AbortSignal | null) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Runs one phase. Rejects promptly on abort even if `work` never settles.
   * It times out after `REQUEST_TIMEOUT_MS`, or with `remaining`, once that
   * returns no time left; it is asked again each time its last answer ends.
   */
  phase<T>(work: () => Promise<T>, remaining?: () => number): Promise<T> {
    if (this.passSignal?.aborted) this.controller.abort();
    if (this.controller.signal.aborted) return Promise.reject(this.abortError());
    return new Promise<T>((resolve, reject) => {
      const abort = () => this.controller.abort();
      let timer: ReturnType<typeof setTimeout>;
      const arm = (milliseconds: number) => {
        timer = setTimeout(() => {
          const left = remaining?.() ?? 0;
          if (left > 0) {
            arm(left);
            return;
          }
          this.timedOut = true;
          this.controller.abort();
        }, milliseconds);
      };
      arm(remaining?.() ?? REQUEST_TIMEOUT_MS);
      let settled = false;
      const settle = () => {
        settled = true;
        clearTimeout(timer);
        this.passSignal?.removeEventListener('abort', abort);
        this.controller.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        settle();
        reject(this.abortError());
      };
      this.passSignal?.addEventListener('abort', abort);
      this.controller.signal.addEventListener('abort', onAbort);
      work().then(
        (value) => {
          if (settled) return;
          settle();
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
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

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * An HTTP date as Drive sends it (`Tue, 01 Mar 2033 12:00:00 GMT`), parsed
 * by hand: `Date.parse` support for this format varies between engines.
 */
export function parseHttpDate(value: string | null): number | null {
  const match =
    /^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value?.trim() ?? '',
    );
  const month = match ? MONTHS.indexOf(match[2]) : -1;
  if (!match || month < 0) return null;
  const time = Date.UTC(+match[3], month, +match[1], +match[4], +match[5], +match[6]);
  return Number.isFinite(time) ? time : null;
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * The Drive reason in an error body, or null when the body is not readable
 * JSON. A cancelled or timed-out read rethrows: its reason is unknown, not absent.
 */
async function errorReason(response: DriveResponseLike): Promise<string | null> {
  try {
    const body = (await response.json()) as {
      error?: { errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] };
    };
    const reasons = [...(body.error?.errors ?? []), ...(body.error?.details ?? [])]
      .map((value) => value.reason)
      .filter((value): value is string => typeof value === 'string');
    return reasons[0] ?? null;
  } catch (error) {
    if (error instanceof SyncCancelledError || error instanceof DriveRequestError) {
      throw error;
    }
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
  /** A clock that only moves forward (`performance.now` unless a test sets one). */
  monotonicNow?: () => number;
  /** The running pass's cancellation signal, read at the start of each request. */
  signal?: () => AbortSignal | null | undefined;
  /** Display only: reports retry waits so they never look like a stall. */
  onProgress?: (report: SyncProgressReport) => void;
}

export class DriveTransport {
  private readonly fetcher: DriveFetchLike;
  /**
   * Drive's time at the latest response with a `Date` header, and the
   * monotonic clock then: wall-clock jumps after it change nothing.
   */
  private serverSample: { date: number; at: number } | null = null;
  private readonly uploadFloor: UploadFloor;

  constructor(private readonly options: DriveTransportOptions) {
    this.fetcher = options.fetch ?? defaultDriveFetch;
    this.uploadFloor = new UploadFloor(() => this.monotonic());
  }

  /**
   * Drive's own time now: the latest response's `Date` header (whole
   * seconds, so up to a second behind), advanced by the monotonic clock.
   * Null before any response had one.
   */
  serverTime(): number | null {
    const sample = this.serverSample;
    return sample === null
      ? null
      : sample.date + Math.max(0, this.monotonic() - sample.at);
  }

  private monotonic(): number {
    return this.options.monotonicNow?.() ?? performance.now();
  }

  private observeDate(response: DriveResponseLike): void {
    const date = parseHttpDate(response.headers.get('date'));
    if (date !== null) this.serverSample = { date, at: this.monotonic() };
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
      const honored = await this.awaitRetryWindow(vaultId, attempt, signal, -Infinity);
      let token: string;
      try {
        // shortcut: the token refresh takes no signal and is awaited, not
        // abandoned, so a Disconnect drain waits for it. An abandoned refresh
        // could store new tokens after sign-out cleared them. Revisit if the
        // auth modules accept an AbortSignal.
        token = await this.options.auth.getFreshAccessToken();
      } catch (error) {
        // A refresh that fails after cancellation is not a provider failure.
        throwIfCancelled(signal);
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
      // Another request may have extended the window while the token refreshed.
      await this.awaitRetryWindow(vaultId, attempt, signal, honored);
      const started = this.options.now();
      const guard = new RequestGuard(signal);
      const bodyBytes = requestBodyBytes(init.body);
      const upload = bodyBytes > 0 ? this.uploadFloor.start(bodyBytes) : null;
      let response: DriveResponseLike;
      try {
        response = guard.wrap(
          await guard
            .phase(
              () =>
                this.fetcher(url, {
                  ...init,
                  headers: {
                    ...((init.headers as Record<string, string> | undefined) ?? {}),
                    Authorization: `Bearer ${token}`,
                  },
                  signal: guard.signal,
                }),
              upload?.remaining,
            )
            // Leaves the shared floor before any retry backoff.
            .finally(() => upload?.finish()),
        );
      } catch (failure) {
        if (failure instanceof SyncCancelledError) throw failure;
        const error =
          failure instanceof DriveRequestError
            ? failure
            : new DriveRequestError('transient', 0, 'Unable to reach Google Drive');
        this.recordAttempt(methodClass, error, started, init.body, null, attempt > 0);
        if (options.idempotent && attempt < 2) {
          await this.wait('retry-backoff', this.retryDelay(attempt), signal);
          continue;
        }
        throw error;
      }
      this.observeDate(response);
      if (response.ok || accepted.includes(response.status)) {
        this.recordAttempt(methodClass, null, started, init.body, response, attempt > 0);
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get('retry-after'),
        this.options.now(),
      );
      // Record the server's window before the body read can fail or be cancelled.
      // A 403 may be a rate limit whose reason is only in that body.
      if (
        retryAfterMs !== null &&
        (response.status === 403 || response.status === 429 || response.status >= 500)
      ) {
        this.extendRetryWindow(vaultId, retryAfterMs);
      }
      let error: DriveRequestError;
      try {
        error = mapStatus(response.status, await errorReason(response), retryAfterMs);
      } catch (failure) {
        if (!(failure instanceof DriveRequestError)) throw failure;
        // The error body timed out, so a 403's reason is unknown. Never guess a
        // durable failure such as permission-denied from a missing reason.
        error =
          response.status === 403
            ? new DriveRequestError(
                'transient',
                response.status,
                'Google Drive error response timed out',
                retryAfterMs,
              )
            : mapStatus(response.status, null, retryAfterMs);
      }
      // errorReason swallows unreadable bodies; never map a cancelled read to a
      // provider failure that could record Attention.
      throwIfCancelled(signal);
      this.recordAttempt(methodClass, error, started, init.body, response, attempt > 0);
      if (response.status === 401 && !authRetried) {
        authRetried = true;
        try {
          await this.options.auth.clearInvalidAccessToken();
        } catch (failure) {
          throwIfCancelled(signal);
          throw failure;
        }
        continue;
      }
      if (error.code === 'rate-limited' && retryAfterMs !== null) {
        this.extendRetryWindow(vaultId, retryAfterMs);
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
        await this.wait(
          error.code === 'rate-limited' ? 'rate-limited' : 'retry-backoff',
          delay,
          signal,
        );
        continue;
      }
      throw error;
    }
    throw new SnapshotProviderError('transient', 'Drive retry limit reached');
  }

  /**
   * Waits out the durable server window, re-reading it after each wait because
   * another request may have extended it. A window already waited for
   * (`honored`) is not waited for again. Returns the window last honored.
   */
  private async awaitRetryWindow(
    vaultId: string,
    attempt: number,
    signal: AbortSignal | null,
    honored: number,
  ): Promise<number> {
    for (;;) {
      throwIfCancelled(signal);
      const notBefore = this.options.state.loadDiscovery(vaultId).retryNotBefore;
      const retryWait = notBefore - this.options.now();
      if (retryWait <= 0 || notBefore <= honored) return honored;
      if (attempt === 0 || retryWait > MAX_RETRY_DELAY_MS) {
        throw new DriveRequestError(
          'rate-limited',
          429,
          'Drive retry window is still active',
          retryWait,
        );
      }
      await this.wait('rate-limited', retryWait, signal);
      honored = notBefore;
    }
  }

  /** Never shortens a window another request already recorded. */
  private extendRetryWindow(vaultId: string, retryAfterMs: number): void {
    const notBefore = this.options.now() + retryAfterMs;
    if (notBefore > this.options.state.loadDiscovery(vaultId).retryNotBefore) {
      this.options.state.setRetryNotBefore(vaultId, notBefore);
    }
  }

  private sleep(milliseconds: number, signal: AbortSignal | null): Promise<void> {
    return untilCancelled(this.options.sleep(milliseconds), signal);
  }

  /** The backoff before a download whose body stalled or broke off is retried. */
  retryBackoff(attempt: number): Promise<void> {
    return this.wait(
      'retry-backoff',
      this.retryDelay(attempt),
      this.options.signal?.() ?? null,
    );
  }

  /** A retry sleep, reported with its end time while it lasts. */
  private async wait(
    reason: 'rate-limited' | 'retry-backoff',
    milliseconds: number,
    signal: AbortSignal | null,
  ): Promise<void> {
    this.options.onProgress?.({
      type: 'wait',
      reason,
      until: this.options.now() + milliseconds,
    });
    try {
      await this.sleep(milliseconds, signal);
    } finally {
      this.options.onProgress?.({ type: 'wait', reason: null });
    }
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
