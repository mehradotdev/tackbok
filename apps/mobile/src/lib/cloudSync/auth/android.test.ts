import { providerErrorCodeForAuthError } from '../failureClassification';
import { cloudConnectionLifecycle } from '../runtime/connectionLifecycle';
import { AndroidGoogleAuthorization } from './android';
import { CloudAuthError, type GoogleTokenSet } from './types';

const mockNativeAuthorize = jest.fn();
const mockNativeInvalidate = jest.fn();
const mockNativeSignOut = jest.fn();

jest.mock('expo-modules-core', () => ({
  requireNativeModule: () => ({
    authorize: (...args: unknown[]) => mockNativeAuthorize(...args),
    invalidateAccessToken: (...args: unknown[]) => mockNativeInvalidate(...args),
    signOut: (...args: unknown[]) => mockNativeSignOut(...args),
  }),
}));

const mockStore = new Map<string, string>();
const mockStoreWrites: string[] = [];
// Holds the next read of one key until `until` settles.
let mockBlockedRead: { key: string; until: Promise<void> } | null = null;
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: async (key: string) => {
    const blocked = mockBlockedRead;
    if (blocked?.key === key) {
      mockBlockedRead = null;
      await blocked.until;
    }
    return mockStore.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    mockStoreWrites.push(key);
    mockStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockStore.delete(key);
  },
}));

jest.mock('./accountLabel', () => ({
  fetchGoogleAccountLabel: jest.fn(async () => 'probe@gmail.com'),
}));

async function connect(
  auth: AndroidGoogleAuthorization,
  accountEmail = 'probe@gmail.com',
) {
  mockNativeAuthorize.mockResolvedValueOnce({
    accessToken: 'token-1',
    expiresAt: 0,
    accountEmail,
  });
  await auth.authorize();
}

const TOKEN_KEY = 'tackbok.cloud-sync.google.tokens.v1';
const ACCOUNT_EMAIL_KEY = 'tackbok.cloud-sync.google.account-email.v1';
const tokenWrites = () => mockStoreWrites.filter((key) => key === TOKEN_KEY).length;
const silentMints = () =>
  mockNativeAuthorize.mock.calls.filter(([interactive]) => interactive === false).length;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  mockNativeSignOut.mockResolvedValue(undefined);
  // The in-memory token is shared by every instance; Disconnect drops it.
  await new AndroidGoogleAuthorization().signOut();
  mockStore.clear();
  mockStoreWrites.length = 0;
  mockBlockedRead = null;
  mockNativeAuthorize.mockReset();
  mockNativeInvalidate.mockReset();
  mockNativeSignOut.mockReset();
  mockNativeSignOut.mockResolvedValue(undefined);
  mockNativeInvalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AndroidGoogleAuthorization connection state', () => {
  it('refuses to mint silently on a device that never connected', async () => {
    const auth = new AndroidGoogleAuthorization();
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      name: 'CloudAuthError',
      code: 'not-connected',
    });
    expect(mockNativeAuthorize).not.toHaveBeenCalled();
  });

  it('refuses to mint silently after Disconnect even though the grant survives', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    await auth.signOut();
    // Play services would happily hand out a token here (finding 0002); the
    // durable mark is what stands in the way.
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      code: 'not-connected',
    });
    expect(mockNativeAuthorize).toHaveBeenCalledTimes(1);
    expect(mockNativeSignOut).toHaveBeenCalledTimes(1);
  });

  it('interactive authorization is what restores access after Disconnect', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    await auth.signOut();
    await connect(auth, 'other@gmail.com');
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
  });
});

describe('AndroidGoogleAuthorization account pinning', () => {
  it('interactive calls never pin, so the chooser decides', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    expect(mockNativeAuthorize).toHaveBeenCalledWith(true, null);
  });

  it('silent renewal pins to the account chosen at connect time', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth, 'probe@gmail.com');
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'probe@gmail.com');
  });

  it('keeps the pin across renewals that do not echo the account back', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth, 'probe@gmail.com');
    mockNativeAuthorize.mockResolvedValue({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    await auth.getFreshAccessToken();
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'probe@gmail.com');
  });
});

