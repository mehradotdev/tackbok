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
