import type { CloudAuthorization, GoogleTokenSet } from '../auth/types';
import { canonicalBytes, sha256Bytes } from '../codec';
import { selectRestorableUserVaults } from '../ui/vaultSelection';
import {
  driveMetadataKey,
  GoogleDriveProvider,
  MemoryResumableSessionStore,
  type DriveFetchLike,
  type DriveResponseLike,
} from './googleDrive';

class FakeAuth implements CloudAuthorization {
  clearCount = 0;
  signOutCount = 0;
  async authorize(): Promise<GoogleTokenSet> {
    return { accessToken: 'token', expiresAt: Date.now() + 60_000 };
  }
  async getFreshAccessToken() { return 'token'; }
  async clearInvalidAccessToken() { this.clearCount++; }
  async signOut() { this.signOutCount++; }
  async getAccountLabel() { return 'Test account'; }
}

function response(
  status: number,
  json: unknown = {},
  options: { bytes?: Uint8Array; headers?: Record<string, string> } = {},
): DriveResponseLike {
  const headerMap = new Map(
    Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const bytes = options.bytes ?? new Uint8Array();
  let sent = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headerMap.get(name.toLowerCase()) ?? null },
    body: options.bytes
      ? {
          getReader: () => ({
            read: async () => {
              if (sent) return { done: true };
              sent = true;
              return { done: false, value: bytes };
            },
          }),
        }
      : null,
    json: async () => json,
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function file(id: string, key: string, hash: string) {
  return {
    id,
    appProperties: { tb_vault: 'vault', tb_key: key, tb_hash: hash },
  };
}

test('vault discovery exposes marker dates newest-first', async () => {
  const auth = new FakeAuth();
  const olderBody = canonicalBytes({
    magic: 'tackbok-vault',
    formatVersion: 1,
    vaultId: 'vault-older',
  });
  const newerBody = canonicalBytes({
    magic: 'tackbok-vault',
    formatVersion: 1,
    vaultId: 'vault-newer',
  });
  const markers = [
    {
      id: 'older-marker',
      createdTime: '2026-08-08T10:00:00.000Z',
      appProperties: {
        tb_vault: 'vault-older',
        tb_key: 'vault.json',
        tb_hash: sha256Bytes(olderBody),
      },
    },
    {
      id: 'newer-marker',
      createdTime: '2026-08-10T10:00:00.000Z',
      appProperties: {
        tb_vault: 'vault-newer',
        tb_key: 'vault.json',
        tb_hash: sha256Bytes(newerBody),
      },
    },
  ];
  const provider = new GoogleDriveProvider({
    auth,
    fetch: async (url) => {
      if (url.includes('/drive/v3/files?')) return response(200, { files: markers });
      if (url.includes('/older-marker?alt=media')) {
        return response(200, {}, { bytes: olderBody });
      }
      if (url.includes('/newer-marker?alt=media')) {
        return response(200, {}, { bytes: newerBody });
      }
      throw new Error(`Unexpected request ${url}`);
    },
  });

  await expect(provider.listVaults()).resolves.toEqual([
    {
      vaultId: 'vault-newer',
      remoteRootId: 'newer-marker',
      revoked: false,
      createdAt: Date.parse('2026-08-10T10:00:00.000Z'),
    },
    {
      vaultId: 'vault-older',
      remoteRootId: 'older-marker',
      revoked: false,
      createdAt: Date.parse('2026-08-08T10:00:00.000Z'),
    },
  ]);
});

test('normal restore discovery excludes revoked and Phase-3 probe vaults', () => {
  expect(selectRestorableUserVaults([
    { vaultId: 'vault-user', remoteRootId: 'user-root', revoked: false },
    { vaultId: 'probe-mslob1c3', remoteRootId: 'probe-root', revoked: false },
    { vaultId: 'vault-dead', remoteRootId: 'dead-root', revoked: true },
  ])).toEqual([
    { vaultId: 'vault-user', remoteRootId: 'user-root', revoked: false },
  ]);
});

test('full-length entity keys fit Drive appProperties and remain reversible', async () => {
  const auth = new FakeAuth();
  const bytes = new Uint8Array([4, 2, 4, 2]);
  const hash = sha256Bytes(bytes);
  const key = `entities/entry/${'a'.repeat(36)}/${'b'.repeat(64)}.json`;
  const metadataKey = driveMetadataKey(key);
  const stored = {
    id: 'long-key-file',
    name: key,
    size: String(bytes.length),
    appProperties: {
      tb_vault: 'vault',
      tb_key: metadataKey,
      tb_hash: hash,
    },
  };
  const calls: { url: string; init?: Record<string, unknown> }[] = [];
  const provider = new GoogleDriveProvider({
    auth,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) return response(200, { files: [] });
      if (calls.length === 2) return response(200, stored);
      if (calls.length === 3) return response(200, { files: [stored] });
      if (calls.length === 4) return response(200, {}, { bytes });
      throw new Error(`Unexpected request ${url}`);
    },
  });
  const vault = { vaultId: 'vault', remoteRootId: 'appDataFolder' };

  expect(new TextEncoder().encode(`tb_key${metadataKey}`).length).toBeLessThanOrEqual(124);
  expect(metadataKey).toMatch(/^h:[0-9a-f]{64}$/);
  await expect(provider.putImmutable(vault, key, bytes)).resolves.toMatchObject({ key });
  await expect(provider.read(vault, key)).resolves.toMatchObject({ key, body: bytes });
  expect(decodeURIComponent(calls[0]!.url)).toContain(metadataKey);
  expect(new TextDecoder().decode(calls[1]!.init?.body as Uint8Array)).toContain(
    `"tb_key":"${metadataKey}"`,
  );
});

