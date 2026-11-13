import {
  captureGoogleCredentials,
  clearGoogleConnectedMark,
  markGoogleConnected,
  migrateGoogleKeychainAccessibility,
  clearGoogleAccessToken,
  clearGoogleTokens,
  readGoogleAccountEmail,
  readOrCreateGoogleConnectionId,
  readGoogleTokens,
  restoreGoogleCredentials,
  rotateGoogleConnectionId,
  writeGoogleTokens,
} from './secureTokenStore';

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const ACCOUNT_EMAIL_KEY = 'tackbok.cloud-sync.google.account-email.v1';
const CONNECTION_ID_KEY = 'tackbok.cloud-sync.google.connection-id.v1';
const TOKEN_KEY_ACCESS = 'after-first-unlock-this-device-only';
const mockStore = new Map<string, string>();
// Keychain accessibility per item, and a locked phone, like iOS.
const mockAccess = new Map<string, string | undefined>();
let mockLocked = false;
let mockFailingWrite: string | null = null;
let mockReadGate: { key: string; gate: Promise<void> } | null = null;
const mockPlatform = { OS: 'ios' };

jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: async (key: string) => {
    if (mockReadGate?.key === key) {
      const { gate } = mockReadGate;
      mockReadGate = null;
      const value = mockStore.get(key);
      await gate;
      return value ?? null;
    }
    if (!mockStore.has(key)) return null;
    if (mockLocked && mockAccess.get(key) !== 'after-first-unlock-this-device-only') {
      throw new Error('errSecInteractionNotAllowed');
    }
    return mockStore.get(key);
  },
  setItemAsync: async (
    key: string,
    value: string,
    options?: { keychainAccessible?: string },
  ) => {
    // A failed keychain update leaves the item as it was.
    if (key === mockFailingWrite) throw new Error('keychain write failed');
    mockStore.set(key, value);
    mockAccess.set(key, options?.keychainAccessible);
  },
  deleteItemAsync: async (key: string) => {
    mockStore.delete(key);
    mockAccess.delete(key);
  },
}));

beforeEach(() => {
  mockStore.clear();
  mockAccess.clear();
  mockLocked = false;
  mockFailingWrite = null;
  mockReadGate = null;
  mockPlatform.OS = 'ios';
});

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
    mockStore.set(
      TOKEN_KEY,
      JSON.stringify({
        accessToken: 'legacy-token',
        expiresAt: 123,
        accountEmail: 'legacy@example.com',
      }),
    );

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

const signOut = async () => {
  await clearGoogleConnectedMark();
  await clearGoogleTokens();
};

test.each([true, false])(
  'a failed reconnect restores all captured credentials (Android mark: %s)',
  async (connected) => {
    await writeGoogleTokens({
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: 100,
      accountEmail: 'old@example.com',
    });
    await rotateGoogleConnectionId();
    if (connected) await markGoogleConnected();
    const previous = new Map(mockStore);
    const captured = await captureGoogleCredentials();
    await writeGoogleTokens({
      accessToken: 'new',
      expiresAt: 200,
      accountEmail: 'new@example.com',
    });
    await rotateGoogleConnectionId();
    await markGoogleConnected();
    await restoreGoogleCredentials(captured, signOut);
    expect(mockStore).toEqual(previous);
  },
);

test('a failed first authorization restores absent keys instead of keeping new credentials', async () => {
  const captured = await captureGoogleCredentials();
  await rotateGoogleConnectionId();
  await writeGoogleTokens({ accessToken: 'new', expiresAt: 200 });
  await restoreGoogleCredentials(captured, signOut);
  expect(mockStore.size).toBe(0);
});

