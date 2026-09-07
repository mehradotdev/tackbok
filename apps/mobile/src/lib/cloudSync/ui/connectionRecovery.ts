import type { SQLiteSyncStateStore } from '../snapshot/sync/sqliteState';

/** Only authorization failures are resolved by renewing Google consent. */
export function clearAuthorizationPause(
  state: SQLiteSyncStateStore, vaultId: string, deviceId: string,
): void {
  state.clearPause(vaultId, deviceId, 'authorization-required');
  state.clearPause(vaultId, deviceId, 'provider-permission-denied');
}

/** Missing heads are safe to initialize only for an unestablished, same-account backup. */
export function canResumeUnpublishedBackup(input: {
  previousEmail: string | null;
  currentEmail: string | null;
  settledGeneration: number;
  hasBase: boolean;
  availableVaultCount: number;
  revoked: boolean;
}): boolean {
  return Boolean(input.previousEmail && input.currentEmail &&
    input.previousEmail.toLowerCase() === input.currentEmail.toLowerCase() &&
    input.settledGeneration === 0 && !input.hasBase &&
    input.availableVaultCount === 0 && !input.revoked);
}
