import type { SyncAttentionReason } from './types';

export class AttentionError extends Error {
  constructor(
    readonly reason: SyncAttentionReason,
    readonly errorClass: string,
  ) {
    super(errorClass);
    this.name = 'AttentionError';
  }
}

export class RetryableSyncError extends Error {
  constructor(readonly errorClass: string) {
    super(errorClass);
    this.name = 'RetryableSyncError';
  }
}

/**
 * A pass was cancelled by Stop, Pause, Disconnect or another connection change.
 * It is deliberately not a provider error: no retry, attention or failure state
 * may be recorded for it. Durable publication stages stay resumable.
 */
export class SyncCancelledError extends Error {
  constructor() {
    super('Cloud sync pass was cancelled');
    this.name = 'SyncCancelledError';
  }
}

export function throwIfCancelled(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) throw new SyncCancelledError();
}

/** Settles with `promise`, or rejects with SyncCancelledError once `signal` aborts. */
export function untilCancelled<T>(
  promise: Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new SyncCancelledError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new SyncCancelledError());
    signal.addEventListener('abort', onAbort);
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
