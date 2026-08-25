import * as SecureStore from 'expo-secure-store';

import type { GoogleTokenSet } from './types';

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const CONNECTED_KEY = 'tackbok.cloud-sync.google.connected.v1';
const ACCOUNT_EMAIL_KEY = 'tackbok.cloud-sync.google.account-email.v1';
const CONNECTION_ID_KEY = 'tackbok.cloud-sync.google.connection-id.v1';

function normalizeAccountEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

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
  const { accountEmail, ...credentialTokens } = tokens;
  const normalizedEmail = normalizeAccountEmail(accountEmail);
  if (normalizedEmail) await writeGoogleAccountEmail(normalizedEmail);
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(credentialTokens), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearGoogleTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(ACCOUNT_EMAIL_KEY),
    SecureStore.deleteItemAsync(CONNECTION_ID_KEY),
  ]);
}

/**
 * Opaque epoch for scoping durable Drive cursors/file IDs without persisting
 * an account identifier. It rotates after every interactive connection and is
 * deleted with credentials on Disconnect.
 */
export async function readOrCreateGoogleConnectionId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(CONNECTION_ID_KEY);
  if (stored) return stored;
  return rotateGoogleConnectionId();
}

export async function rotateGoogleConnectionId(): Promise<string> {
  let value: string;
  try {
    const { randomUUID } = await import('expo-crypto');
    value = randomUUID();
  } catch {
    // The epoch is an isolation nonce, not a credential. This fallback keeps
    // non-native test environments functional without weakening token storage.
    value = `connection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  await SecureStore.setItemAsync(CONNECTION_ID_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return value;
}

export async function clearGoogleAccessToken(): Promise<void> {
  const current = await readGoogleTokens();
  if (!current) return;
  if (current.refreshToken) {
    await writeGoogleTokens({ ...current, accessToken: '', expiresAt: 0 });
  } else {
    // Android can discard a rejected access token while remaining connected.
    // Keep the separately stored account pin for the silent replacement mint.
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function readGoogleAccountEmail(): Promise<string | null> {
  const stored = normalizeAccountEmail(await SecureStore.getItemAsync(ACCOUNT_EMAIL_KEY));
  if (stored) return stored;

  // Compatibility with credentials written before the email received its own
  // SecureStore key. Migrate lazily without putting the value in app storage.
  const legacyTokens = await readGoogleTokens();
  const legacyEmail = normalizeAccountEmail(legacyTokens?.accountEmail);
  if (!legacyEmail) return null;
  await writeGoogleAccountEmail(legacyEmail);
  return legacyEmail;
}

export async function writeGoogleAccountEmail(email: string): Promise<void> {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) return;
  await SecureStore.setItemAsync(ACCOUNT_EMAIL_KEY, normalized, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearGoogleAccountEmail(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNT_EMAIL_KEY);
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
 * device silently re-mints a valid token from the surviving grant.
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
