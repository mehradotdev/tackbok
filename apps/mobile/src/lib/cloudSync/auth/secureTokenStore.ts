import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { GoogleTokenSet } from './types';

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const CONNECTED_KEY = 'tackbok.cloud-sync.google.connected.v1';
const ACCOUNT_EMAIL_KEY = 'tackbok.cloud-sync.google.account-email.v1';
const CONNECTION_ID_KEY = 'tackbok.cloud-sync.google.connection-id.v1';
const SETUP_GUARD_KEY = 'tackbok.cloud-sync.google.setup-guard.v1';
const KEYCHAIN_MIGRATED_KEY = 'tackbok.cloud-sync.keychain-after-first-unlock.v1';

// iOS runs background sync mostly while the phone is locked, so items must be
// readable after the first unlock. THIS_DEVICE_ONLY keeps them out of iCloud
// Keychain and device backups. Android ignores this option.
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

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
    (candidate.refreshToken === undefined ||
      typeof candidate.refreshToken === 'string') &&
    (candidate.accountEmail === undefined ||
      typeof candidate.accountEmail === 'string') &&
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
  await SecureStore.setItemAsync(
    TOKEN_KEY,
    JSON.stringify(credentialTokens),
    KEYCHAIN_OPTIONS,
  );
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
  await SecureStore.setItemAsync(CONNECTION_ID_KEY, value, KEYCHAIN_OPTIONS);
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
  await SecureStore.setItemAsync(ACCOUNT_EMAIL_KEY, normalized, KEYCHAIN_OPTIONS);
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
  await SecureStore.setItemAsync(CONNECTED_KEY, '1', KEYCHAIN_OPTIONS);
}

export async function clearGoogleConnectedMark(): Promise<void> {
  await SecureStore.deleteItemAsync(CONNECTED_KEY);
}

export async function isGoogleMarkedConnected(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CONNECTED_KEY)) === '1';
}

const CREDENTIAL_KEYS = [CONNECTION_ID_KEY, ACCOUNT_EMAIL_KEY, TOKEN_KEY, CONNECTED_KEY];

/**
 * The stored Google credentials at one moment. The setup guard keeps it in
 * SecureStore while setup or Reconnect replaces them.
 */
export interface GoogleCredentialSnapshot {
  readonly values: readonly (string | null)[];
}

export async function captureGoogleCredentials(): Promise<GoogleCredentialSnapshot> {
  return {
    values: await Promise.all(
      CREDENTIAL_KEYS.map((key) => SecureStore.getItemAsync(key)),
    ),
  };
}

/** Signs out, then puts back exactly the captured credentials (absent keys stay absent). */
export async function restoreGoogleCredentials(
  snapshot: GoogleCredentialSnapshot,
  signOut: () => Promise<void>,
): Promise<void> {
  await signOut().catch(() => undefined);
  try {
    // Restore the Android admission mark last; never expose a partially restored account.
    await clearGoogleConnectedMark();
    for (let index = 0; index < CREDENTIAL_KEYS.length; index++) {
      const value = snapshot.values[index];
      if (value === null) await SecureStore.deleteItemAsync(CREDENTIAL_KEYS[index]);
      else
        await SecureStore.setItemAsync(CREDENTIAL_KEYS[index], value, KEYCHAIN_OPTIONS);
    }
  } catch {
    // A failed secure-storage write must not leave mixed-account credentials.
    await Promise.allSettled([clearGoogleConnectedMark(), clearGoogleTokens()]);
  }
}

/**
 * A connection setup in progress, written before authorization replaces the
 * current credentials. It holds what a cancelled setup puts back, so an app
 * that dies before the user chooses a backup can still put it back at launch.
 * It contains credentials, so it lives in SecureStore only.
 */
export interface GoogleSetupGuard {
  credentials: GoogleCredentialSnapshot;
  vaults: { vaultId: string; status: string }[];
}

function isSetupGuard(value: unknown): value is GoogleSetupGuard {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GoogleSetupGuard>;
  return (
    Array.isArray(candidate.credentials?.values) &&
    candidate.credentials.values.length === CREDENTIAL_KEYS.length &&
    candidate.credentials.values.every(
      (item: unknown) => item === null || typeof item === 'string',
    ) &&
    Array.isArray(candidate.vaults) &&
    candidate.vaults.every(
      (vault: unknown) =>
        typeof (vault as { vaultId?: unknown })?.vaultId === 'string' &&
        typeof (vault as { status?: unknown }).status === 'string',
    )
  );
}

export async function writeGoogleSetupGuard(guard: GoogleSetupGuard): Promise<void> {
  await SecureStore.setItemAsync(
    SETUP_GUARD_KEY,
    JSON.stringify(guard),
    KEYCHAIN_OPTIONS,
  );
}

/**
 * Throws when SecureStore cannot be read, so callers keep sync blocked and the
 * guard stays for a later attempt. 'corrupt' means a guard exists but cannot
 * put the previous connection back.
 */
export async function readGoogleSetupGuard(): Promise<
  GoogleSetupGuard | 'corrupt' | null
> {
  const stored = await SecureStore.getItemAsync(SETUP_GUARD_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isSetupGuard(parsed)) return parsed;
  } catch {
    // Handled below.
  }
  return 'corrupt';
}

/** Signs out and removes every stored credential, such as an unknown account's. */
export async function clearGoogleCredentials(
  signOut: () => Promise<void>,
): Promise<void> {
  await restoreGoogleCredentials({ values: CREDENTIAL_KEYS.map(() => null) }, signOut);
}

export async function clearGoogleSetupGuard(): Promise<void> {
  await SecureStore.deleteItemAsync(SETUP_GUARD_KEY);
}

/**
 * True until every item written before AFTER_FIRST_UNLOCK has been rewritten.
 * Throws while the keychain cannot be read.
 */
export async function needsGoogleKeychainMigration(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return (await SecureStore.getItemAsync(KEYCHAIN_MIGRATED_KEY)) !== '1';
}

/**
 * Rewrites each stored item with the same value under KEYCHAIN_OPTIONS. On iOS
 * that is one in-place keychain update, so a failed write leaves the old item
 * as it was. A read that fails while the phone is locked throws before anything
 * is written. The marker is written last, so an interrupted run repeats later;
 * repeating is harmless. Callers run it under the connection barrier so no
 * Disconnect or setup changes these items in between.
 */
export async function migrateGoogleKeychainAccessibility(): Promise<void> {
  if (!(await needsGoogleKeychainMigration())) return;
  for (const key of [...CREDENTIAL_KEYS, SETUP_GUARD_KEY]) {
    const value = await SecureStore.getItemAsync(key);
    if (value !== null) await SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS);
  }
  await SecureStore.setItemAsync(KEYCHAIN_MIGRATED_KEY, '1', KEYCHAIN_OPTIONS);
}
