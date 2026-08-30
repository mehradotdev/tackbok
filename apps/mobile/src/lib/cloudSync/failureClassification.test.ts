import {
  attentionReasonForProviderError,
  failureCategoryForAttention,
  providerErrorCodeForAuthError,
  readCloudSyncFailureCategory,
} from './failureClassification';

describe('cloud sync failure classification', () => {
  test('separates retryable token refresh from terminal authorization failures', () => {
    expect(providerErrorCodeForAuthError('temporarily-unavailable')).toBe('transient');
    expect(providerErrorCodeForAuthError('refresh-failed')).toBe('authorization-required');
  });

  test('maps provider failures to durable attention only when user action is required', () => {
    expect(attentionReasonForProviderError('quota-full')).toBe('provider-quota-full');
    expect(attentionReasonForProviderError('transient')).toBeNull();
  });

  test('uses one validated analytics category parser', () => {
    expect(readCloudSyncFailureCategory({ category: 'offline' })).toBe('offline');
    expect(readCloudSyncFailureCategory({ category: 'unexpected' })).toBe('unknown');
    expect(failureCategoryForAttention('local-media-unreadable')).toBe('corrupt');
  });
});
