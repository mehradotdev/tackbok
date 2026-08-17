import type { V2AttentionReason } from './types';

export interface PersistedDeletionState {
  status: string;
  revocationKind: 'journal-deleted' | 'backup-deleted' | null;
  revocationAcknowledgedAt: number | null;
  pauseReason: V2AttentionReason | null;
}

/**
 * Recovers deletion intent when the process dies before the request catch
 * handler can record a more specific pause. Ordinary sync is disabled while
 * status is `paused`; this function gives that durable state an actionable UI.
 */
export function deletionAttentionReason(
  state: PersistedDeletionState,
): V2AttentionReason | null {
  if (state.status === 'revoked' && state.revocationKind === 'journal-deleted') {
    return 'journal-deleted';
  }
  if (state.status === 'revoked' && state.revocationKind === 'backup-deleted' &&
      state.revocationAcknowledgedAt === null) {
    return 'backup-deleted';
  }
  if (state.status === 'revoked' && state.revocationKind === 'backup-deleted') return null;
  if (state.pauseReason) return state.pauseReason;
  if (state.status === 'paused' && state.revocationKind) return 'purge-incomplete';
  return null;
}
