import {
  AuthRequest,
  exchangeCodeAsync,
  refreshAsync,
  ResponseType,
  type TokenResponse,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { fetchGoogleAccountLabel } from './accountLabel';
import { getGoogleOAuthConfig } from './config';
import { isTerminalGoogleRefreshError } from './policy';
import {
  clearGoogleAccessToken,
  clearGoogleAccountEmail,
  clearGoogleTokens,
  readGoogleAccountEmail,
  readGoogleTokens,
  rotateGoogleConnectionId,
  writeGoogleAccountEmail,
  writeGoogleTokens,
} from './secureTokenStore';
import {
  CloudAuthError,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_SCOPES,
  type CloudAuthorization,
  type GoogleTokenSet,
} from './types';

WebBrowser.maybeCompleteAuthSession();

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function redirectUri(scheme: string): string {
  return `${scheme}:/oauthredirect`;
}

function toStoredTokens(response: TokenResponse, priorRefreshToken?: string): GoogleTokenSet {
  const expiresIn = response.expiresIn ?? 3600;
  return {
    accessToken: response.accessToken,
    expiresAt: (response.issuedAt ?? Date.now() / 1000) * 1000 + expiresIn * 1000,
    refreshToken: response.refreshToken ?? priorRefreshToken,
  };
}

export class IosGoogleAuthorization implements CloudAuthorization {
  async authorize(): Promise<GoogleTokenSet> {
    const config = getGoogleOAuthConfig();
    const request = new AuthRequest({
      clientId: config.iosClientId,
      redirectUri: redirectUri(config.iosRedirectScheme),
      responseType: ResponseType.Code,
      scopes: [...GOOGLE_SCOPES],
      usePKCE: true,
      extraParams: { access_type: 'offline', prompt: 'consent' },
    });
    const result = await request.promptAsync(DISCOVERY);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new CloudAuthError('cancelled', 'Google sign-in was cancelled');
    }
    if (result.type !== 'success' || typeof result.params.code !== 'string') {
      throw new CloudAuthError('consent-required', 'Google consent was not completed');
    }
    const response = await exchangeCodeAsync(
      {
        clientId: config.iosClientId,
        code: result.params.code,
        redirectUri: redirectUri(config.iosRedirectScheme),
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      DISCOVERY,
    );
    if (response.scope && !response.scope.split(/\s+/).includes(GOOGLE_DRIVE_SCOPE)) {
      throw new CloudAuthError('permission-required', 'Google Drive access is required');
    }
    const tokens = toStoredTokens(response);
    // A new interactive grant may select a different Google account. Do not
    // let the prior account's cached label survive into the new connection.
    await clearGoogleAccountEmail();
    await rotateGoogleConnectionId();
    await writeGoogleTokens(tokens);
    return tokens;
  }

  async getFreshAccessToken(): Promise<string> {
    const current = await readGoogleTokens();
    if (!current) throw new CloudAuthError('not-connected', 'Google Drive is not connected');
    if (current.accessToken && current.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
      return current.accessToken;
    }
    if (!current.refreshToken) {
      throw new CloudAuthError('consent-required', 'Google Drive must be reconnected');
    }
    const config = getGoogleOAuthConfig();
    try {
      const response = await refreshAsync(
        { clientId: config.iosClientId, refreshToken: current.refreshToken },
        DISCOVERY,
      );
      const tokens = toStoredTokens(response, current.refreshToken);
      await writeGoogleTokens(tokens);
      return tokens.accessToken;
    } catch (error) {
      if (isTerminalGoogleRefreshError(error)) {
        await clearGoogleTokens();
        throw new CloudAuthError(
          'refresh-failed',
          'Google authorization expired; reconnect required',
        );
      }
      // Network/server failures keep the refresh token so an offline interval
      // never forces the owner through interactive consent again.
      throw new CloudAuthError(
        'temporarily-unavailable',
        'Google authorization could not be refreshed; retry when online',
      );
    }
  }

  clearInvalidAccessToken(): Promise<void> {
    return clearGoogleAccessToken();
  }

  async signOut(): Promise<void> {
    await clearGoogleTokens();
    try {
      await WebBrowser.dismissAuthSession();
    } catch {
      // Local token cleanup is authoritative even when no browser session exists.
    }
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
