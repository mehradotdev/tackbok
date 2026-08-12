import {
  clearGoogleAccessToken,
  clearGoogleTokens,
  readGoogleAccountEmail,
  readGoogleTokens,
  writeGoogleTokens,
} from './secureTokenStore';

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const ACCOUNT_EMAIL_KEY = 'tackbok.cloud-sync.google.account-email.v1';
const mockStore = new Map<string, string>();

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

beforeEach(() => mockStore.clear());

describe('Google account email SecureStore isolation', () => {
  it('stores the email separately from the credential record', async () => {
    await writeGoogleTokens({
      accessToken: 'token',
      expiresAt: 123,
      accountEmail: ' owner@example.com ',
    });

    expect(JSON.parse(mockStore.get(TOKEN_KEY)!)).toEqual({
      accessToken: 'token',
      expiresAt: 123,
    });
    expect(mockStore.get(ACCOUNT_EMAIL_KEY)).toBe('owner@example.com');
  });

  it('lazily migrates an email embedded in a legacy token record', async () => {
    mockStore.set(TOKEN_KEY, JSON.stringify({
      accessToken: 'legacy-token',
      expiresAt: 123,
      accountEmail: 'legacy@example.com',
    }));

    await expect(readGoogleAccountEmail()).resolves.toBe('legacy@example.com');
    expect(mockStore.get(ACCOUNT_EMAIL_KEY)).toBe('legacy@example.com');
  });

  it('keeps the Android account pin when only a rejected access token is cleared', async () => {
    await writeGoogleTokens({
      accessToken: 'rejected-token',
      expiresAt: 0,
      accountEmail: 'owner@example.com',
    });

    await clearGoogleAccessToken();

    await expect(readGoogleTokens()).resolves.toBeNull();
    await expect(readGoogleAccountEmail()).resolves.toBe('owner@example.com');
  });

  it('deletes credentials and the email together on full local sign-out', async () => {
    await writeGoogleTokens({
      accessToken: 'token',
      expiresAt: 123,
      accountEmail: 'owner@example.com',
    });

    await clearGoogleTokens();

    await expect(readGoogleTokens()).resolves.toBeNull();
    await expect(readGoogleAccountEmail()).resolves.toBeNull();
  });
});