describe('keychain accessibility migration', () => {
  const MIGRATED_KEY = 'tackbok.cloud-sync.keychain-after-first-unlock.v1';
  const GUARD_KEY = 'tackbok.cloud-sync.google.setup-guard.v1';
  const CONNECTED_KEY = 'tackbok.cloud-sync.google.connected.v1';

  /** Items as an install before this change wrote them. */
  function seedWhenUnlocked() {
    const items: [string, string][] = [
      [TOKEN_KEY, JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: 1 })],
      [ACCOUNT_EMAIL_KEY, 'owner@example.com'],
      [CONNECTION_ID_KEY, 'connection'],
      [GUARD_KEY, '{"credentials":{"values":[null,null,null,null]},"vaults":[]}'],
    ];
    for (const [key, value] of items) {
      mockStore.set(key, value);
      mockAccess.set(key, 'when-unlocked-this-device-only');
    }
    return new Map(mockStore);
  }

  it('new writes are readable after the first unlock', async () => {
    await writeGoogleTokens({ accessToken: 'token', expiresAt: 1 });
    await markGoogleConnected();
    mockLocked = true;
    await expect(readGoogleTokens()).resolves.toEqual({
      accessToken: 'token',
      expiresAt: 1,
    });
  });

  it('rewrites every stored item with the same value and new accessibility', async () => {
    const before = seedWhenUnlocked();
    await migrateGoogleKeychainAccessibility();
    for (const [key, value] of before) {
      expect(mockStore.get(key)).toBe(value);
      expect(mockAccess.get(key)).toBe(TOKEN_KEY_ACCESS);
    }
    // Absent items stay absent.
    expect(mockStore.has(CONNECTED_KEY)).toBe(false);
    expect(mockStore.get(MIGRATED_KEY)).toBe('1');
    mockLocked = true;
    await expect(readGoogleTokens()).resolves.not.toBeNull();
  });

  it('a locked keychain writes and clears nothing, and a later run migrates', async () => {
    const before = seedWhenUnlocked();
    mockLocked = true;
    await expect(migrateGoogleKeychainAccessibility()).rejects.toThrow();
    expect(mockStore).toEqual(before);
    expect(mockAccess.get(TOKEN_KEY)).toBe('when-unlocked-this-device-only');
    // Reads that fail while locked do not clear or rotate anything either.
    await expect(readGoogleTokens()).rejects.toThrow();
    await expect(readOrCreateGoogleConnectionId()).rejects.toThrow();
    expect(mockStore).toEqual(before);

    mockLocked = false;
    await migrateGoogleKeychainAccessibility();
    expect(mockAccess.get(TOKEN_KEY)).toBe(TOKEN_KEY_ACCESS);
  });

  it('a failed rewrite keeps the old item, leaves the marker unset and retries later', async () => {
    const before = seedWhenUnlocked();
    mockFailingWrite = CONNECTION_ID_KEY;
    await expect(migrateGoogleKeychainAccessibility()).rejects.toThrow();
    expect(mockStore).toEqual(before);
    expect(mockAccess.get(CONNECTION_ID_KEY)).toBe('when-unlocked-this-device-only');
    expect(mockStore.has(MIGRATED_KEY)).toBe(false);

    mockFailingWrite = null;
    await migrateGoogleKeychainAccessibility();
    expect(mockAccess.get(CONNECTION_ID_KEY)).toBe(TOKEN_KEY_ACCESS);
    expect(mockStore.get(CONNECTION_ID_KEY)).toBe('connection');
  });

  it('runs once: a completed migration does not rewrite items again', async () => {
    seedWhenUnlocked();
    await migrateGoogleKeychainAccessibility();
    const after = new Map(mockStore);
    mockFailingWrite = TOKEN_KEY;
    await migrateGoogleKeychainAccessibility();
    expect(mockStore).toEqual(after);
  });

  it('an interrupted run is safe to repeat', async () => {
    const before = seedWhenUnlocked();
    // Interrupted after the token was rewritten, before the marker.
    mockFailingWrite = MIGRATED_KEY;
    await expect(migrateGoogleKeychainAccessibility()).rejects.toThrow();
    mockFailingWrite = null;
    await migrateGoogleKeychainAccessibility();
    for (const [key, value] of before) expect(mockStore.get(key)).toBe(value);
    expect(mockStore.get(MIGRATED_KEY)).toBe('1');
  });

  it('a token refresh during the migration is not overwritten with the old token', async () => {
    seedWhenUnlocked();
    let release!: () => void;
    mockReadGate = {
      key: TOKEN_KEY,
      gate: new Promise((resolve) => (release = resolve)),
    };
    const migrating = migrateGoogleKeychainAccessibility();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The account label refreshes outside the connection barrier.
    const refreshed = writeGoogleTokens({
      accessToken: 'fresh',
      refreshToken: 'rotated',
      expiresAt: 2,
    });
    release();
    await Promise.all([migrating, refreshed]);
    expect(JSON.parse(mockStore.get(TOKEN_KEY)!)).toEqual({
      accessToken: 'fresh',
      refreshToken: 'rotated',
      expiresAt: 2,
    });
    expect(mockAccess.get(TOKEN_KEY)).toBe(TOKEN_KEY_ACCESS);
  });

  it('does nothing on Android', async () => {
    mockPlatform.OS = 'android';
    const before = seedWhenUnlocked();
    await migrateGoogleKeychainAccessibility();
    expect(mockStore).toEqual(before);
    expect(mockAccess.get(TOKEN_KEY)).toBe('when-unlocked-this-device-only');
  });
});
