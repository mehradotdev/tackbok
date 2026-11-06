import {
  attentionReasonForProviderError,
  failureCategoryForAttention,
  providerErrorCodeForAuthError,
  readCloudSyncFailureCategory,
} from './failureClassification';

describe('cloud sync failure classification', () => {
  test('separates retryable token refresh from terminal authorization failures', () => {
    expect(providerErrorCodeForAuthError('temporarily-unavailable')).toBe('transient');
    expect(providerErrorCodeForAuthError('refresh-failed')).toBe(
      'authorization-required',
    );
  });

  test('maps provider failures to durable attention only when user action is required', () => {
    expect(attentionReasonForProviderError('quota-full')).toBe('provider-quota-full');
    expect(attentionReasonForProviderError('transient')).toBeNull();
    expect(attentionReasonForProviderError('invalid-request')).toBe(
      'provider-request-rejected',
    );
    expect(attentionReasonForProviderError('invalid-data')).toBe(
      'invalid-remote-snapshot',
    );
    expect(failureCategoryForAttention('normalized-model-not-ready')).toBe('unknown');
    expect(failureCategoryForAttention('provider-request-rejected')).toBe('unknown');
  });

  test('uses one validated analytics category parser', () => {
    expect(readCloudSyncFailureCategory({ category: 'offline' })).toBe('offline');
    expect(readCloudSyncFailureCategory({ category: 'unexpected' })).toBe('unknown');
    expect(readCloudSyncFailureCategory({ category: 'local-media' })).toBe('local-media');
  });

  test('keeps local attachment problems separate from unreadable cloud data', () => {
    expect(failureCategoryForAttention('local-media-unreadable')).toBe('local-media');
    expect(failureCategoryForAttention('invalid-remote-snapshot')).toBe('corrupt');
  });
});
