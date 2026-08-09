import * as SecureStore from 'expo-secure-store';

import type { GoogleTokenSet } from './types';

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const CONNECTED_KEY = 'tackbok.cloud-sync.google.connected.v1';

function isTokenSet(value: unknown): value is GoogleTokenSet {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GoogleTokenSet>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt) &&
    (candidate.refreshToken === undefined || typeof candidate.refreshToken === 'string') &&
    (candidate.accountEmail === undefined || typeof candidate.accountEmail === 'string') &&
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

/**
 * Durable connection state, needed on Android only.
 *
 * On iOS the stored refresh token is both the connection state and the means of
 * minting access tokens, so deleting it is a complete disconnect. On Android the
 * minting capability lives in Play services, outside anything this app can
 * delete, and the 401-recovery path legitimately deletes the whole stored token
 * set while the device is still connected — so "tokens absent" cannot mean
 * "disconnected". This mark is the missing signal: set by a successful
 * interactive authorization, removed by Disconnect, and consulted before any
 * silent token request. Without it a disconnected (or never-connected) Android
 * device silently re-mints a valid token from the surviving grant
 * (phase3 finding 0002).
 */
export async function markGoogleConnected(): Promise<void> {
  await SecureStore.setItemAsync(CONNECTED_KEY, '1', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearGoogleConnectedMark(): Promise<void> {
  await SecureStore.deleteItemAsync(CONNECTED_KEY);
}

export async function isGoogleMarkedConnected(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CONNECTED_KEY)) === '1';
}
