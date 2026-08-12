export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const GOOGLE_SCOPES = [
  GOOGLE_DRIVE_SCOPE,
  'openid',
  'email',
] as const;

export interface GoogleTokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  /**
   * The selected Google account. The auth layer moves this into its own
   * SecureStore item: Android uses it to pin silent Play-services renewals and
   * both platforms reuse it as the connected-account label. It is deleted with
   * the credentials on Disconnect and never enters SQLite, the vault, logs,
   * diagnostics, evidence, or analytics.
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
    readonly code:
      | 'cancelled'
      | 'consent-required'
      | 'permission-required'
      | 'not-connected'
      | 'refresh-failed',
    message: string,
  ) {
    super(message);
    this.name = 'CloudAuthError';
  }
}
