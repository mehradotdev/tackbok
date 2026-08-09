import { requireNativeModule } from 'expo-modules-core';

import { fetchGoogleAccountLabel } from './accountLabel';
import {
  clearGoogleAccessToken,
  clearGoogleTokens,
  readGoogleTokens,
  writeGoogleTokens,
} from './secureTokenStore';
import { CloudAuthError, type CloudAuthorization, type GoogleTokenSet } from './types';

interface NativeGoogleAuthorization {
  authorize(interactive: boolean): Promise<GoogleTokenSet>;
  signOut(): Promise<void>;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

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
  return new CloudAuthError('refresh-failed', 'Google authorization failed');
}

export class AndroidGoogleAuthorization implements CloudAuthorization {
  async authorize(): Promise<GoogleTokenSet> {
    try {
      const tokens = await nativeModule().authorize(true);
      await writeGoogleTokens(tokens);
      return tokens;
    } catch (error) {
      throw normalizeNativeError(error);
    }
  }

  async getFreshAccessToken(): Promise<string> {
    const cached = await readGoogleTokens();
    if (cached?.accessToken && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
      return cached.accessToken;
    }
    try {
      const tokens = await nativeModule().authorize(false);
      await writeGoogleTokens(tokens);
      return tokens.accessToken;
    } catch (error) {
      throw normalizeNativeError(error);
    }
  }

  clearInvalidAccessToken(): Promise<void> {
    return clearGoogleAccessToken();
  }

  async signOut(): Promise<void> {
    await clearGoogleTokens();
    await nativeModule().signOut();
  }

  async getAccountLabel(): Promise<string> {
    return fetchGoogleAccountLabel(await this.getFreshAccessToken());
  }
}