describe('AndroidGoogleAuthorization token freshness', () => {
  it('never trusts a stored expiry, even one far in the future', async () => {
    const auth = new AndroidGoogleAuthorization();
    mockNativeAuthorize.mockResolvedValueOnce({
      accessToken: 'stale-but-cached',
      // A fabricated far-future expiry is exactly what finding 0001 was about.
      expiresAt: Date.now() + 55 * 60 * 1000,
      accountEmail: 'probe@gmail.com',
    });
    await auth.authorize();
    mockNativeAuthorize.mockResolvedValueOnce({
      accessToken: 'revalidated',
      expiresAt: 0,
    });
    await expect(auth.getFreshAccessToken()).resolves.toBe('revalidated');
    expect(mockNativeAuthorize).toHaveBeenCalledTimes(2);
  });
});

describe('AndroidGoogleAuthorization token reuse', () => {
  async function connected() {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    mockStoreWrites.length = 0;
    return auth;
  }

  it('reuses a minted token across requests without writing again', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockResolvedValue({ accessToken: 'token-2', expiresAt: 0 });
    for (let request = 0; request < 5; request++) {
      await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    }
    expect(silentMints()).toBe(1);
    expect(tokenWrites()).toBe(1);
  });

  it('shares the token across instances', async () => {
    await connected();
    mockNativeAuthorize.mockResolvedValue({ accessToken: 'token-2', expiresAt: 0 });
    await new AndroidGoogleAuthorization().getFreshAccessToken();
    await expect(new AndroidGoogleAuthorization().getFreshAccessToken()).resolves.toBe(
      'token-2',
    );
    expect(silentMints()).toBe(1);
  });

  it('mints again once the reuse window has nearly run out', async () => {
    const auth = await connected();
    const start = 1_800_000_000_000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);
    mockNativeAuthorize
      .mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 })
      .mockResolvedValueOnce({ accessToken: 'token-3', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    now.mockReturnValue(start + 15 * 60 * 1000 - 1);
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    now.mockReturnValue(start + 15 * 60 * 1000);
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-3');
    expect(silentMints()).toBe(2);
    expect(tokenWrites()).toBe(2);
  });

  it('concurrent requests share one mint', async () => {
    const auth = await connected();
    const mint = deferred<GoogleTokenSet>();
    mockNativeAuthorize.mockReturnValueOnce(mint.promise);
    const requests = Promise.all([
      auth.getFreshAccessToken(),
      auth.getFreshAccessToken(),
      new AndroidGoogleAuthorization().getFreshAccessToken(),
    ]);
    // Let every request reach the in-flight mint before it settles.
    await new Promise((resolve) => setTimeout(resolve, 0));
    mint.resolve({ accessToken: 'token-2', expiresAt: 0 });
    await expect(requests).resolves.toEqual(['token-2', 'token-2', 'token-2']);
    expect(silentMints()).toBe(1);
    expect(tokenWrites()).toBe(1);
  });

  it('concurrent requests share one failed mint, and nothing is kept', async () => {
    const auth = await connected();
    const mint = deferred<GoogleTokenSet>();
    mockNativeAuthorize.mockReturnValueOnce(mint.promise);
    const requests = [auth.getFreshAccessToken(), auth.getFreshAccessToken()].map(
      (request) => request.catch((error: unknown) => error),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    mint.reject({ code: 'E_GOOGLE_AUTH_API_7', message: '7: ' });
    for (const failure of await Promise.all(requests)) {
      expect(failure).toMatchObject({ code: 'temporarily-unavailable' });
    }
    expect(silentMints()).toBe(1);
    expect(tokenWrites()).toBe(0);
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    expect(silentMints()).toBe(2);
  });

  it('a 401 drops the reused token and the retry mints a fresh one', async () => {
    const auth = await connected();
    mockNativeAuthorize
      .mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 })
      .mockResolvedValueOnce({ accessToken: 'token-3', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    await auth.clearInvalidAccessToken();
    expect(mockNativeInvalidate).toHaveBeenCalledWith('token-2');
    expect(mockNativeInvalidate).toHaveBeenCalledTimes(1);
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-3');
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-3');
    expect(silentMints()).toBe(2);
  });

  it('a 401 during a mint keeps that mint from being reused', async () => {
    const auth = await connected();
    const mint = deferred<GoogleTokenSet>();
    mockNativeAuthorize
      .mockReturnValueOnce(mint.promise)
      .mockResolvedValueOnce({ accessToken: 'token-3', expiresAt: 0 });
    const first = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await auth.clearInvalidAccessToken();
    mint.resolve({ accessToken: 'token-2', expiresAt: 0 });
    await expect(first).resolves.toBe('token-2');
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-3');
    expect(silentMints()).toBe(2);
  });

  it('Disconnect drops the token at once', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockResolvedValue({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    await new AndroidGoogleAuthorization().signOut();
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      code: 'not-connected',
    });
    expect(silentMints()).toBe(1);
  });

  it('a mint that finishes after Disconnect is neither kept nor stored', async () => {
    const auth = await connected();
    const mint = deferred<GoogleTokenSet>();
    mockNativeAuthorize.mockReturnValueOnce(mint.promise);
    const request = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new AndroidGoogleAuthorization().signOut();
    mint.resolve({
      accessToken: 'token-2',
      expiresAt: 0,
      accountEmail: 'probe@gmail.com',
    });
    await expect(request).rejects.toMatchObject({ code: 'temporarily-unavailable' });
    expect(mockStore.has(TOKEN_KEY)).toBe(false);
    expect(mockStore.has(ACCOUNT_EMAIL_KEY)).toBe(false);
    expect(tokenWrites()).toBe(0);
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      code: 'not-connected',
    });
  });

  it('Disconnect queued before the write keeps the write out', async () => {
    const auth = await connected();
    const mint = deferred<GoogleTokenSet>();
    mockNativeAuthorize.mockReturnValueOnce(mint.promise);
    const request = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The mint's continuation runs only after signOut has started.
    mint.resolve({ accessToken: 'token-2', expiresAt: 0 });
    const signOut = new AndroidGoogleAuthorization().signOut();
    await expect(request).rejects.toMatchObject({ code: 'temporarily-unavailable' });
    await signOut;
    expect(mockStore.has(TOKEN_KEY)).toBe(false);
    expect(tokenWrites()).toBe(0);
  });

  it('Disconnect while the connection state is being read stops the request', async () => {
    const auth = await connected();
    const read = deferred<void>();
    mockBlockedRead = { key: ACCOUNT_EMAIL_KEY, until: read.promise };
    const request = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new AndroidGoogleAuthorization().signOut();
    read.resolve();
    await expect(request).rejects.toMatchObject({ code: 'temporarily-unavailable' });
    expect(silentMints()).toBe(0);
    expect(mockStore.has(TOKEN_KEY)).toBe(false);
  });

  it('Reconnect while the account is being read never mints for the old account', async () => {
    const auth = await connected();
    const read = deferred<void>();
    mockBlockedRead = { key: ACCOUNT_EMAIL_KEY, until: read.promise };
    const request = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await connect(new AndroidGoogleAuthorization(), 'other@gmail.com');
    read.resolve();
    await expect(request).rejects.toMatchObject({ code: 'temporarily-unavailable' });
    expect(silentMints()).toBe(0);
    mockNativeAuthorize.mockResolvedValueOnce({
      accessToken: 'new-account',
      expiresAt: 0,
    });
    await expect(auth.getFreshAccessToken()).resolves.toBe('new-account');
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'other@gmail.com');
  });

  it('requests wait for a 401 recovery, so the rejected token never comes back', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    const invalidated = deferred<void>();
    mockNativeInvalidate.mockReturnValueOnce(invalidated.promise);
    // Until Play services drops it, a mint would hand back the rejected token.
    let invalidatedDone = false;
    mockNativeAuthorize.mockImplementation(async () => ({
      accessToken: invalidatedDone ? 'token-3' : 'token-2',
      expiresAt: 0,
    }));
    const recovery = auth.clearInvalidAccessToken();
    const request = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(silentMints()).toBe(1);
    invalidatedDone = true;
    invalidated.resolve();
    await recovery;
    await expect(request).resolves.toBe('token-3');
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-3');
    expect(silentMints()).toBe(2);
  });

  it('a failed 401 recovery does not block later requests', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    const unreadable = Promise.reject(new Error('keystore unavailable'));
    unreadable.catch(() => undefined);
    mockBlockedRead = { key: TOKEN_KEY, until: unreadable };
    const recovery = auth.clearInvalidAccessToken();
    const request = auth.getFreshAccessToken();
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-3', expiresAt: 0 });
    await expect(recovery).rejects.toThrow('keystore unavailable');
    await expect(request).resolves.toBe('token-3');
  });

  it('a mint from the previous account is discarded after Reconnect', async () => {
    const auth = await connected();
    const mint = deferred<GoogleTokenSet>();
    mockNativeAuthorize.mockReturnValueOnce(mint.promise);
    const request = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await connect(new AndroidGoogleAuthorization(), 'other@gmail.com');
    const storedAfterReconnect = mockStore.get(TOKEN_KEY);
    mint.resolve({ accessToken: 'old-account', expiresAt: 0 });
    await expect(request).rejects.toMatchObject({ code: 'temporarily-unavailable' });
    expect(mockStore.get(TOKEN_KEY)).toBe(storedAfterReconnect);
    mockNativeAuthorize.mockResolvedValueOnce({
      accessToken: 'new-account',
      expiresAt: 0,
    });
    await expect(auth.getFreshAccessToken()).resolves.toBe('new-account');
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'other@gmail.com');
  });

  it('Reconnect drops a reused token', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    await connect(new AndroidGoogleAuthorization(), 'other@gmail.com');
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-3', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-3');
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'other@gmail.com');
  });

  it('a pinned account changed elsewhere is not served the old token', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    mockStore.set(ACCOUNT_EMAIL_KEY, 'other@gmail.com');
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-3', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-3');
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'other@gmail.com');
  });

  it('a connection change drops the token and discards a mint in flight', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await auth.getFreshAccessToken();
    const mint = deferred<GoogleTokenSet>();
    mockNativeAuthorize.mockReturnValueOnce(mint.promise);
    await cloudConnectionLifecycle.change(async () => undefined);
    const request = auth.getFreshAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await cloudConnectionLifecycle.change(async () => undefined);
    mint.resolve({ accessToken: 'token-3', expiresAt: 0 });
    await expect(request).rejects.toMatchObject({ code: 'temporarily-unavailable' });
    expect(silentMints()).toBe(2);
    expect(tokenWrites()).toBe(1);
  });

  it('a transient failure keeps nothing and writes nothing', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockRejectedValueOnce({ code: 'E_GOOGLE_AUTH_API_7' });
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      code: 'temporarily-unavailable',
    });
    expect(tokenWrites()).toBe(0);
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    expect(tokenWrites()).toBe(1);
  });

  it('a terminal failure keeps nothing and writes nothing', async () => {
    const auth = await connected();
    mockNativeAuthorize.mockRejectedValueOnce({ code: 'E_GOOGLE_AUTH_API_4' });
    const failure = await auth.getFreshAccessToken().catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'refresh-failed' });
    expect(providerErrorCodeForAuthError((failure as CloudAuthError).code)).toBe(
      'authorization-required',
    );
    expect(tokenWrites()).toBe(0);
  });
});

