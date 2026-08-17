import {
  CloudSyncRolloutDisabledError,
  assertCloudSyncNetworkAllowed,
  resolveCloudSyncRolloutPolicy,
} from './rolloutPolicy';

describe('cloud-sync rollout policy', () => {
  test('an absent value preserves the current dual-protocol alpha behavior', () => {
    const policy = resolveCloudSyncRolloutPolicy(undefined);
    expect(policy).toMatchObject({ mode: 'all', configuredValueValid: true });
    expect(policy.allows(1)).toBe(true);
    expect(policy.allows(2)).toBe(true);
  });

  test.each([
    ['all', true, true],
    ['v1-only', true, false],
    ['v2-only', false, true],
    ['off', false, false],
  ] as const)('%s selects the intended protocol traffic', (mode, v1, v2) => {
    const policy = resolveCloudSyncRolloutPolicy(mode);
    expect(policy.configuredValueValid).toBe(true);
    expect(policy.allows(1)).toBe(v1);
    expect(policy.allows(2)).toBe(v2);
  });

  test('an invalid explicit value fails closed', () => {
    const policy = resolveCloudSyncRolloutPolicy('v2-onyl');
    expect(policy).toMatchObject({ mode: 'off', configuredValueValid: false });
    expect(policy.allows(1)).toBe(false);
    expect(policy.allows(2)).toBe(false);
  });

  test('the runtime assertion fails before its caller can begin work', () => {
    const prior = process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT;
    process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT = 'off';
    let providerConstructed = false;
    try {
      expect(() => {
        assertCloudSyncNetworkAllowed(2);
        providerConstructed = true;
      }).toThrow(CloudSyncRolloutDisabledError);
      expect(providerConstructed).toBe(false);
    } finally {
      if (prior === undefined) {
        delete process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT;
      } else {
        process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT = prior;
      }
    }
  });
});
