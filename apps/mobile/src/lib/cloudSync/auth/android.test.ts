import { providerErrorCodeForAuthError } from '../failureClassification';
import { AndroidGoogleAuthorization } from './android';
import { CloudAuthError } from './types';

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
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
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

beforeEach(() => {
  mockStore.clear();
  mockNativeAuthorize.mockReset();
  mockNativeInvalidate.mockReset();
  mockNativeSignOut.mockReset();
  mockNativeSignOut.mockResolvedValue(undefined);
  mockNativeInvalidate.mockResolvedValue(undefined);
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
