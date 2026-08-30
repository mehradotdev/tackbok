export type CloudSyncRolloutMode = 'on' | 'off';

export interface CloudSyncRolloutPolicy {
  mode: CloudSyncRolloutMode;
  /** False only when an explicitly supplied value was not recognized. */
  configuredValueValid: boolean;
  networkAllowed: boolean;
}

/**
 * Resolve the build/OTA cloud-sync kill switch. An absent value enables sync;
 * an invalid explicit value fails closed so a typo cannot leave provider
 * traffic running during an emergency rollback.
 */
export function resolveCloudSyncRolloutPolicy(
  configuredValue: string | undefined,
): CloudSyncRolloutPolicy {
  const absent = configuredValue === undefined || configuredValue.trim() === '';
  const normalized = absent ? 'on' : configuredValue.trim().toLowerCase();
  const valid = normalized === 'on' || normalized === 'off';
  const mode: CloudSyncRolloutMode = valid ? normalized : 'off';
  return {
    mode,
    configuredValueValid: absent || valid,
    networkAllowed: mode === 'on',
  };
}

export function getCloudSyncRolloutPolicy(): CloudSyncRolloutPolicy {
  // Expo inlines EXPO_PUBLIC_* values into the JS update bundle, making this
  // switch controllable per release/update channel.
  return resolveCloudSyncRolloutPolicy(
    process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT,
  );
}

export function isCloudSyncNetworkAllowed(): boolean {
  return getCloudSyncRolloutPolicy().networkAllowed;
}

export class CloudSyncRolloutDisabledError extends Error {
  readonly category = 'transient' as const;

  constructor() {
    super('Cloud sync network work is disabled');
    this.name = 'CloudSyncRolloutDisabledError';
  }
}

export function assertCloudSyncNetworkAllowed(): void {
  if (!isCloudSyncNetworkAllowed()) {
    throw new CloudSyncRolloutDisabledError();
  }
}
