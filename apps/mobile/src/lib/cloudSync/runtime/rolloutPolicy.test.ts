import {
  CloudSyncRolloutDisabledError,
  assertCloudSyncNetworkAllowed,
  resolveCloudSyncRolloutPolicy,
} from './rolloutPolicy';

describe('cloud-sync rollout policy', () => {
  test('an absent value enables cloud sync', () => {
    expect(resolveCloudSyncRolloutPolicy(undefined)).toEqual({
      mode: 'on',
      configuredValueValid: true,
      networkAllowed: true,
    });
  });

  test.each([
    ['on', true],
    ['off', false],
  ] as const)('%s selects the intended network state', (mode, networkAllowed) => {
    expect(resolveCloudSyncRolloutPolicy(mode)).toEqual({
      mode,
      configuredValueValid: true,
      networkAllowed,
    });
  });

  test('an invalid explicit value fails closed', () => {
    expect(resolveCloudSyncRolloutPolicy('onn')).toEqual({
      mode: 'off',
      configuredValueValid: false,
      networkAllowed: false,
    });
  });

  test('the runtime assertion fails before its caller can begin work', () => {
    const prior = process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT;
    process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT = 'off';
    let providerConstructed = false;
    try {
      expect(() => {
        assertCloudSyncNetworkAllowed();
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
