import { requireNativeModule } from 'expo-modules-core';

import { fetchGoogleAccountLabel } from './accountLabel';
import {
  clearGoogleAccessToken,
  clearGoogleConnectedMark,
  clearGoogleTokens,
  isGoogleMarkedConnected,
  markGoogleConnected,
  readGoogleTokens,
  writeGoogleTokens,
} from './secureTokenStore';
import { CloudAuthError, type CloudAuthorization, type GoogleTokenSet } from './types';

interface NativeGoogleAuthorization {
  /**
   * `accountEmail` pins the request to one device account. Interactive calls
   * ignore it and show the account chooser; silent calls use it so a renewal
   * can never attach to a different account's surviving grant. Null means
   * unpinned, which is only acceptable for credentials stored before pinning
   * existed.
   */
  authorize(interactive: boolean, accountEmail: string | null): Promise<GoogleTokenSet>;
  /** Drops a token from the Play services cache so the next mint is real. */
  invalidateAccessToken(accessToken: string): Promise<void>;
  signOut(): Promise<void>;
}

function nativeModule(): NativeGoogleAuthorization {
  return requireNativeModule<NativeGoogleAuthorization>('GoogleAuthorizationModule');
}

function normalizeNativeError(error: unknown): CloudAuthError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  if (code.includes('CANCELLED')) return new CloudAuthError('cancelled', 'Google sign-in was cancelled');
  if (code.includes('CONSENT_REQUIRED')) {
    return new CloudAuthError('consent-required', 'Google consent is required');
  }
  // Keep the native module's message: replacing it with a generic one turns
  // every distinct failure into the same undiagnosable string.
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  return new CloudAuthError('refresh-failed', message || 'Google authorization failed');
}

export class AndroidGoogleAuthorization implements CloudAuthorization {
  async authorize(): Promise<GoogleTokenSet> {
    try {
      const tokens = await nativeModule().authorize(true, null);
      await writeGoogleTokens(tokens);
      await markGoogleConnected();
      return tokens;
    } catch (error) {
      throw normalizeNativeError(error);
    }
  }

  async getFreshAccessToken(): Promise<string> {
    // The durable mark is the connection state, not token presence: the
    // 401-recovery path deletes the stored token set while still connected,
    // and Play services would happily mint for a disconnected device whose
    // grant survives (finding 0002). Never mint silently while disconnected.
    if (!(await isGoogleMarkedConnected())) {
      throw new CloudAuthError('not-connected', 'Google Drive is not connected');
    }
    // No stored expiry is trusted here: AuthorizationResult carries no real
    // expiry (finding 0001), so Play services is the cache of record and every
    // request revalidates through it. The call is local IPC, not network.
    const cached = await readGoogleTokens();
    try {
      const tokens = await nativeModule().authorize(false, cached?.accountEmail ?? null);
      await writeGoogleTokens({ ...tokens, accountEmail: tokens.accountEmail ?? cached?.accountEmail });
      return tokens.accessToken;
    } catch (error) {
      throw normalizeNativeError(error);
    }
  }

  async clearInvalidAccessToken(): Promise<void> {
    const cached = await readGoogleTokens();
    if (cached?.accessToken) {
      try {
        // Clearing only the stored copy re-reads the same dead token from the
        // Play services cache (finding 0001). Best effort: the store clear
        // below stays authoritative even if this fails.
        await nativeModule().invalidateAccessToken(cached.accessToken);
      } catch {
        // Ignored — a failed cache invalidation must not block recovery.
      }
    }
    await clearGoogleAccessToken();
  }

  async signOut(): Promise<void> {
    // Clear the mark first so an interruption fails disconnected, not connected.
    await clearGoogleConnectedMark();
    await clearGoogleTokens();
    await nativeModule().signOut();
  }

  async getAccountLabel(): Promise<string> {
    return fetchGoogleAccountLabel(await this.getFreshAccessToken());
  }
}
