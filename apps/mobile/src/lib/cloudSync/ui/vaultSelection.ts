import type { RemoteVaultSummary } from '../providers/types';

/**
 * Phase-3 probes reserve `probe-…` vault IDs. They are disposable test state,
 * never user backups, and must not become restore choices in the product UI.
 */
export function selectRestorableUserVaults(
  vaults: readonly RemoteVaultSummary[],
): RemoteVaultSummary[] {
  return vaults.filter((vault) =>
    !vault.revoked && !vault.vaultId.startsWith('probe-'));
}