describe('AndroidGoogleAuthorization 401 recovery', () => {
  it('invalidates the Play services cache, then still allows a silent retry', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    await auth.clearInvalidAccessToken();
    expect(mockNativeInvalidate).toHaveBeenCalledWith('token-1');
    // Recovery deletes the stored token set, but the device is still
    // connected: the retry must reach Play services, not throw not-connected.
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'probe@gmail.com');
  });

  it('treats cache invalidation as best-effort', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    mockNativeInvalidate.mockRejectedValueOnce(new Error('play services unavailable'));
    await expect(auth.clearInvalidAccessToken()).resolves.toBeUndefined();
  });

  it('does not call the native cache with no stored token', async () => {
    const auth = new AndroidGoogleAuthorization();
    await auth.clearInvalidAccessToken();
    expect(mockNativeInvalidate).not.toHaveBeenCalled();
  });
});

describe('AndroidGoogleAuthorization error normalization', () => {
  it('maps a consent-required rejection', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    mockNativeAuthorize.mockRejectedValueOnce({ code: 'E_GOOGLE_AUTH_CONSENT_REQUIRED' });
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      code: 'consent-required',
    });
  });

  it('maps a partial grant that omitted Drive access', async () => {
    const auth = new AndroidGoogleAuthorization();
    mockNativeAuthorize.mockRejectedValueOnce({
      code: 'E_GOOGLE_AUTH_PERMISSION_REQUIRED',
    });
    await expect(auth.authorize()).rejects.toMatchObject({ code: 'permission-required' });
  });

  it('maps a cancelled chooser', async () => {
    const auth = new AndroidGoogleAuthorization();
    mockNativeAuthorize.mockRejectedValueOnce({ code: 'E_GOOGLE_AUTH_CANCELLED' });
    await expect(auth.authorize()).rejects.toMatchObject({ code: 'cancelled' });
    // A cancelled connect must not leave the device marked connected.
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      code: 'not-connected',
    });
  });

  it('wraps unknown native failures as a retryable CloudAuthError', async () => {
    const auth = new AndroidGoogleAuthorization();
    mockNativeAuthorize.mockRejectedValueOnce(new Error('boom'));
    const failure = await auth.authorize().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CloudAuthError);
    expect((failure as CloudAuthError).code).toBe('temporarily-unavailable');
    expect((failure as CloudAuthError).message).toBe('boom');
  });
});

