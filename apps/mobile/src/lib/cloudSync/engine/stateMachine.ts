export type SyncState =
  | 'disabled'
  | 'connecting'
  | 'initializing'
  | 'idle'
  | 'dirty'
  | 'pulling'
  | 'resolving'
  | 'pushing'
  | 'verifying'
  | 'paused_auth'
  | 'paused_quota'
  | 'paused_corrupt'
  | 'deferred_offline'
  | 'revoked';

const TRANSITIONS: Record<SyncState, ReadonlySet<SyncState>> = {
  disabled: new Set(['connecting']),
  connecting: new Set(['initializing', 'paused_auth', 'disabled']),
  initializing: new Set(['idle', 'paused_corrupt', 'revoked']),
  idle: new Set(['dirty', 'pulling', 'disabled', 'revoked']),
  dirty: new Set(['pulling', 'deferred_offline', 'paused_auth', 'revoked']),
  pulling: new Set(['resolving', 'paused_auth', 'paused_corrupt', 'deferred_offline', 'revoked']),
  resolving: new Set(['pushing', 'paused_corrupt', 'revoked']),
  pushing: new Set(['verifying', 'paused_auth', 'paused_quota', 'deferred_offline', 'revoked']),
  verifying: new Set(['idle', 'dirty', 'paused_corrupt', 'revoked']),
  paused_auth: new Set(['connecting', 'disabled', 'revoked']),
  paused_quota: new Set(['dirty', 'disabled', 'revoked']),
  paused_corrupt: new Set(['disabled']),
  deferred_offline: new Set(['dirty', 'pulling', 'disabled', 'revoked']),
  revoked: new Set(['disabled']),
};

export class SyncStateMachine {
  constructor(private current: SyncState = 'disabled') {}

  get state(): SyncState {
    return this.current;
  }

  transition(next: SyncState): SyncState {
    if (next === this.current) return this.current;
    if (!TRANSITIONS[this.current].has(next)) {
      throw new Error(`Invalid sync transition: ${this.current} -> ${next}`);
    }
    this.current = next;
    return next;
  }

  /** Rehydrates an interrupted active pass from durable dirty/clean state. */
  recoverAfterCrash(hasDirtyWork: boolean): SyncState {
    if (
      this.current === 'pulling' ||
      this.current === 'resolving' ||
      this.current === 'pushing' ||
      this.current === 'verifying'
    ) {
      this.current = hasDirtyWork ? 'dirty' : 'idle';
    }
    return this.current;
  }
}
