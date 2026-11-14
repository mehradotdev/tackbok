import { withExternalAuthentication } from '~/lib/externalAuthentication';
import { requireNativeModule } from 'expo-modules-core';

import { cloudConnectionLifecycle } from '../runtime/connectionLifecycle';
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

/**
 * How long a silently minted token is reused in memory. AuthorizationResult
 * carries no expiry (finding 0001) and Play services may hand back a cached
 * token that is already partly used, so this stays well inside Google's
 * one-hour lifetime. A token that dies sooner gets a 401, which invalidates it
 * and retries once with a fresh mint.
 */
const TOKEN_REUSE_MS = 15 * 60 * 1000;

interface MintScope {
  accountEmail: string | null;
  connection: number;
  lifecycleEpoch: number;
}

interface MemoryToken {
  accessToken: string;
  scope: MintScope;
  reuseUntil: number;
}

// Shared by every instance: Disconnect and Reconnect often run on a different
// instance from the one the Drive transport holds.
let memoryToken: MemoryToken | null = null;
let inFlightMint: { scope: MintScope; promise: Promise<string> } | null = null;
// Bumped by Disconnect and interactive authorization. A mint that started under
// an older value belongs to a connection that no longer exists.
let connection = 0;

function forgetToken(): void {
  memoryToken = null;
  inFlightMint = null;
}

function forgetConnection(): void {
  connection += 1;
  forgetToken();
}

/** The current connection; false once Disconnect, Reconnect or a connection change ran. */
function isCurrent(scope: MintScope): boolean {
  return (
    scope.connection === connection &&
    scope.lifecycleEpoch === cloudConnectionLifecycle.epoch
  );
}

export class AndroidGoogleAuthorization implements CloudAuthorization {
  async authorize(): Promise<GoogleTokenSet> {
    return withExternalAuthentication(async () => {
      // Drop the old account's token before the chooser opens.
      forgetConnection();
      try {
        const tokens = await nativeModule().authorize(true, null);
        forgetConnection();
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
      forgetConnection();
      throw new CloudAuthError('not-connected', 'Google Drive is not connected');
    }
    // No stored expiry is trusted here: AuthorizationResult carries no real
    // expiry (finding 0001), so Play services is the cache of record. Only a
    // token this process minted is reused, for a bounded time, and only while
    // the pinned account and the connection are unchanged.
    const accountEmail = await readGoogleAccountEmail();
    const reusable = memoryToken;
    if (
      reusable &&
      reusable.scope.accountEmail === accountEmail &&
      isCurrent(reusable.scope) &&
      reusable.reuseUntil > Date.now()
    ) {
      return reusable.accessToken;
    }
    const pending = inFlightMint;
    if (
      pending &&
      pending.scope.accountEmail === accountEmail &&
      isCurrent(pending.scope)
    ) {
      return pending.promise;
    }
    const scope: MintScope = {
      accountEmail,
      connection,
      lifecycleEpoch: cloudConnectionLifecycle.epoch,
    };
    const promise = this.mint(scope).finally(() => {
      if (inFlightMint?.scope === scope) inFlightMint = null;
    });
    inFlightMint = { scope, promise };
    return promise;
  }

  private async mint(scope: MintScope): Promise<string> {
    // Measured from the request, never from when the answer arrived.
    const requestedAt = Date.now();
    let tokens: GoogleTokenSet;
    try {
      tokens = await nativeModule().authorize(false, scope.accountEmail);
    } catch (error) {
      throw normalizeNativeError(error);
    }
    // If Disconnect, Reconnect or an account switch ran during the mint, the
    // token may belong to an account this device no longer uses, so it is
    // neither stored nor handed out; a retry starts from the new state. The
    // write checks inside the credential queue, so a Disconnect queued first
    // wins over it.
    try {
      await writeGoogleTokens(
        {
          ...tokens,
          accountEmail: tokens.accountEmail ?? scope.accountEmail ?? undefined,
        },
        () => isCurrent(scope),
      );
    } catch (error) {
      throw normalizeNativeError(error);
    }
    if (!isCurrent(scope)) {
      throw new CloudAuthError(
        'temporarily-unavailable',
        'Google Drive connection changed during authorization',
      );
    }
    // A 401 recovery that ran during the mint dropped this mint: its token
    // may be the one just rejected, so only its own callers use it.
    if (inFlightMint?.scope === scope) {
      memoryToken = {
        accessToken: tokens.accessToken,
        scope,
        reuseUntil: requestedAt + TOKEN_REUSE_MS,
      };
    }
    return tokens.accessToken;
  }

  async clearInvalidAccessToken(): Promise<void> {
    const rejected = memoryToken?.accessToken;
    forgetToken();
    const cached = await readGoogleTokens();
    for (const accessToken of new Set([rejected, cached?.accessToken])) {
      if (!accessToken) continue;
      try {
        // Clearing only the stored copy re-reads the same dead token from the
        // Play services cache (finding 0001). Best effort: the store clear
        // below stays authoritative even if this fails.
        await nativeModule().invalidateAccessToken(accessToken);
      } catch {
        // Ignored — a failed cache invalidation must not block recovery.
      }
    }
    await clearGoogleAccessToken();
  }

  async signOut(): Promise<void> {
    forgetConnection();
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
