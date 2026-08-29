import { IosGoogleAuthorization } from './ios';
import {
  readGoogleAccountEmail,
  readGoogleTokens,
  writeGoogleTokens,
} from './secureTokenStore';

const mockFetchGoogleAccountLabel = jest.fn();
const mockDismissAuthSession = jest.fn();
const mockPromptAsync = jest.fn();
const mockExchangeCodeAsync = jest.fn();
const mockRefreshAsync = jest.fn();
const mockStore = new Map<string, string>();

jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn().mockImplementation(() => ({
    codeVerifier: 'verifier',
    promptAsync: (...args: unknown[]) => mockPromptAsync(...args),
  })),
  exchangeCodeAsync: (...args: unknown[]) => mockExchangeCodeAsync(...args),
  refreshAsync: (...args: unknown[]) => mockRefreshAsync(...args),
  ResponseType: { Code: 'code' },
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  dismissAuthSession: (...args: unknown[]) => mockDismissAuthSession(...args),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockStore.delete(key);
  },
}));

jest.mock('./accountLabel', () => ({
  fetchGoogleAccountLabel: (...args: unknown[]) => mockFetchGoogleAccountLabel(...args),
}));

jest.mock('./config', () => ({
  getGoogleOAuthConfig: jest.fn(() => ({
    iosClientId: 'ios-client',
    iosRedirectScheme: 'com.googleusercontent.apps.test',
  })),
}));

beforeEach(() => {
  mockStore.clear();
  mockFetchGoogleAccountLabel.mockReset();
  mockDismissAuthSession.mockReset();
  mockPromptAsync.mockReset();
  mockExchangeCodeAsync.mockReset();
  mockRefreshAsync.mockReset();
  mockDismissAuthSession.mockResolvedValue(undefined);
});

describe('IosGoogleAuthorization account label persistence', () => {
  it('fetches the email once, then reuses it from SecureStore across instances', async () => {
    await writeGoogleTokens({
      accessToken: 'fresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    mockFetchGoogleAccountLabel.mockResolvedValue('owner@example.com');

    await expect(new IosGoogleAuthorization().getAccountLabel())
      .resolves.toBe('owner@example.com');
    await expect(new IosGoogleAuthorization().getAccountLabel())
      .resolves.toBe('owner@example.com');

    expect(mockFetchGoogleAccountLabel).toHaveBeenCalledTimes(1);
    expect(mockFetchGoogleAccountLabel).toHaveBeenCalledWith('fresh-token');
    await expect(readGoogleAccountEmail()).resolves.toBe('owner@example.com');
  });

  it('does not persist the cosmetic fallback as an account email', async () => {
    await writeGoogleTokens({
      accessToken: 'fresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    mockFetchGoogleAccountLabel.mockResolvedValue('Google Drive');

    await expect(new IosGoogleAuthorization().getAccountLabel()).resolves.toBe('Google Drive');
    await expect(readGoogleAccountEmail()).resolves.toBeNull();
  });

  it('deletes both credentials and the persisted email on Disconnect', async () => {
    await writeGoogleTokens({
      accessToken: 'fresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      accountEmail: 'owner@example.com',
    });

    await new IosGoogleAuthorization().signOut();

    await expect(readGoogleTokens()).resolves.toBeNull();
    await expect(readGoogleAccountEmail()).resolves.toBeNull();
  });

  it('drops the prior label when a new interactive grant selects another account', async () => {
    await writeGoogleTokens({
      accessToken: 'old-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      accountEmail: 'old@example.com',
    });
    mockPromptAsync.mockResolvedValue({ type: 'success', params: { code: 'new-code' } });
    mockExchangeCodeAsync.mockResolvedValue({
      accessToken: 'new-token',
      expiresIn: 3600,
      issuedAt: Date.now() / 1000,
      refreshToken: 'new-refresh-token',
    });
    mockFetchGoogleAccountLabel.mockResolvedValue('new@example.com');
    const auth = new IosGoogleAuthorization();

    await auth.authorize();
    await expect(readGoogleAccountEmail()).resolves.toBeNull();
    await expect(auth.getAccountLabel()).resolves.toBe('new@example.com');
    await expect(readGoogleAccountEmail()).resolves.toBe('new@example.com');
  });

  it('rejects a granular consent result that omitted Drive access', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'success', params: { code: 'partial-code' } });
    mockExchangeCodeAsync.mockResolvedValue({
      accessToken: 'identity-only-token',
      expiresIn: 3600,
      issuedAt: Date.now() / 1000,
      scope: 'openid email',
    });

    await expect(new IosGoogleAuthorization().authorize()).rejects.toMatchObject({
      code: 'permission-required',
    });
    await expect(readGoogleTokens()).resolves.toBeNull();
  });

  it('classifies a temporary refresh failure as retryable and preserves credentials', async () => {
    await writeGoogleTokens({
      accessToken: 'expired-token',
      expiresAt: 0,
      refreshToken: 'durable-refresh-token',
    });
    mockRefreshAsync.mockRejectedValue(new TypeError('Network request failed'));

    await expect(new IosGoogleAuthorization().getFreshAccessToken()).rejects.toMatchObject({
      code: 'temporarily-unavailable',
    });
    await expect(readGoogleTokens()).resolves.toMatchObject({
      refreshToken: 'durable-refresh-token',
    });
  });
});
