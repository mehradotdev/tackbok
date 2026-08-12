import { fetch } from 'expo/fetch';

import { CloudAuthError } from './types';

export async function fetchGoogleAccountLabel(accessToken: string): Promise<string> {
  let response;
  try {
    response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Offline is not evidence against the token; keep the cosmetic fallback.
    return 'Google Drive';
  }
  if (response.status === 401 || response.status === 403) {
    // The token itself was rejected. Swallowing this into the fallback label
    // made a dead token look like a healthy connection (phase3 finding 0001),
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
