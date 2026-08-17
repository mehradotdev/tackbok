export type CloudSyncRolloutMode = 'all' | 'v1-only' | 'v2-only' | 'off';
export type CloudSyncProtocolVersion = 1 | 2;

export interface CloudSyncRolloutPolicy {
  mode: CloudSyncRolloutMode;
  /** False only when an explicitly supplied value was not recognized. */
  configuredValueValid: boolean;
  allows(protocolVersion: CloudSyncProtocolVersion): boolean;
}

const VALID_MODES = new Set<CloudSyncRolloutMode>([
  'all',
  'v1-only',
  'v2-only',
  'off',
]);

/**
 * Resolve the build/OTA cloud-sync rollout policy.
 *
 * An absent value preserves the current alpha behavior (`all`). An invalid
 * explicit value fails closed (`off`) so a misspelled emergency switch cannot
 * accidentally leave provider traffic enabled.
 */
export function resolveCloudSyncRolloutPolicy(
  configuredValue: string | undefined,
): CloudSyncRolloutPolicy {
  const absent = configuredValue === undefined || configuredValue.trim() === '';
  const normalized = absent ? 'all' : configuredValue.trim().toLowerCase();
  const valid = VALID_MODES.has(normalized as CloudSyncRolloutMode);
  const mode: CloudSyncRolloutMode = valid
    ? normalized as CloudSyncRolloutMode
    : 'off';
  return {
    mode,
    configuredValueValid: absent || valid,
    allows(protocolVersion) {
      return mode === 'all' || mode === `v${protocolVersion}-only`;
    },
  };
}

export function getCloudSyncRolloutPolicy(): CloudSyncRolloutPolicy {
  // Dot notation is intentional: Expo inlines EXPO_PUBLIC_* values into the JS
  // update bundle, making the switch controllable per release/update channel.
  return resolveCloudSyncRolloutPolicy(
    process.env.EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT,
  );
}

export function isCloudSyncNetworkAllowed(
  protocolVersion: CloudSyncProtocolVersion,
): boolean {
  return getCloudSyncRolloutPolicy().allows(protocolVersion);
}

export class CloudSyncRolloutDisabledError extends Error {
  readonly category = 'transient' as const;

  constructor(readonly protocolVersion: CloudSyncProtocolVersion) {
    super(`Cloud sync network work is disabled for protocol v${protocolVersion}`);
    this.name = 'CloudSyncRolloutDisabledError';
  }
}

export function assertCloudSyncNetworkAllowed(
  protocolVersion: CloudSyncProtocolVersion,
): void {
  if (!isCloudSyncNetworkAllowed(protocolVersion)) {
    throw new CloudSyncRolloutDisabledError(protocolVersion);
  }
}