test('Drive immutable writes reuse verified duplicates and reject collisions', async () => {
  const auth = new FakeAuth();
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = sha256Bytes(bytes);
  const stored = file('file-1', 'entities/entry/e/v.json', hash);
  const calls: { url: string; init?: Record<string, unknown> }[] = [];
  const queue = [
    response(200, { files: [] }),
    response(200, stored),
    response(200, { files: [stored] }),
    response(200, {}, { bytes }),
    response(200, { files: [stored] }),
  ];
  const fetch: DriveFetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('Unexpected request');
    return next;
  };
  const provider = new GoogleDriveProvider({ auth, fetch });
  const vault = { vaultId: 'vault', remoteRootId: 'appDataFolder' };

  await expect(provider.putImmutable(vault, stored.appProperties.tb_key, bytes)).resolves.toEqual({
    fileId: 'file-1',
    key: stored.appProperties.tb_key,
    contentHash: hash,
  });
  await expect(provider.putImmutable(vault, stored.appProperties.tb_key, bytes)).resolves.toEqual({
    fileId: 'file-1',
    key: stored.appProperties.tb_key,
    contentHash: hash,
  });
  await expect(
    provider.putImmutable(vault, stored.appProperties.tb_key, new Uint8Array([9])),
  ).rejects.toMatchObject({ category: 'corrupt' });
  expect(calls.filter((call) => call.url.includes('uploadType=multipart'))).toHaveLength(1);
  expect(calls.every((call) => (call.init?.headers as Record<string, string>).Authorization === 'Bearer token')).toBe(true);
});

test('Drive downloads are stream-hashed and a 401 refreshes once', async () => {
  const auth = new FakeAuth();
  const expected = new Uint8Array([4, 5, 6]);
  const stored = file('file-2', 'heads/entry/e.json', sha256Bytes(expected));
  const queue = [
    response(401),
    response(200, { files: [stored] }),
    response(200, {}, { bytes: new Uint8Array([4, 5, 7]) }),
  ];
  const provider = new GoogleDriveProvider({
    auth,
    fetch: async () => queue.shift() ?? response(500),
  });
  await expect(
    provider.read({ vaultId: 'vault', remoteRootId: 'root' }, 'heads/entry/e.json'),
  ).rejects.toMatchObject({ category: 'corrupt' });
  expect(auth.clearCount).toBe(1);
});

