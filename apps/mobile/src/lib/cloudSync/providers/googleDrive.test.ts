import type { CloudAuthorization, GoogleTokenSet } from '../auth/types';
import { sha256Bytes } from '../codec';
import {
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
