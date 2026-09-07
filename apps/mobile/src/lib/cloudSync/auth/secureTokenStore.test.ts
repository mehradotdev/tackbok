import {
  withGoogleCredentialRollback,
  clearGoogleConnectedMark,
  markGoogleConnected,
  clearGoogleAccessToken,
  clearGoogleTokens,
  readGoogleAccountEmail,
  readOrCreateGoogleConnectionId,
  readGoogleTokens,
  rotateGoogleConnectionId,
  writeGoogleTokens,
} from './secureTokenStore';

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const ACCOUNT_EMAIL_KEY = 'tackbok.cloud-sync.google.account-email.v1';
const CONNECTION_ID_KEY = 'tackbok.cloud-sync.google.connection-id.v1';
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

  it('keeps an opaque connection epoch in SecureStore and rotates it on reconnect', async () => {
    const first = await readOrCreateGoogleConnectionId();
    expect(mockStore.get(CONNECTION_ID_KEY)).toBe(first);
    expect(JSON.stringify(await readGoogleTokens())).not.toContain(first);

    const second = await rotateGoogleConnectionId();
    expect(second).not.toBe(first);
    expect(await readOrCreateGoogleConnectionId()).toBe(second);

    await clearGoogleTokens();
    expect(mockStore.has(CONNECTION_ID_KEY)).toBe(false);
  });
});

const signOut = async () => { await clearGoogleConnectedMark(); await clearGoogleTokens(); };

test.each([true, false])('failed reconnect restores all credentials (Android mark: %s)', async connected => {
  await writeGoogleTokens({ accessToken: 'old', refreshToken: 'refresh', expiresAt: 100, accountEmail: 'old@example.com' });
  await rotateGoogleConnectionId();
  if (connected) await markGoogleConnected();
  const previous = new Map(mockStore);
  const failure = new Error('validation failed');
  await expect(withGoogleCredentialRollback(async () => {
    await writeGoogleTokens({ accessToken: 'new', expiresAt: 200, accountEmail: 'new@example.com' });
    await rotateGoogleConnectionId();
    await markGoogleConnected();
    throw failure;
  }, signOut)).rejects.toBe(failure);
  expect(mockStore).toEqual(previous);
});

test('failed first authorization restores absent keys instead of keeping new credentials', async () => {
  const failure = new Error('partial token write');
  await expect(withGoogleCredentialRollback(async () => {
    await rotateGoogleConnectionId();
    await writeGoogleTokens({ accessToken: 'new', expiresAt: 200 });
    throw failure;
  }, signOut)).rejects.toBe(failure);
  expect(mockStore.size).toBe(0);
});

test('successful reconnect retains the new credentials without cleanup', async () => {
  const cleanup = jest.fn();
  await withGoogleCredentialRollback(async () => {
    await writeGoogleTokens({ accessToken: 'new', expiresAt: 200 });
  }, cleanup);
  expect((await readGoogleTokens())?.accessToken).toBe('new');
  expect(cleanup).not.toHaveBeenCalled();
});