test('resumable upload uses 256 KiB boundaries, verifies bytes, and replaces expired sessions', async () => {
  const auth = new FakeAuth();
  const sessions = new MemoryResumableSessionStore();
  const bytes = new Uint8Array(300_000);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  const hash = sha256Bytes(bytes);
  const identity = { logicalKey: `blobs/aa/${hash}`, contentHash: hash };
  await sessions.set(identity, { uri: 'https://www.googleapis.com/upload/expired', expiresAt: 1 });
  const ranges: string[] = [];
  const fetch: DriveFetchLike = async (url, init) => {
    if (url.includes('/drive/v3/files?') && !url.includes('/upload/')) return response(200, { files: [] });
    if (url.includes('uploadType=resumable')) {
      return response(200, {}, { headers: { location: 'https://www.googleapis.com/upload/session' } });
    }
    if (url === 'https://www.googleapis.com/upload/session') {
      const headers = init?.headers as Record<string, string>;
      ranges.push(headers['Content-Range']);
      return ranges.length === 1
        ? response(308)
        : response(200, file('blob-file', `blobs/aa/${hash}`, hash));
    }
    throw new Error(`Unexpected request ${url}`);
  };
  async function* chunks() {
    yield bytes.slice(0, 100_000);
    yield bytes.slice(100_000, 210_000);
    yield bytes.slice(210_000);
  }
  const provider = new GoogleDriveProvider({ auth, fetch, sessionStore: sessions });
  await expect(
    provider.putImmutable(
      { vaultId: 'vault', remoteRootId: 'root' },
      `blobs/aa/${hash}`,
      { byteLength: bytes.length, contentHash: hash, chunks: chunks() },
    ),
  ).resolves.toMatchObject({ fileId: 'blob-file', contentHash: hash });
  expect(ranges).toEqual([
    `bytes 0-${256 * 1024 - 1}/${bytes.length}`,
    `bytes ${256 * 1024}-${bytes.length - 1}/${bytes.length}`,
  ]);
  expect(await sessions.get(identity)).toBeNull();
});

test('resumable upload queries and continues from the persisted Drive offset', async () => {
  const auth = new FakeAuth();
  const sessions = new MemoryResumableSessionStore();
  const bytes = new Uint8Array(300_000);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 239;
  const hash = sha256Bytes(bytes);
  const key = `blobs/aa/${hash}`;
  const identity = { logicalKey: key, contentHash: hash };
  await sessions.set(identity, {
    uri: 'https://www.googleapis.com/upload/session',
    expiresAt: Date.now() + 60_000,
  });
  const ranges: string[] = [];
  const fetch: DriveFetchLike = async (url, init) => {
    if (url.includes('/drive/v3/files?')) return response(200, { files: [] });
    if (url === 'https://www.googleapis.com/upload/session') {
      const headers = init?.headers as Record<string, string>;
      ranges.push(headers['Content-Range']);
      if (headers['Content-Length'] === '0') {
        return response(308, {}, { headers: { range: `bytes=0-${256 * 1024 - 1}` } });
      }
      return response(200, file('blob-file', key, hash));
    }
    throw new Error(`Unexpected request ${url}`);
  };
  async function* chunks() {
    yield bytes.slice(0, 120_000);
    yield bytes.slice(120_000);
  }
  const provider = new GoogleDriveProvider({ auth, fetch, sessionStore: sessions });
  await expect(provider.putImmutable(
    { vaultId: 'vault', remoteRootId: 'root' },
    key,
    { byteLength: bytes.length, contentHash: hash, chunks: chunks() },
  )).resolves.toMatchObject({ fileId: 'blob-file' });
  expect(ranges).toEqual([
    `bytes */${bytes.length}`,
    `bytes ${256 * 1024}-${bytes.length - 1}/${bytes.length}`,
  ]);
  expect(await sessions.get(identity)).toBeNull();
});

