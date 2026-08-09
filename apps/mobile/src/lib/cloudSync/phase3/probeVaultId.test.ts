import {
  CONCURRENT_RUN_GRACE_MS,
  isProbeVaultId,
  isStaleProbeVault,
  newProbeVaultId,
  probeVaultCreatedAt,
} from './probeVaultId';

const NOW = Date.parse('2026-08-09T12:00:00.000Z');

describe('probe vault identity', () => {
  it('round-trips the creation time it encodes', () => {
    const id = newProbeVaultId(NOW);
    expect(isProbeVaultId(id)).toBe(true);
    expect(probeVaultCreatedAt(id)).toBe(NOW);
  });

  it('reads no creation time out of an id that does not carry one', () => {
    expect(probeVaultCreatedAt('vault-of-a-real-user')).toBeNull();
    expect(probeVaultCreatedAt('probe-NOT_BASE36')).toBeNull();
    expect(probeVaultCreatedAt('probe-')).toBeNull();
  });
});

describe('stale probe vault eligibility', () => {
  it('never touches a vault without the probe prefix', () => {
    // The whole safety story rests on this: a real vault must be unreachable
    // even if one somehow appeared in the test account.
    const ancient = 'v-2020-real-user-vault';
    expect(isStaleProbeVault(ancient, 'probe-x', NOW)).toBe(false);
  });

  it('never touches the vault the current run is using', () => {
    const mine = newProbeVaultId(NOW - CONCURRENT_RUN_GRACE_MS * 10);
    expect(isStaleProbeVault(mine, mine, NOW)).toBe(false);
  });

  it('spares a vault young enough to belong to a run in flight', () => {
    // A second device signed into the same test account shares this
    // appDataFolder. Deleting its vault would break its transfer mid-flight.
    const concurrent = newProbeVaultId(NOW - 20 * 60 * 1000);
    expect(isStaleProbeVault(concurrent, 'probe-mine', NOW)).toBe(false);
  });

  it('deletes a vault older than the grace period', () => {
    const abandoned = newProbeVaultId(NOW - CONCURRENT_RUN_GRACE_MS - 1);
    expect(isStaleProbeVault(abandoned, 'probe-mine', NOW)).toBe(true);
  });

  it('treats the grace boundary itself as stale', () => {
    const boundary = newProbeVaultId(NOW - CONCURRENT_RUN_GRACE_MS);
    expect(isStaleProbeVault(boundary, 'probe-mine', NOW)).toBe(true);
  });

  it('deletes a probe vault whose id predates the timestamped scheme', () => {
    // Such an id cannot belong to a live run, so leaving it would strand it.
    expect(isStaleProbeVault('probe-legacy_id', 'probe-mine', NOW)).toBe(true);
  });

  it('spares a vault stamped in the future rather than guessing', () => {
    // Two devices with skewed clocks are likelier than a real future vault.
    const skewed = newProbeVaultId(NOW + 60 * 60 * 1000);
    expect(isStaleProbeVault(skewed, 'probe-mine', NOW)).toBe(false);
  });
});
