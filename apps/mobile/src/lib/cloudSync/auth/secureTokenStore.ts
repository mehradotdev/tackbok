import * as SecureStore from 'expo-secure-store';

import type { GoogleTokenSet } from './types';

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';

function isTokenSet(value: unknown): value is GoogleTokenSet {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GoogleTokenSet>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt) &&
    (candidate.refreshToken === undefined || typeof candidate.refreshToken === 'string') &&
    (candidate.accessToken.length > 0 || Boolean(candidate.refreshToken))
  );
}

export async function readGoogleTokens(): Promise<GoogleTokenSet | null> {
  const stored = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isTokenSet(parsed)) return parsed;
  } catch {
    // Corrupt local credentials are equivalent to being signed out.
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  return null;
}

export async function writeGoogleTokens(tokens: GoogleTokenSet): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearGoogleTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function clearGoogleAccessToken(): Promise<void> {
  const current = await readGoogleTokens();
  if (!current) return;
  if (current.refreshToken) {
    await writeGoogleTokens({ ...current, accessToken: '', expiresAt: 0 });
  } else {
    await clearGoogleTokens();
  }
}
