export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'openid',
  'email',
] as const;

export interface GoogleTokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
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
