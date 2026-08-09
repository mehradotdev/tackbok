import {
  isTerminalGoogleRefreshError,
  maskGoogleAccountEmail,
} from './policy';

test('account labels are masked before leaving the auth layer', () => {
  expect(maskGoogleAccountEmail('owner@example.com')).toBe('o•••@e•••.com');
  expect(maskGoogleAccountEmail('not-an-email')).toBe('Google Drive');
});

test('only terminal refresh failures require token removal and re-consent', () => {
  expect(isTerminalGoogleRefreshError({ params: { error: 'invalid_grant' } })).toBe(true);
  expect(isTerminalGoogleRefreshError({ status: 401 })).toBe(true);
  expect(isTerminalGoogleRefreshError(new TypeError('Network request failed'))).toBe(false);
  expect(isTerminalGoogleRefreshError({ status: 503 })).toBe(false);
});
