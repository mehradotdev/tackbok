import { fetch } from 'expo/fetch';
import { maskGoogleAccountEmail } from './policy';

export async function fetchGoogleAccountLabel(accessToken: string): Promise<string> {
  try {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return 'Google Drive';
    const body = (await response.json()) as { email?: unknown };
    return typeof body.email === 'string' && body.email.length > 0
      ? maskGoogleAccountEmail(body.email)
      : 'Google Drive';
  } catch {
    return 'Google Drive';
  }
}
