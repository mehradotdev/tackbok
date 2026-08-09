/**
 * Probe vault identity.
 *
 * Kept free of provider and native imports so the rules that decide what
 * cleanup is allowed to delete can be tested directly.
 */

/** Every probe vault carries this prefix so cleanup can never touch a real one. */
export const PROBE_VAULT_PREFIX = 'probe-';

/**
 * How long a probe vault is treated as possibly belonging to a run in flight.
 * Two devices signed into the same test account share one appDataFolder, so
 * without this grace period a run finishing on one device would delete the
 * other device's objects mid-transfer. The window is wider than a full
 * 200 MiB pass takes, which is the longest a probe vault is legitimately live.
 */
export const CONCURRENT_RUN_GRACE_MS = 2 * 60 * 60 * 1000;

export function newProbeVaultId(now = Date.now()): string {
  return `${PROBE_VAULT_PREFIX}${now.toString(36)}`;
}

export function isProbeVaultId(vaultId: string): boolean {
  return vaultId.startsWith(PROBE_VAULT_PREFIX);
}

/**
 * The creation time encoded in a probe vault id, or null when the id does not
 * carry one. Ids are minted as `probe-<base36 epoch millis>`.
 */
export function probeVaultCreatedAt(vaultId: string): number | null {
  if (!isProbeVaultId(vaultId)) return null;
  const encoded = vaultId.slice(PROBE_VAULT_PREFIX.length);
  if (!/^[0-9a-z]+$/.test(encoded)) return null;
  const parsed = Number.parseInt(encoded, 36);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Whether cleanup may delete a probe vault it did not create. Anything recent
 * is left alone because it may be another device's run in progress; the
 * current run's own vault is handled by the per-run cleanup step instead.
 */
export function isStaleProbeVault(
  vaultId: string,
  currentVaultId: string,
  now = Date.now(),
): boolean {
  if (!isProbeVaultId(vaultId) || vaultId === currentVaultId) return false;
  const createdAt = probeVaultCreatedAt(vaultId);
  // An id without a usable timestamp predates the current scheme, so it cannot
  // belong to a run that is still going.
  if (createdAt === null) return true;
  // A clock that moved backwards would make a vault look like it came from the
  // future. Treat that as recent rather than risk deleting live objects.
  if (createdAt > now) return false;
  return now - createdAt >= CONCURRENT_RUN_GRACE_MS;
}