describe('AndroidGoogleAuthorization terminal vs transient renewal failures', () => {
  async function renewalFailure(rejection: unknown) {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    mockNativeAuthorize.mockRejectedValueOnce(rejection);
    const failure = await auth.getFreshAccessToken().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CloudAuthError);
    return failure as CloudAuthError;
  }

  it.each([
    ['consent resolution (revoked grant)', { code: 'E_GOOGLE_AUTH_CONSENT_REQUIRED' }],
    ['Drive scope missing', { code: 'E_GOOGLE_AUTH_PERMISSION_REQUIRED' }],
    ['SIGN_IN_REQUIRED', { code: 'E_GOOGLE_AUTH_API_4', message: '4: ' }],
    ['INVALID_ACCOUNT', { code: 'E_GOOGLE_AUTH_API_5', message: '5: ' }],
    ['RESOLUTION_REQUIRED', { code: 'E_GOOGLE_AUTH_API_6', message: '6: ' }],
    // Builds before the status code was forwarded: ApiException's message.
    [
      'older build INVALID_ACCOUNT',
      { code: 'E_GOOGLE_AUTH_FAILED', message: '5: Account missing' },
    ],
  ])('%s asks for a reconnect', async (_name, rejection) => {
    const failure = await renewalFailure(rejection);
    expect(providerErrorCodeForAuthError(failure.code)).toBe('authorization-required');
  });

  it.each([
    ['NETWORK_ERROR', { code: 'E_GOOGLE_AUTH_API_7', message: '7: ' }],
    ['INTERNAL_ERROR', { code: 'E_GOOGLE_AUTH_API_8', message: '8: ' }],
    ['DEVELOPER_ERROR', { code: 'E_GOOGLE_AUTH_API_10', message: '10: ' }],
    ['TIMEOUT', { code: 'E_GOOGLE_AUTH_API_15', message: '15: ' }],
    ['CANCELED', { code: 'E_GOOGLE_AUTH_API_16', message: '16: ' }],
    ['SERVICE_VERSION_UPDATE_REQUIRED', { code: 'E_GOOGLE_AUTH_API_2' }],
    ['SERVICE_UPDATING', { code: 'E_GOOGLE_AUTH_API_18' }],
    ['unknown status', { code: 'E_GOOGLE_AUTH_API_99999' }],
    ['older build network error', { code: 'E_GOOGLE_AUTH_FAILED', message: '7: ' }],
    ['missing token', { code: 'E_GOOGLE_AUTH_FAILED', message: 'No token' }],
    ['busy', { code: 'E_GOOGLE_AUTH_BUSY' }],
    ['no activity', { code: 'E_GOOGLE_AUTH_NO_ACTIVITY' }],
    ['a plain Error', new Error('binder died')],
    ['a non-object', 'oops'],
  ])('%s retries later without a reconnect', async (_name, rejection) => {
    const failure = await renewalFailure(rejection);
    expect(failure.code).toBe('temporarily-unavailable');
    expect(providerErrorCodeForAuthError(failure.code)).toBe('transient');
  });

  it('keeps every stored credential after a transient failure', async () => {
    const auth = new AndroidGoogleAuthorization();
    await connect(auth);
    const before = new Map(mockStore);
    mockNativeAuthorize.mockRejectedValueOnce({ code: 'E_GOOGLE_AUTH_API_7' });
    await expect(auth.getFreshAccessToken()).rejects.toMatchObject({
      code: 'temporarily-unavailable',
    });
    expect(mockStore).toEqual(before);
    mockNativeAuthorize.mockResolvedValueOnce({ accessToken: 'token-2', expiresAt: 0 });
    await expect(auth.getFreshAccessToken()).resolves.toBe('token-2');
    expect(mockNativeAuthorize).toHaveBeenLastCalledWith(false, 'probe@gmail.com');
  });
});
