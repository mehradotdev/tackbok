import { fetch } from 'expo/fetch';

import { fetchGoogleAccountLabel } from './accountLabel';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  } as unknown as Awaited<ReturnType<typeof fetch>>;
}

beforeEach(() => mockFetch.mockReset());

describe('fetchGoogleAccountLabel', () => {
  it('returns the full email for the connected-account label', async () => {
    mockFetch.mockResolvedValueOnce(response(200, { email: 'probe.account@gmail.com' }));
    await expect(fetchGoogleAccountLabel('token')).resolves.toBe('probe.account@gmail.com');
  });

  it('throws an auth error when the token is rejected', async () => {
    // Swallowing a 401 into the fallback label is how a dead token passed for
    // a healthy connection (finding 0001).
    mockFetch.mockResolvedValueOnce(response(401));
    await expect(fetchGoogleAccountLabel('token')).rejects.toMatchObject({
      name: 'CloudAuthError',
      code: 'refresh-failed',
    });
  });

  it('throws an auth error on an insufficient-permission rejection', async () => {
    mockFetch.mockResolvedValueOnce(response(403));
    await expect(fetchGoogleAccountLabel('token')).rejects.toMatchObject({
      code: 'refresh-failed',
    });
  });

  it('falls back on network failure, which says nothing about the token', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchGoogleAccountLabel('token')).resolves.toBe('Google Drive');
  });

  it('falls back on a server error', async () => {
    mockFetch.mockResolvedValueOnce(response(500));
    await expect(fetchGoogleAccountLabel('token')).resolves.toBe('Google Drive');
  });

  it('falls back on a malformed success body', async () => {
    mockFetch.mockResolvedValueOnce(response(200));
    await expect(fetchGoogleAccountLabel('token')).resolves.toBe('Google Drive');
  });

  it('falls back when the body has no email', async () => {
    mockFetch.mockResolvedValueOnce(response(200, {}));
    await expect(fetchGoogleAccountLabel('token')).resolves.toBe('Google Drive');
  });
});
