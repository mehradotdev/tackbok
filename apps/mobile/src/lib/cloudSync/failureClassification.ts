import type { CloudSyncFailureCategory } from '~/lib/analytics/events';
import type { CloudAuthError } from './auth/types';
import type {
  SnapshotProviderErrorCode,
  SyncAttentionReason,
} from './snapshot/sync/types';

const FAILURE_CATEGORIES: readonly CloudSyncFailureCategory[] = [
  'auth', 'quota', 'rate-limit', 'offline', 'wifi-only-media', 'corrupt', 'transient', 'unknown',
];

export function readCloudSyncFailureCategory(error: unknown): CloudSyncFailureCategory {
  if (typeof error !== 'object' || error === null || !('category' in error)) return 'unknown';
  const category = String((error as { category: unknown }).category);
  return FAILURE_CATEGORIES.includes(category as CloudSyncFailureCategory)
    ? category as CloudSyncFailureCategory
    : 'unknown';
}

export function failureCategoryForAttention(
  reason: SyncAttentionReason,
): CloudSyncFailureCategory {
  if (reason === 'authorization-required' || reason === 'account-mismatch' ||
      reason === 'consent-incomplete' || reason === 'provider-permission-denied') return 'auth';
  if (reason === 'provider-quota-full') return 'quota';
  if (reason === 'invalid-remote-snapshot' || reason === 'unsupported-format' ||
      reason === 'derived-id-collision' || reason === 'ambiguous-device-head' ||
      reason === 'local-media-unreadable') return 'corrupt';
  return 'unknown';
}

export function providerErrorCodeForAuthError(
  code: CloudAuthError['code'],
): SnapshotProviderErrorCode {
  return code === 'temporarily-unavailable' ? 'transient' : 'authorization-required';
}

export function attentionReasonForProviderError(
  code: SnapshotProviderErrorCode,
): SyncAttentionReason | null {
  if (code === 'authorization-required') return 'authorization-required';
  if (code === 'quota-full') return 'provider-quota-full';
  if (code === 'permission-denied') return 'provider-permission-denied';
  if (code === 'invalid-data') return 'invalid-remote-snapshot';
  return null;
}
