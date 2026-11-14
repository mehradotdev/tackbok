import { fetch } from 'expo/fetch';

import { CloudAuthError } from './types';

/**
 * The label is cosmetic, but loading it holds the connection barrier, so a
 * stalled request must not keep Disconnect or Reconnect waiting.
 */
const ACCOUNT_LABEL_TIMEOUT_MS = 10_000;

export async function fetchGoogleAccountLabel(accessToken: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACCOUNT_LABEL_TIMEOUT_MS);
  try {
    return await requestGoogleAccountLabel(accessToken, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGoogleAccountLabel(
  accessToken: string,
  signal: AbortSignal,
): Promise<string> {
  let response;
  try {
    response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
  } catch {
    // Offline or timed out is not evidence against the token; keep the cosmetic fallback.
    return 'Google Drive';
  }
  if (response.status === 401 || response.status === 403) {
    // The token itself was rejected. Swallowing this into the fallback label
    // made a dead token look like a healthy connection,
    // so it must surface as an auth failure instead.
    throw new CloudAuthError('refresh-failed', 'Google rejected the access token');
  }
  if (!response.ok) return 'Google Drive';
  let body: { email?: unknown };
  try {
    body = (await response.json()) as { email?: unknown };
  } catch {
    return 'Google Drive';
  }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  return email.length > 0 ? email : 'Google Drive';
}
