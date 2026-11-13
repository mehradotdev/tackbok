import { withExternalAuthentication } from '~/lib/externalAuthentication';
import { requireNativeModule } from 'expo-modules-core';

import { fetchGoogleAccountLabel } from './accountLabel';
import {
  clearGoogleAccessToken,
  clearGoogleConnectedMark,
  clearGoogleTokens,
  isGoogleMarkedConnected,
  markGoogleConnected,
  readGoogleAccountEmail,
  readGoogleTokens,
  rotateGoogleConnectionId,
  writeGoogleAccountEmail,
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

/**
 * Play services statuses that silent authorization cannot get past, so only a
 * reconnect helps. Numbers are CommonStatusCodes (and the matching
 * ConnectionResult codes) from play-services-basement 18.9.0:
 * 4 SIGN_IN_REQUIRED, 5 INVALID_ACCOUNT (the pinned account left the device),
 * 6 RESOLUTION_REQUIRED (needs UI a background renewal cannot show).
 * Everything else, including network errors, timeouts, Play services missing,
 * disabled or updating, internal errors and unknown codes, is transient:
 * a later retry can succeed, and a reconnect would not fix it.
 */
const TERMINAL_PLAY_SERVICES_STATUSES = new Set([4, 5, 6]);

/**
 * Current builds put the ApiException status in the code. Older builds sent
 * every failure as E_GOOGLE_AUTH_FAILED, but ApiException's message is
 * "<status>: <status message>", so an OTA update can still classify them.
 */
function playServicesStatus(code: string, message: string): number | null {
  const match =
    /E_GOOGLE_AUTH_API_(-?\d+)/.exec(code) ??
    (code.includes('E_GOOGLE_AUTH_FAILED') ? /^(-?\d+): /.exec(message) : null);
  return match ? Number(match[1]) : null;
}

function normalizeNativeError(error: unknown): CloudAuthError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  if (code.includes('CANCELLED'))
    return new CloudAuthError('cancelled', 'Google sign-in was cancelled');
  // A revoked grant surfaces here: Play services answers with a consent
  // resolution, which the native module refuses to show during a silent call.
  if (code.includes('CONSENT_REQUIRED')) {
    return new CloudAuthError('consent-required', 'Google consent is required');
  }
  if (code.includes('PERMISSION_REQUIRED')) {
    return new CloudAuthError('permission-required', 'Google Drive access is required');
  }
  // Keep the native module's message: replacing it with a generic one turns
  // every distinct failure into the same undiagnosable string.
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const status = playServicesStatus(code, message);
  if (status !== null && TERMINAL_PLAY_SERVICES_STATUSES.has(status)) {
    return new CloudAuthError('refresh-failed', message || 'Google authorization failed');
  }
  // Unrecognised failures retry later instead of asking for a reconnect.
  // Nothing stored is touched, so the next pass starts from the same state.
  return new CloudAuthError(
    'temporarily-unavailable',
    message || 'Google authorization is temporarily unavailable',
  );
}

export class AndroidGoogleAuthorization implements CloudAuthorization {
  async authorize(): Promise<GoogleTokenSet> {
    return withExternalAuthentication(async () => {
      try {
        const tokens = await nativeModule().authorize(true, null);
        await rotateGoogleConnectionId();
        await writeGoogleTokens(tokens);
        await markGoogleConnected();
        return tokens;
      } catch (error) {
        throw normalizeNativeError(error);
      }
    });
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
    const accountEmail = await readGoogleAccountEmail();
    try {
      const tokens = await nativeModule().authorize(false, accountEmail);
      await writeGoogleTokens({
        ...tokens,
        accountEmail: tokens.accountEmail ?? accountEmail ?? undefined,
      });
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
    const accessToken = await this.getFreshAccessToken();
    const storedEmail = await readGoogleAccountEmail();
    if (storedEmail) return storedEmail;
    const label = await fetchGoogleAccountLabel(accessToken);
    if (label !== 'Google Drive') await writeGoogleAccountEmail(label);
    return label;
  }
}