test('untrusted persisted resumable URI is discarded before attaching a bearer token', async () => {
  const auth = new FakeAuth();
  const sessions = new MemoryResumableSessionStore();
  const bytes = new Uint8Array([7, 8, 9]);
  const hash = sha256Bytes(bytes);
  const key = `blobs/aa/${hash}`;
  await sessions.set(
    { logicalKey: key, contentHash: hash },
    { uri: 'https://attacker.example/upload', expiresAt: Date.now() + 60_000 },
  );
  const urls: string[] = [];
  const fetch: DriveFetchLike = async (url) => {
    urls.push(url);
    if (url.includes('uploadType=resumable')) {
      return response(200, {}, {
        headers: { location: 'https://www.googleapis.com/upload/safe-session' },
      });
    }
    if (url.includes('/drive/v3/files?')) return response(200, { files: [] });
    if (url === 'https://www.googleapis.com/upload/safe-session') {
      return response(200, file('blob-file', key, hash));
    }
    throw new Error(`Unexpected request ${url}`);
  };
  async function* chunks() { yield bytes; }
  const provider = new GoogleDriveProvider({ auth, fetch, sessionStore: sessions });
  await provider.putImmutable(
    { vaultId: 'vault', remoteRootId: 'root' },
    key,
    { byteLength: bytes.length, contentHash: hash, chunks: chunks() },
  );
  expect(urls).not.toContain('https://attacker.example/upload');
});

test('large download resumes into a durable sink and verifies the complete hash', async () => {
  const auth = new FakeAuth();
  const bytes = new Uint8Array(300_000);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 227;
  const prefixLength = 256 * 1024;
  const hash = sha256Bytes(bytes);
  const key = `blobs/aa/${hash}`;
  const stored = { ...file('blob-file', key, hash), size: String(bytes.length) };
  let durable = bytes.slice(0, prefixLength);
  const sink = {
    byteLength: async () => durable.length,
    append: async (chunk: Uint8Array) => {
      const next = new Uint8Array(durable.length + chunk.length);
      next.set(durable);
      next.set(chunk, durable.length);
      durable = next;
    },
    reset: async () => { durable = new Uint8Array(); },
    digestSha256: async () => sha256Bytes(durable),
  };
  const calls: Record<string, string>[] = [];
  const provider = new GoogleDriveProvider({
    auth,
    fetch: async (url, init) => {
      if (url.includes('/drive/v3/files?')) return response(200, { files: [stored] });
      if (url.includes('alt=media')) {
        calls.push(init?.headers as Record<string, string>);
        return response(206, {}, { bytes: bytes.slice(prefixLength) });
      }
      throw new Error(`Unexpected request ${url}`);
    },
  });
  await expect(provider.downloadToSink(
    { vaultId: 'vault', remoteRootId: 'root' },
    key,
    sink,
  )).resolves.toMatchObject({ fileId: 'blob-file', contentHash: hash });
  expect(calls[0].Range).toBe(`bytes=${prefixLength}-`);
  expect(durable).toEqual(bytes);
});

test('initial change discovery restores pre-existing entity history before live changes', async () => {
  const auth = new FakeAuth();
  const firstBytes = new Uint8Array([1, 2]);
  const secondBytes = new Uint8Array([3, 4]);
  const first = file(
    'entity-1',
    'entities/entry/first/version.json',
    sha256Bytes(firstBytes),
  );
  const second = file(
    'entity-2',
    'entities/entry/second/version.json',
    sha256Bytes(secondBytes),
  );
  const blob = file('blob', `blobs/aa/${'a'.repeat(64)}`, 'a'.repeat(64));
  const provider = new GoogleDriveProvider({
    auth,
    pageSize: 2,
    fetch: async (url) => {
      if (url.includes('/changes/startPageToken')) {
        return response(200, { startPageToken: 'live-token' });
      }
      if (url.includes('/files?') && url.includes('pageToken=list-2')) {
        return response(200, { files: [second] });
      }
      if (url.includes('/files?')) {
        return response(200, { files: [first, blob], nextPageToken: 'list-2' });
      }
      if (url.includes('/entity-1?alt=media')) {
        return response(200, {}, { bytes: firstBytes });
      }
      if (url.includes('/entity-2?alt=media')) {
        return response(200, {}, { bytes: secondBytes });
      }
      if (url.includes('/changes?')) {
        return response(200, { newStartPageToken: 'next-live-token', changes: [] });
      }
      throw new Error(`Unexpected request ${url}`);
    },
  });
  const vault = { vaultId: 'vault', remoteRootId: 'root' };

  const firstPage = await provider.getChanges(vault);
  expect(firstPage.objects.map(({ key }) => key)).toEqual([first.appProperties.tb_key]);
  expect(firstPage.cursor).toContain('tackbok-initial-restore:');

  const secondPage = await provider.getChanges(vault, firstPage.cursor ?? undefined);
  expect(secondPage.objects.map(({ key }) => key)).toEqual([second.appProperties.tb_key]);
  expect(secondPage.cursor).toBe('live-token');

  await expect(provider.getChanges(vault, secondPage.cursor ?? undefined)).resolves.toEqual({
    objects: [],
    cursor: 'next-live-token',
  });
});

