export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'openid',
  'email',
] as const;

export interface GoogleTokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  /**
   * Android only: the account the owner picked in the device account chooser.
   * Silent renewals pass it back to Play services so a background token request
   * can never drift to a different signed-in account that also holds a grant.
   * Lives exclusively in SecureStore next to the tokens and is deleted with
   * them on Disconnect — never SQLite, logs, diagnostics, or evidence. The
   * user-visible label stays the masked, in-memory one.
   */
  accountEmail?: string;
}

export interface CloudAuthorization {
  authorize(): Promise<GoogleTokenSet>;
  getFreshAccessToken(): Promise<string>;
  clearInvalidAccessToken(): Promise<void>;
  signOut(): Promise<void>;
  getAccountLabel(): Promise<string>;
}

export class CloudAuthError extends Error {
  constructor(
    readonly code: 'cancelled' | 'consent-required' | 'not-connected' | 'refresh-failed',
    message: string,
  ) {
    super(message);
    this.name = 'CloudAuthError';
  }
}