test('initial restore rewinds an expired persisted list token and completes idempotently', async () => {
  const auth = new FakeAuth();
  const firstBytes = new Uint8Array([21]);
  const secondBytes = new Uint8Array([22]);
  const first = file('restore-first', 'entities/entry/first/v1.json', sha256Bytes(firstBytes));
  const second = file('restore-second', 'entities/entry/second/v1.json', sha256Bytes(secondBytes));
  let unpagedListings = 0;
  const fetch: DriveFetchLike = async (url) => {
    if (url.includes('/changes/startPageToken')) {
      return response(200, { startPageToken: 'live-after-restore' });
    }
    if (url.includes('/files?') && url.includes('pageToken=expired-list-token')) {
      return response(410);
    }
    if (url.includes('/files?') && url.includes('pageToken=fresh-list-token')) {
      return response(200, { files: [second] });
    }
    if (url.includes('/files?')) {
      unpagedListings++;
      return response(200, {
        files: [first],
        nextPageToken: unpagedListings === 1 ? 'expired-list-token' : 'fresh-list-token',
      });
    }
    if (url.includes('/restore-first?alt=media')) {
      return response(200, {}, { bytes: firstBytes });
    }
    if (url.includes('/restore-second?alt=media')) {
      return response(200, {}, { bytes: secondBytes });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const vault = { vaultId: 'vault', remoteRootId: 'root' };
  const beforeDeath = new GoogleDriveProvider({ auth, fetch, pageSize: 1 });
  const firstPage = await beforeDeath.getChanges(vault);

  // Reconstruct the provider as a process death would, then present Drive's
  // expired-token response for the persisted list cursor.
  const afterDeath = new GoogleDriveProvider({ auth, fetch, pageSize: 1 });
  const replayedPage = await afterDeath.getChanges(vault, firstPage.cursor ?? undefined);
  const finalPage = await afterDeath.getChanges(vault, replayedPage.cursor ?? undefined);

  expect(new Set([
    ...firstPage.objects,
    ...replayedPage.objects,
    ...finalPage.objects,
  ].map(({ key }) => key))).toEqual(new Set([
    first.appProperties.tb_key,
    second.appProperties.tb_key,
  ]));
  expect(replayedPage.objects.map(({ key }) => key)).toEqual([first.appProperties.tb_key]);
  expect(finalPage.cursor).toBe('live-after-restore');
  expect(unpagedListings).toBe(2);
});

test('initial restore bounds authenticated entity downloads', async () => {
  const auth = new FakeAuth();
  const stored = Array.from({ length: 10 }, (_, index) => {
    const bytes = new Uint8Array([index]);
    return {
      bytes,
      metadata: file(
        `bounded-${index}`,
        `entities/entry/${index}/v1.json`,
        sha256Bytes(bytes),
      ),
    };
  });
  let activeDownloads = 0;
  let peakDownloads = 0;
  const provider = new GoogleDriveProvider({
    auth,
    pageSize: 100,
    fetch: async (url) => {
      if (url.includes('/changes/startPageToken')) {
        return response(200, { startPageToken: 'live-token' });
      }
      if (url.includes('/files?')) {
        return response(200, { files: stored.map(({ metadata }) => metadata) });
      }
      const item = stored.find(({ metadata }) => url.includes(`/${metadata.id}?alt=media`));
      if (!item) throw new Error(`Unexpected request ${url}`);
      activeDownloads++;
      peakDownloads = Math.max(peakDownloads, activeDownloads);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeDownloads--;
      return response(200, {}, { bytes: item.bytes });
    },
  });

  const page = await provider.getChanges({ vaultId: 'vault', remoteRootId: 'root' });
  expect(page.objects).toHaveLength(10);
  expect(peakDownloads).toBeGreaterThan(1);
  expect(peakDownloads).toBeLessThanOrEqual(4);
});

test('Drive retries rate-limit 403s with Retry-After but keeps genuine 403s as auth', async () => {
  const rateLimitAuth = new FakeAuth();
  const delays: number[] = [];
  let rateLimitCalls = 0;
  const rateLimited = new GoogleDriveProvider({
    auth: rateLimitAuth,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    fetch: async () => {
      rateLimitCalls++;
      if (rateLimitCalls === 1) {
        return response(403, {
          error: { errors: [{ reason: 'userRateLimitExceeded' }] },
        }, { headers: { 'retry-after': '2' } });
      }
      return response(200, { storageQuota: { usageInDrive: '7', limit: '10' } });
    },
  });
  await expect(rateLimited.getQuota()).resolves.toEqual({ usedBytes: 7, limitBytes: 10 });
  expect(delays).toEqual([2_000]);
  expect(rateLimitAuth.clearCount).toBe(0);

  const auth = new FakeAuth();
  let authCalls = 0;
  const forbidden = new GoogleDriveProvider({
    auth,
    sleep: async () => { throw new Error('auth errors must not retry'); },
    fetch: async () => {
      authCalls++;
      return response(403, {
        error: { errors: [{ reason: 'insufficientPermissions' }] },
      });
    },
  });
  await expect(forbidden.getQuota()).rejects.toMatchObject({ category: 'auth' });
  expect(authCalls).toBe(1);
});

test('Drive transient retries use bounded exponential backoff', async () => {
  const delays: number[] = [];
  let calls = 0;
  const provider = new GoogleDriveProvider({
    auth: new FakeAuth(),
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    random: () => 0,
    fetch: async () => {
      calls++;
      return calls < 3
        ? response(500)
        : response(200, { storageQuota: { usageInDrive: '1' } });
    },
  });
  await expect(provider.getQuota()).resolves.toEqual({ usedBytes: 1, limitBytes: null });
  expect(delays).toEqual([1_000, 2_000]);
});

test('permanent delete is idempotent and purge preserves revocation markers', async () => {
  const auth = new FakeAuth();
  const entity = file('entity-file', 'entities/entry/e/v.json', 'a'.repeat(64));
  const marker = file('marker-file', 'revocations/r.json', 'b'.repeat(64));
  const methods: string[] = [];
  const queue = [
    response(404),
    response(200, { files: [entity, marker] }),
    response(204),
    response(200, { files: [marker] }),
  ];
  const provider = new GoogleDriveProvider({
    auth,
    fetch: async (_url, init) => {
      methods.push((init?.method as string | undefined) ?? 'GET');
      const next = queue.shift();
      if (!next) throw new Error('Unexpected request');
      return next;
    },
  });
  const vault = { vaultId: 'vault', remoteRootId: 'root' };
  await expect(provider.deleteObject(vault, {
    fileId: 'already-gone',
    key: 'entities/entry/e/old.json',
    contentHash: 'c'.repeat(64),
  })).resolves.toBeUndefined();
  await expect(provider.deleteVaultResidue(vault)).resolves.toEqual({
    deleted: 1,
    cursor: null,
    complete: true,
  });
  expect(methods).toEqual(['DELETE', 'GET', 'DELETE', 'GET']);
});

test('Disconnect is local auth cleanup and does not issue any Drive request', async () => {
  const auth = new FakeAuth();
  const fetch = jest.fn<ReturnType<DriveFetchLike>, Parameters<DriveFetchLike>>();
  const provider = new GoogleDriveProvider({ auth, fetch });
  await provider.disconnect();
  expect(auth.signOutCount).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
});
