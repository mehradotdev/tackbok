import {
  CloudAuthError,
  type CloudAuthorization,
  type GoogleTokenSet,
} from '../../auth/types';
import { encodeCanonicalBytes } from '../canonical';
import { decodeSnapshot, encodeSnapshot } from '../codec';
import { sha256Bytes } from '../sha256';
import type { JournalSnapshotPayload } from '../types';
import type { DeviceHead } from '../sync/types';
import {
  driveMetadataKey,
  GoogleDriveSnapshotProvider,
  type DriveFetchLike,
  type DriveResponseLike,
} from './googleDriveSnapshotProvider';
import {
  assertDriveReportIsRedacted,
  MemoryDriveInstrumentation,
} from './instrumentation';
import {
  MemoryDriveProviderStateStore,
  type DriveFileRecord,
  type DriveObjectKind,
} from './state';
import { DriveTransport } from './transport';
import { SyncCancelledError } from '../sync/errors';

class FakeAuth implements CloudAuthorization {
  clears = 0;
  async authorize(): Promise<GoogleTokenSet> {
    return { accessToken: 'synthetic-access', expiresAt: Date.now() + 60_000 };
  }
  async getFreshAccessToken() {
    return 'synthetic-access';
  }
  async clearInvalidAccessToken() {
    this.clears += 1;
  }
  async signOut() {}
  async getAccountLabel() {
    return 'Synthetic account';
  }
}

function response(
  status: number,
  json: unknown = {},
  bytes?: Uint8Array,
  headers: Record<string, string> = {},
): DriveResponseLike {
  const values = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  if (bytes) values.set('content-length', String(bytes.byteLength));
  let sent = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => values.get(name.toLowerCase()) ?? null },
    body: bytes
      ? {
          getReader: () => ({
            read: async () => {
              if (sent) return { done: true };
              sent = true;
              return { done: false, value: bytes.slice() };
            },
          }),
        }
      : null,
    json: async () => json,
    arrayBuffer: async () => (bytes ?? new Uint8Array()).slice().buffer,
  };
}

interface StoredDriveFile {
  id: string;
  name: string;
  size: string;
  createdTime: string;
  sha256Checksum: string;
  appProperties: Record<string, string>;
  trashed: boolean;
  bytes: Uint8Array;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
  outer: for (let index = start; index <= haystack.length - needle.length; index += 1) {
    for (let part = 0; part < needle.length; part += 1) {
      if (haystack[index + part] !== needle[part]) continue outer;
    }
    return index;
  }
  return -1;
}

function parseMultipart(init: Record<string, unknown>): {
  metadata: { name: string; parents?: string[]; appProperties: Record<string, string> };
  bytes: Uint8Array;
} {
  const headers = init.headers as Record<string, string>;
  const boundary = /boundary=([^;]+)/.exec(headers['Content-Type'])?.[1];
  if (!boundary) throw new Error('Missing multipart boundary');
  const body = init.body as Uint8Array;
  const headerEnd = new TextEncoder().encode('\r\n\r\n');
  const boundaryStart = new TextEncoder().encode(`\r\n--${boundary}`);
  const firstHeader = findBytes(body, headerEnd);
  const metadataEnd = findBytes(body, boundaryStart, firstHeader + headerEnd.length);
  const secondHeader = findBytes(body, headerEnd, metadataEnd + boundaryStart.length);
  const bodyEnd = findBytes(body, boundaryStart, secondHeader + headerEnd.length);
  if ([firstHeader, metadataEnd, secondHeader, bodyEnd].some((value) => value < 0)) {
    throw new Error('Malformed multipart payload');
  }
  const metadata = JSON.parse(
    new TextDecoder().decode(body.slice(firstHeader + headerEnd.length, metadataEnd)),
  ) as { name: string; parents?: string[]; appProperties: Record<string, string> };
  return { metadata, bytes: body.slice(secondHeader + headerEnd.length, bodyEnd) };
}

class FakeDriveServer {
  readonly calls: { url: string; method: string }[] = [];
  readonly files = new Map<string, StoredDriveFile>();
  failAfterNextCreate = false;
  hideNextFileLists = 0;
  hideNextChangeLists = 0;
  rejectChangeCursors = 0;
  private nextId = 0;
  private sequence = 0;
  private readonly changes: { sequence: number; fileId: string; removed: boolean }[] = [];

  readonly fetch: DriveFetchLike = async (url, init = {}) => {
    const method = String(init.method ?? 'GET');
    this.calls.push({ url, method });
    const parsed = new URL(url);
    if (!(init.headers as Record<string, string>).Authorization.startsWith('Bearer ')) {
      return response(401);
    }
    if (parsed.pathname.endsWith('/changes/startPageToken')) {
      return response(200, { startPageToken: String(this.sequence) });
    }
    if (parsed.pathname.endsWith('/changes')) {
      if (this.rejectChangeCursors > 0) {
        this.rejectChangeCursors -= 1;
        return response(410);
      }
      const token = parsed.searchParams.get('pageToken');
      if (token === 'expired-cursor') return response(410);
      if (this.hideNextChangeLists > 0) {
        this.hideNextChangeLists -= 1;
        return response(200, { changes: [], newStartPageToken: token });
      }
      const from = Number(token ?? 0);
      const changes = this.changes
        .filter((change) => change.sequence > from)
        .map((change) => ({
          removed: change.removed,
          fileId: change.fileId,
          file: change.removed
            ? undefined
            : this.publicFile(this.files.get(change.fileId)!),
        }));
      return response(200, { changes, newStartPageToken: String(this.sequence) });
    }
    if (parsed.pathname.endsWith('/files') && method === 'GET') {
      const query = parsed.searchParams.get('q') ?? '';
      if (this.hideNextFileLists > 0) {
        this.hideNextFileLists -= 1;
        return response(200, { files: [] });
      }
      return response(200, {
        files: [...this.files.values()]
          .filter((file) => this.matches(file, query))
          .map((file) => this.publicFile(file)),
      });
    }
    if (
      parsed.pathname.endsWith('/files') &&
      method === 'POST' &&
      parsed.searchParams.get('uploadType') === 'multipart'
    ) {
      const { metadata, bytes } = parseMultipart(init);
      if (!metadata.parents?.includes('appDataFolder')) return response(400);
      const stored = this.store(metadata, bytes);
      if (this.failAfterNextCreate) {
        this.failAfterNextCreate = false;
        throw new Error('synthetic lost create response');
      }
      return response(200, this.publicFile(stored));
    }
    const fileMatch = /\/files\/([^/]+)$/.exec(parsed.pathname);
    if (fileMatch && parsed.searchParams.get('alt') === 'media' && method === 'GET') {
      const stored = this.files.get(decodeURIComponent(fileMatch[1]));
      return stored ? response(200, {}, stored.bytes) : response(404);
    }
    if (
      fileMatch &&
      parsed.searchParams.get('uploadType') === 'multipart' &&
      method === 'PATCH'
    ) {
      const id = decodeURIComponent(fileMatch[1]);
      if (!this.files.has(id)) return response(404);
      const { metadata, bytes } = parseMultipart(init);
      if (metadata.parents !== undefined) return response(403);
      const stored = this.store(metadata, bytes, id);
      return response(200, this.publicFile(stored));
    }
    if (fileMatch && method === 'DELETE') {
      const id = decodeURIComponent(fileMatch[1]);
      if (!this.files.delete(id)) return response(404);
      this.recordChange(id, true);
      return response(204);
    }
    throw new Error(`Unexpected fake Drive request: ${method} ${url}`);
  };

  seed(
    vaultId: string,
    key: string,
    kind: DriveObjectKind,
    bytes: Uint8Array,
    extra: Record<string, string> = {},
  ): StoredDriveFile {
    return this.store(
      {
        name: key,
        appProperties: {
          tb_vault: vaultId,
          tb_key: driveMetadataKey(key),
          tb_hash: sha256Bytes(bytes),
          tb_kind: kind,
          ...extra,
        },
      },
      bytes,
    );
  }

  record(
    file: StoredDriveFile,
    kind: DriveObjectKind,
    head: DeviceHead | null,
  ): DriveFileRecord {
    return {
      fileId: file.id,
      logicalKey: file.name,
      kind,
      contentSha256: file.sha256Checksum,
      byteCount: file.bytes.byteLength,
      createdAt: Date.parse(file.createdTime),
      head,
    };
  }

  cursor(): string {
    return String(this.sequence);
  }

  private store(
    metadata: { name: string; appProperties: Record<string, string> },
    bytes: Uint8Array,
    existingId?: string,
  ): StoredDriveFile {
    const id = existingId ?? `drive-file-${++this.nextId}`;
    const hash = sha256Bytes(bytes);
    const stored: StoredDriveFile = {
      id,
      name: metadata.name,
      size: String(bytes.byteLength),
      createdTime: '2026-08-15T00:00:00.000Z',
      sha256Checksum: hash,
      appProperties: { ...metadata.appProperties },
      trashed: false,
      bytes: bytes.slice(),
    };
    this.files.set(id, stored);
    this.recordChange(id, false);
    return stored;
  }

  private recordChange(fileId: string, removed: boolean): void {
    this.sequence += 1;
    this.changes.push({ sequence: this.sequence, fileId, removed });
  }

  private publicFile(file: StoredDriveFile) {
    const { bytes: _bytes, ...metadata } = file;
    return structuredClone(metadata);
  }

  private matches(file: StoredDriveFile, query: string): boolean {
    const vault = /key='tb_vault' and value='([^']+)'/.exec(query)?.[1];
    if (vault && file.appProperties.tb_vault !== vault) return false;
    const exactNames = [...query.matchAll(/name = '([^']+)'/g)].map((match) => match[1]);
    if (exactNames.length > 0 && !exactNames.includes(file.name)) return false;
    const prefixes = [...query.matchAll(/name contains '([^']+)'/g)].map(
      (match) => match[1],
    );
    if (prefixes.length > 0 && !prefixes.some((prefix) => file.name.startsWith(prefix)))
      return false;
    const kinds = [...query.matchAll(/key='tb_kind' and value='([^']+)'/g)].map(
      (match) => match[1],
    );
    if (kinds.length > 0 && !kinds.includes(file.appProperties.tb_kind)) return false;
    const key = /key='tb_key' and value='([^']+)'/.exec(query)?.[1];
    if (key && file.appProperties.tb_key !== key) return false;
    return !file.trashed;
  }
}

const vaultId = 'vault-drive-test';

function head(deviceId: string, sequence: number, snapshotId: string): DeviceHead {
  return {
    format: 'tackbok-device-head',
    vaultId,
    deviceId,
    deviceSequence: sequence,
    snapshotId,
    updatedAt: 1,
  };
}

function representativePresentlyPayload(deviceId: string): JournalSnapshotPayload {
  return {
    format: 'tackbok-snapshot',
    vaultId,
    parentSnapshotIds: [],
    observedDeviceHeads: [],
    authorDeviceId: deviceId,
    deviceSequence: 1,
    createdAt: 1,
    entries: Array.from({ length: 2_000 }, (_, index) => ({
      entryId: `presently-${index.toString().padStart(6, '0')}`,
      title: null,
      content: `Synthetic import row ${index}`,
      mood: null,
      createdAt: index + 1,
      updatedAt: index + 1,
      conflictOriginId: null,
    })),
    tags: [],
    entryTags: [],
    prompts: [],
    profile: {
      profileId: 'profile',
      displayName: null,
      photoAssetId: null,
      updatedAt: 1,
    },
    media: [],
    tombstones: [],
    conflicts: [],
  };
}

function provider(
  server: FakeDriveServer,
  state = new MemoryDriveProviderStateStore(),
  instrumentation?: MemoryDriveInstrumentation,
  auth: CloudAuthorization = new FakeAuth(),
) {
  return new GoogleDriveSnapshotProvider({
    auth,
    state,
    fetch: server.fetch,
    instrumentation,
    sleep: async () => {},
    random: () => 0,
    now: () => 1_800_000_000_000,
  });
}

describe('GoogleDriveSnapshotProvider', () => {
  test('a 403 Retry-After survives a cancelled error body and blocks the next request', async () => {
    const state = new MemoryDriveProviderStateStore();
    let controller = new AbortController();
    let calls = 0;
    let markReading!: () => void;
    const reading = new Promise<void>((resolve) => (markReading = resolve));
    const transport = new DriveTransport({
      auth: new FakeAuth(),
      state,
      signal: () => controller.signal,
      now: () => 0,
      random: () => 0,
      sleep: async () => {},
      fetch: async () => {
        calls += 1;
        return {
          ok: false,
          status: 403,
          headers: { get: (name: string) => (name === 'retry-after' ? '120' : null) },
          json: () => {
            markReading();
            return new Promise(() => {});
          },
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
    });
    const request = () =>
      transport.request(
        vaultId,
        'list',
        'https://www.googleapis.com/drive/v3/files',
        {},
        {
          idempotent: true,
        },
      );
    const first = request();
    await reading;
    controller.abort();
    await expect(first).rejects.toBeInstanceOf(SyncCancelledError);
    expect(state.loadDiscovery(vaultId).retryNotBefore).toBe(120_000);

    controller = new AbortController();
    await expect(request()).rejects.toBeDefined();
    expect(calls).toBe(1);
  });

  test('a rejected request is not classified as corrupt cloud content', async () => {
    const fetch = jest.fn(async () => response(400));
    const transport = new DriveTransport({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      fetch,
      sleep: async () => {},
      random: () => 0,
      now: () => 1,
    });
    await expect(
      transport.request(
        vaultId,
        'list',
        'https://www.googleapis.com/drive/v3/files',
        {},
        { idempotent: true },
      ),
    ).rejects.toMatchObject({ code: 'invalid-request', status: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('maps a temporarily unavailable token refresh to a transient provider failure', async () => {
    const auth: CloudAuthorization = {
      authorize: async () => ({ accessToken: '', expiresAt: 0 }),
      getFreshAccessToken: async () => {
        throw new CloudAuthError('temporarily-unavailable', 'offline during refresh');
      },
      clearInvalidAccessToken: async () => {},
      signOut: async () => {},
      getAccountLabel: async () => 'Synthetic account',
    };

    await expect(
      provider(
        new FakeDriveServer(),
        new MemoryDriveProviderStateStore(),
        undefined,
        auth,
      ).listRevocations(vaultId),
    ).rejects.toMatchObject({ code: 'transient' });
  });

  test('one 2,000-entry snapshot publishes and fresh-restores within both request ceilings', async () => {
    const server = new FakeDriveServer();
    const encoded = encodeSnapshot(representativePresentlyPayload('device-import'));
    const importMetrics = new MemoryDriveInstrumentation('representative-import');
    const importing = provider(
      server,
      new MemoryDriveProviderStateStore(),
      importMetrics,
    );
    await importing.listRevocations(vaultId);
    await importing.listHeads(vaultId, true);
    await importing.uploadSnapshot(
      vaultId,
      encoded.snapshotId,
      encoded.compressedBytes,
      1,
    );
    expect(
      await importing.verifySnapshot(
        vaultId,
        encoded.snapshotId,
        encoded.compressedBytes,
      ),
    ).toBe(true);
    await importing.updateDeviceHead(
      vaultId,
      head('device-import', 1, encoded.snapshotId),
    );

    const restoreMetrics = new MemoryDriveInstrumentation('fresh-restore');
    const restoring = provider(
      server,
      new MemoryDriveProviderStateStore(),
      restoreMetrics,
    );
    await restoring.listRevocations(vaultId);
    const heads = await restoring.listHeads(vaultId, true);
    const downloaded = await restoring.downloadSnapshot(vaultId, encoded.snapshotId);
    expect(downloaded).not.toBeNull();
    expect(decodeSnapshot(downloaded!, encoded.snapshotId).payload.entries).toHaveLength(
      2_000,
    );
    await restoring.updateDeviceHead(
      vaultId,
      head('device-restore', 1, encoded.snapshotId),
    );

    expect(heads).toHaveLength(1);
    expect(importMetrics.report()).toMatchObject({ attempts: 7, retries: 0 });
    expect(restoreMetrics.report()).toMatchObject({ attempts: 8, retries: 0 });
    expect(
      [...server.files.values()].filter((file) => file.name.startsWith('snapshots/')),
    ).toHaveLength(1);
  });

  test('warm quiet sync and one text edit stay inside the approved request ceilings', async () => {
    const server = new FakeDriveServer();
    const state = new MemoryDriveProviderStateStore();
    const existingSnapshot = 'a'.repeat(64);
    const existingHead = head('device-budget', 1, existingSnapshot);
    const headFile = server.seed(
      vaultId,
      `heads/${existingHead.deviceId}.json`,
      'head',
      encodeCanonicalBytes(existingHead),
    );
    state.replaceInitialInventory(
      vaultId,
      [server.record(headFile, 'head', existingHead)],
      server.cursor(),
    );

    const quietMetrics = new MemoryDriveInstrumentation('warm-quiet-sync');
    const quiet = provider(server, state, quietMetrics);
    await quiet.listRevocations(vaultId);
    await quiet.listHeads(vaultId, true);
    await quiet.listHeads(vaultId, false);
    expect(quietMetrics.report()).toMatchObject({ attempts: 2, retries: 0 });

    const editMetrics = new MemoryDriveInstrumentation('one-text-edit');
    const edit = provider(server, state, editMetrics);
    await edit.listRevocations(vaultId);
    await edit.listHeads(vaultId, true);
    await edit.listHeads(vaultId, true);
    const bytes = new Uint8Array([31, 41, 59]);
    const snapshotId = 'b'.repeat(64);
    await edit.uploadSnapshot(vaultId, snapshotId, bytes, 2);
    expect(await edit.verifySnapshot(vaultId, snapshotId, bytes)).toBe(true);
    await edit.updateDeviceHead(vaultId, head('device-budget', 2, snapshotId));
    await edit.listHeads(vaultId, false);
    expect(editMetrics.report()).toMatchObject({ attempts: 5, retries: 0 });
  });

  test('duplicate physical heads remain visible and simultaneous device heads coexist', async () => {
    const server = new FakeDriveServer();
    const duplicate = head('device-duplicate', 1, 'c'.repeat(64));
    server.seed(
      vaultId,
      `heads/${duplicate.deviceId}.json`,
      'head',
      encodeCanonicalBytes(duplicate),
    );
    server.seed(
      vaultId,
      `heads/${duplicate.deviceId}.json`,
      'head',
      encodeCanonicalBytes(duplicate),
    );
    const first = provider(server);
    expect(await first.listHeads(vaultId, true)).toHaveLength(2);

    const second = provider(server);
    await second.updateDeviceHead(vaultId, head('device-second', 1, 'd'.repeat(64)));
    const observer = provider(server);
    const listed = await observer.listHeads(vaultId, true);
    expect(
      listed.filter((value) => value.head.deviceId === 'device-duplicate'),
    ).toHaveLength(2);
    expect(listed.some((value) => value.head.deviceId === 'device-second')).toBe(true);
  });

  test('discovery rejects an inconsistent logical head instead of hiding its branch', async () => {
    const server = new FakeDriveServer();
    const valid = head('device-valid', 1, 'c'.repeat(64));
    const invalid = head('device-invalid', 1, 'd'.repeat(64));
    server.seed(
      vaultId,
      `heads/${valid.deviceId}.json`,
      'head',
      encodeCanonicalBytes(valid),
    );
    const inconsistent = server.seed(
      vaultId,
      `heads/${invalid.deviceId}.json`,
      'head',
      encodeCanonicalBytes(invalid),
    );
    inconsistent.appProperties.tb_hash = '0'.repeat(64);

    await expect(provider(server).listHeads(vaultId, true)).rejects.toMatchObject({
      code: 'invalid-data',
    });
  });

  test('rejects oversized snapshots from metadata before downloading the body', async () => {
    const server = new FakeDriveServer();
    const snapshotId = 'f'.repeat(64);
    const oversized = server.seed(
      vaultId,
      `snapshots/${snapshotId}.json.gz`,
      'snapshot',
      new Uint8Array(16 * 1024 * 1024 + 1),
    );
    const state = new MemoryDriveProviderStateStore();
    state.replaceInitialInventory(
      vaultId,
      [server.record(oversized, 'snapshot', null)],
      server.cursor(),
    );

    const app = provider(server, state);
    await expect(app.downloadSnapshot(vaultId, snapshotId)).rejects.toMatchObject({
      code: 'invalid-data',
    });
    expect(server.calls).toHaveLength(0);
  });

  test('a lost immutable create response reconciles the created object without data loss', async () => {
    const server = new FakeDriveServer();
    const app = provider(server);
    server.failAfterNextCreate = true;
    const bytes = new Uint8Array([2, 7, 1, 8]);
    const snapshotId = 'e'.repeat(64);
    await expect(
      app.uploadSnapshot(vaultId, snapshotId, bytes, 1),
    ).resolves.toBeUndefined();
    expect(
      [...server.files.values()].filter(
        (file) => file.name === `snapshots/${snapshotId}.json.gz`,
      ),
    ).toHaveLength(1);
    await expect(app.downloadSnapshot(vaultId, snapshotId)).resolves.toEqual(bytes);
  });

  test('a lost response tolerates delayed exact-key visibility', async () => {
    const server = new FakeDriveServer();
    const app = provider(server);
    server.failAfterNextCreate = true;
    server.hideNextFileLists = 1;
    const bytes = new Uint8Array([1, 6, 1, 8]);
    const snapshotId = '9'.repeat(64);

    await expect(
      app.uploadSnapshot(vaultId, snapshotId, bytes, 1),
    ).resolves.toBeUndefined();
    expect(server.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    await expect(app.downloadSnapshot(vaultId, snapshotId)).resolves.toEqual(bytes);
  });

  test('a server retry window is durable and manual retry issues no request inside it', async () => {
    const state = new MemoryDriveProviderStateStore();
    let attempts = 0;
    const sleeps: number[] = [];
    const limitedFetch: DriveFetchLike = async () => {
      attempts += 1;
      return response(429, {}, undefined, { 'retry-after': '60' });
    };
    const first = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: limitedFetch,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      now: () => 1_000,
      random: () => 0,
    });
    await expect(first.listRevocations(vaultId)).rejects.toMatchObject({
      code: 'rate-limited',
    });
    // A 60 s Retry-After exceeds what one pass waits: no early retry.
    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
    expect(state.loadDiscovery(vaultId).retryNotBefore).toBe(61_000);

    const reconstructed = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: limitedFetch,
      sleep: async () => {},
      now: () => 2_000,
      random: () => 0,
    });
    await expect(reconstructed.listRevocations(vaultId)).rejects.toMatchObject({
      code: 'rate-limited',
    });
    expect(attempts).toBe(1);
  });

  test('Retry-After is never shortened and the durable window is rechecked before each attempt', async () => {
    let now = 0;
    const requests: number[] = [];
    const transport = (
      fetch: DriveFetchLike,
      state = new MemoryDriveProviderStateStore(),
    ) =>
      new DriveTransport({
        auth: new FakeAuth(),
        state,
        fetch,
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
        random: () => 0,
        now: () => now,
      });
    const request = (target: DriveTransport) =>
      target.request(
        vaultId,
        'list',
        'https://www.googleapis.com/drive/v3/files',
        {},
        { idempotent: true },
      );

    // A short server delay is waited out in full, never cut.
    await expect(
      request(
        transport(async () => {
          requests.push(now);
          return requests.length === 1
            ? response(429, {}, undefined, { 'retry-after': '20' })
            : response(200);
        }),
      ),
    ).resolves.toMatchObject({ status: 200 });
    expect(requests).toEqual([0, 20_000]);

    // A delay longer than the pass waits ends the pass without another request.
    requests.length = 0;
    now = 0;
    await expect(
      request(
        transport(async () => {
          requests.push(now);
          return response(429, {}, undefined, { 'retry-after': '120' });
        }),
      ),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    expect(requests).toEqual([0]);

    // A window recorded by another request during backoff blocks the retry.
    requests.length = 0;
    now = 0;
    const shared = new MemoryDriveProviderStateStore();
    await expect(
      request(
        transport(async () => {
          requests.push(now);
          shared.setRetryNotBefore(vaultId, now + 120_000);
          return response(503);
        }, shared),
      ),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    expect(requests).toEqual([0]);
  });

  test('retry waits are reported with when they end, then cleared', async () => {
    let now = 0;
    const waits: unknown[] = [];
    let attempt = 0;
    const transport = new DriveTransport({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      fetch: async () => {
        attempt += 1;
        if (attempt === 1) return response(429, {}, undefined, { 'retry-after': '20' });
        if (attempt === 2) return response(503);
        throw new Error('network down');
      },
      sleep: async (milliseconds) => {
        waits.push({ sleptAt: now });
        now += milliseconds;
      },
      random: () => 0,
      now: () => now,
      onProgress: (report) => waits.push(report),
    });
    await expect(
      transport.request(
        vaultId,
        'list',
        'https://www.googleapis.com/drive/v3/files',
        {},
        { idempotent: true },
      ),
    ).rejects.toMatchObject({ code: 'transient' });
    expect(waits).toEqual([
      // Google's Retry-After, shown as a slow-down with its countdown.
      { type: 'wait', reason: 'rate-limited', until: 20_000 },
      { sleptAt: 0 },
      { type: 'wait', reason: null },
      // A server error without Retry-After backs off as a connection problem.
      { type: 'wait', reason: 'retry-backoff', until: 20_000 + 2_000 },
      { sleptAt: 20_000 },
      { type: 'wait', reason: null },
    ]);
  });

  test('cancelling a pass stops a hung request, its backoff and its body read promptly', async () => {
    const controller = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const hung = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      // Never settles on its own, like a stalled connection.
      fetch: (_url, init = {}) => {
        fetchSignal = init.signal as AbortSignal;
        return new Promise<DriveResponseLike>(() => {});
      },
      signal: () => controller.signal,
    });
    const listing = hung.listRevocations(vaultId);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(listing).rejects.toBeInstanceOf(SyncCancelledError);
    expect(fetchSignal?.aborted).toBe(true);

    const backoff = new AbortController();
    let attempts = 0;
    const retrying = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      fetch: async () => {
        attempts += 1;
        return response(503);
      },
      sleep: () => new Promise<void>(() => {}),
      random: () => 0,
      signal: () => backoff.signal,
    });
    const retried = retrying.listRevocations(vaultId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    backoff.abort();
    await expect(retried).rejects.toBeInstanceOf(SyncCancelledError);
    expect(attempts).toBe(1);

    const reading = new AbortController();
    const stalledBody: DriveResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => ({ read: () => new Promise(() => {}) }) },
      json: () => new Promise(() => {}),
      arrayBuffer: () => new Promise(() => {}),
    };
    const reader = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      fetch: async () => stalledBody,
      signal: () => reading.signal,
    });
    const read = reader.listRevocations(vaultId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    reading.abort();
    await expect(read).rejects.toBeInstanceOf(SyncCancelledError);
  });

  test('a stalled response times out as a transient failure, not a cancellation', async () => {
    jest.useFakeTimers();
    try {
      let attempts = 0;
      const transport = new DriveTransport({
        auth: new FakeAuth(),
        state: new MemoryDriveProviderStateStore(),
        fetch: () => {
          attempts += 1;
          return new Promise<DriveResponseLike>(() => {});
        },
        sleep: async () => {},
        random: () => 0,
        now: () => 1,
      });
      const pending = transport.request(
        vaultId,
        'create',
        'https://www.googleapis.com/upload/drive/v3/files',
        { method: 'POST' },
        { idempotent: false },
      );
      const outcome = expect(pending).rejects.toMatchObject({
        code: 'transient',
        message: 'Google Drive request timed out',
      });
      await jest.advanceTimersByTimeAsync(59_999);
      expect(attempts).toBe(1);
      await jest.advanceTimersByTimeAsync(1);
      await outcome;
    } finally {
      jest.useRealTimers();
    }
  });

  test('a timed-out 403 error body is a transient failure, never a permission pause', async () => {
    jest.useFakeTimers();
    try {
      const transport = new DriveTransport({
        auth: new FakeAuth(),
        state: new MemoryDriveProviderStateStore(),
        fetch: async () => ({ ...response(403), json: () => new Promise(() => {}) }),
        sleep: async () => {},
        random: () => 0,
        now: () => 1,
      });
      const outcome = expect(
        transport.request(
          vaultId,
          'list',
          'https://www.googleapis.com/drive/v3/files',
          {},
          { idempotent: false },
        ),
      ).rejects.toMatchObject({ code: 'transient', status: 403 });
      await jest.advanceTimersByTimeAsync(60_000);
      await outcome;
    } finally {
      jest.useRealTimers();
    }
  });

  test('a token refresh that fails after cancellation records no provider failure', async () => {
    const controller = new AbortController();
    let fetches = 0;
    const transport = new DriveTransport({
      auth: Object.assign(new FakeAuth(), {
        getFreshAccessToken: async () => {
          controller.abort();
          throw new CloudAuthError('consent-required', 'synthetic consent required');
        },
      }),
      state: new MemoryDriveProviderStateStore(),
      fetch: async () => {
        fetches += 1;
        return response(200);
      },
      sleep: async () => {},
      random: () => 0,
      now: () => 1,
      signal: () => controller.signal,
    });
    await expect(
      transport.request(
        vaultId,
        'list',
        'https://www.googleapis.com/drive/v3/files',
        {},
        { idempotent: true },
      ),
    ).rejects.toBeInstanceOf(SyncCancelledError);
    expect(fetches).toBe(0);
  });

  test('a 503 Retry-After window is durable and a window extended during token refresh blocks the send', async () => {
    const state = new MemoryDriveProviderStateStore();
    const requests: number[] = [];
    const unavailable = new DriveTransport({
      auth: new FakeAuth(),
      state,
      fetch: async () => {
        requests.push(0);
        return response(503, {}, undefined, { 'retry-after': '120' });
      },
      sleep: async () => {},
      random: () => 0,
      now: () => 0,
    });
    const request = (target: DriveTransport) =>
      target.request(
        vaultId,
        'list',
        'https://www.googleapis.com/drive/v3/files',
        {},
        { idempotent: true },
      );
    await expect(request(unavailable)).rejects.toMatchObject({ code: 'transient' });
    await expect(request(unavailable)).rejects.toMatchObject({ code: 'rate-limited' });
    expect(requests).toEqual([0]);
    expect(state.loadDiscovery(vaultId).retryNotBefore).toBe(120_000);
    // A shorter later window never shortens the recorded one.
    const shorter = new DriveTransport({
      auth: new FakeAuth(),
      state,
      fetch: async () => response(429, {}, undefined, { 'retry-after': '1' }),
      sleep: async () => {},
      random: () => 0,
      now: () => 200_000,
    });
    await expect(request(shorter)).rejects.toMatchObject({ code: 'rate-limited' });
    expect(state.loadDiscovery(vaultId).retryNotBefore).toBe(201_000);

    const shared = new MemoryDriveProviderStateStore();
    let fetches = 0;
    const extended = new DriveTransport({
      auth: Object.assign(new FakeAuth(), {
        getFreshAccessToken: async () => {
          // Another request records a server window while this token refreshes.
          shared.setRetryNotBefore(vaultId, 120_000);
          return 'synthetic-access';
        },
      }),
      state: shared,
      fetch: async () => {
        fetches += 1;
        return response(200);
      },
      sleep: async () => {},
      random: () => 0,
      now: () => 0,
    });
    await expect(request(extended)).rejects.toMatchObject({ code: 'rate-limited' });
    expect(fetches).toBe(0);
  });

  test('completed and aborted requests leave no listeners on the pass signal or live timers', async () => {
    const controller = new AbortController();
    const listeners = new Set<unknown>();
    const signal = controller.signal;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    jest
      .spyOn(signal, 'addEventListener')
      .mockImplementation((type, listener, options) => {
        listeners.add(listener);
        add(type, listener, options);
      });
    jest
      .spyOn(signal, 'removeEventListener')
      .mockImplementation((type, listener, options) => {
        listeners.delete(listener);
        remove(type, listener, options);
      });
    let next: DriveResponseLike = response(200);
    const transport = new DriveTransport({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      fetch: async () => next,
      sleep: async () => {},
      random: () => 0,
      now: () => 1,
      signal: () => signal,
    });
    const request = () =>
      transport.request(
        vaultId,
        'list',
        'https://www.googleapis.com/drive/v3/files',
        {},
        { idempotent: true },
      );
    for (let index = 0; index < 20; index += 1) await (await request()).json();
    // A response whose body is never read retains nothing either.
    await request();
    expect(listeners.size).toBe(0);

    jest.useFakeTimers();
    try {
      next = { ...response(200), json: () => new Promise(() => {}) };
      const reading = (await request()).json();
      expect(jest.getTimerCount()).toBe(1);
      controller.abort();
      await expect(reading).rejects.toBeInstanceOf(SyncCancelledError);
      expect(jest.getTimerCount()).toBe(0);
      expect(listeners.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('an expired change cursor rebuilds the prefix-scoped inventory', async () => {
    const server = new FakeDriveServer();
    const remote = head('device-cursor', 1, 'f'.repeat(64));
    server.seed(
      vaultId,
      `heads/${remote.deviceId}.json`,
      'head',
      encodeCanonicalBytes(remote),
    );
    const state = new MemoryDriveProviderStateStore();
    state.replaceInitialInventory(vaultId, [], 'expired-cursor');
    const app = provider(server, state);

    await expect(app.listHeads(vaultId, true)).resolves.toMatchObject([{ head: remote }]);
    expect(state.loadDiscovery(vaultId)).toMatchObject({
      inventoryComplete: true,
      cursor: server.cursor(),
    });
  });

  test('discovery rebuild is bounded when Drive rejects each fresh cursor', async () => {
    const server = new FakeDriveServer();
    server.rejectChangeCursors = 2;

    await expect(provider(server).listHeads(vaultId, true)).rejects.toMatchObject({
      code: 'transient',
    });
    expect(
      server.calls.filter((call) => call.url.includes('/changes/startPageToken')),
    ).toHaveLength(2);
    expect(
      server.calls.filter(
        (call) => call.url.includes('/changes?') && !call.url.includes('startPageToken'),
      ),
    ).toHaveLength(2);
  });

  test('vault discovery validates head bodies and returns no Drive identifiers', async () => {
    const server = new FakeDriveServer();
    const olderVault = 'vault-discovery-older';
    const newerVault = 'vault-discovery-newer';
    const olderHead: DeviceHead = {
      ...head('device-older', 1, '3'.repeat(64)),
      vaultId: olderVault,
      updatedAt: 10,
    };
    const newerHead: DeviceHead = {
      ...head('device-newer', 1, '4'.repeat(64)),
      vaultId: newerVault,
      updatedAt: 20,
    };
    server.seed(
      olderVault,
      'heads/device-older.json',
      'head',
      encodeCanonicalBytes(olderHead),
    );
    server.seed(
      newerVault,
      'heads/device-newer.json',
      'head',
      encodeCanonicalBytes(newerHead),
    );
    server.seed(
      'vault-invalid',
      'heads/device-invalid.json',
      'head',
      encodeCanonicalBytes(olderHead),
    );

    await expect(provider(server).listAvailableVaults()).resolves.toEqual([
      { vaultId: newerVault, updatedAt: 20 },
      { vaultId: olderVault, updatedAt: 10 },
    ]);
  });

  test('initial discovery survives one eventually-consistent empty prefix listing', async () => {
    const server = new FakeDriveServer();
    const remote = head('device-eventual', 1, '0'.repeat(64));
    server.seed(
      vaultId,
      `heads/${remote.deviceId}.json`,
      'head',
      encodeCanonicalBytes(remote),
    );
    server.hideNextFileLists = 1;
    const metrics = new MemoryDriveInstrumentation('fresh-eventual-list');

    await expect(
      provider(server, new MemoryDriveProviderStateStore(), metrics).listHeads(
        vaultId,
        true,
      ),
    ).resolves.toMatchObject([{ head: remote }]);
    expect(metrics.report()).toMatchObject({
      attempts: 5,
      byMethod: { 'start-token': 1, list: 3, download: 1 },
    });
  });

  test('cursor catch-up reuses an identical cached head without redownloading its body', async () => {
    const server = new FakeDriveServer();
    const remote = head('device-cached-change', 1, '8'.repeat(64));
    const stored = server.seed(
      vaultId,
      `heads/${remote.deviceId}.json`,
      'head',
      encodeCanonicalBytes(remote),
    );
    const state = new MemoryDriveProviderStateStore();
    state.replaceInitialInventory(vaultId, [server.record(stored, 'head', remote)], '0');
    const metrics = new MemoryDriveInstrumentation('cached-change-catch-up');

    await expect(
      provider(server, state, metrics).listHeads(vaultId, true),
    ).resolves.toMatchObject([{ head: remote }]);
    expect(metrics.report()).toMatchObject({ attempts: 1, byMethod: { list: 1 } });
  });

  test('a pre-publication recheck discovers a head hidden from the first change read', async () => {
    const server = new FakeDriveServer();
    const state = new MemoryDriveProviderStateStore();
    state.replaceInitialInventory(vaultId, [], '0');
    const remote = head('device-delayed-change', 1, '7'.repeat(64));
    server.seed(
      vaultId,
      `heads/${remote.deviceId}.json`,
      'head',
      encodeCanonicalBytes(remote),
    );
    server.hideNextChangeLists = 1;
    const app = provider(server, state);

    await expect(app.listHeads(vaultId, true)).resolves.toEqual([]);
    await expect(app.listHeads(vaultId, true)).resolves.toMatchObject([{ head: remote }]);
  });

  test('unknown media hashes use bounded grouped existence queries', async () => {
    const server = new FakeDriveServer();
    const hashes: string[] = [];
    for (let index = 0; index < 51; index += 1) {
      const bytes = new TextEncoder().encode(`synthetic-media-${index}`);
      const hash = sha256Bytes(bytes);
      hashes.push(hash);
      server.seed(vaultId, `media/${hash.slice(0, 2)}/${hash}`, 'media', bytes);
    }
    const metrics = new MemoryDriveInstrumentation('grouped-media-existence');
    const app = provider(server, new MemoryDriveProviderStateStore(), metrics);
    expect(await app.hasMediaBatch(vaultId, hashes)).toEqual(new Set(hashes));
    expect(metrics.report()).toMatchObject({ attempts: 2, byMethod: { list: 2 } });
  });

  test('snapshot deletion is permanent and repeated deletion is idempotent', async () => {
    const server = new FakeDriveServer();
    const state = new MemoryDriveProviderStateStore();
    const snapshotId = '1'.repeat(64);
    const bytes = new Uint8Array([9, 9, 9]);
    const stored = server.seed(
      vaultId,
      `snapshots/${snapshotId}.json.gz`,
      'snapshot',
      bytes,
    );
    state.replaceInitialInventory(
      vaultId,
      [server.record(stored, 'snapshot', null)],
      server.cursor(),
    );
    const app = provider(server, state);

    await app.deleteSnapshot(vaultId, snapshotId);
    await app.deleteSnapshot(vaultId, snapshotId);
    expect([...server.files.values()].some((file) => file.id === stored.id)).toBe(false);
    await expect(app.downloadSnapshot(vaultId, snapshotId)).resolves.toBeNull();
  });

  test('cleanup interruption leaves excess history and the next delete resumes safely', async () => {
    const server = new FakeDriveServer();
    const state = new MemoryDriveProviderStateStore();
    const snapshotId = '2'.repeat(64);
    const bytes = new Uint8Array([8, 6, 7, 5]);
    const first = server.seed(
      vaultId,
      `snapshots/${snapshotId}.json.gz`,
      'snapshot',
      bytes,
    );
    const second = server.seed(
      vaultId,
      `snapshots/${snapshotId}.json.gz`,
      'snapshot',
      bytes,
    );
    state.replaceInitialInventory(
      vaultId,
      [server.record(first, 'snapshot', null), server.record(second, 'snapshot', null)],
      server.cursor(),
    );
    let failures = 3;
    const interruptedFetch: DriveFetchLike = async (url, init) => {
      if (
        String(init?.method ?? 'GET') === 'DELETE' &&
        url.includes(second.id) &&
        failures > 0
      ) {
        failures -= 1;
        throw new Error('synthetic interrupted cleanup');
      }
      return server.fetch(url, init);
    };
    const interrupted = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: interruptedFetch,
      sleep: async () => {},
      random: () => 0,
    });
    await expect(interrupted.deleteSnapshot(vaultId, snapshotId)).rejects.toMatchObject({
      code: 'transient',
    });
    expect(
      [...server.files.values()].filter((file) => file.name.includes(snapshotId)),
    ).toHaveLength(1);

    await provider(server, state).deleteSnapshot(vaultId, snapshotId);
    expect(
      [...server.files.values()].filter((file) => file.name.includes(snapshotId)),
    ).toHaveLength(0);
  });

  test('a persisted resumable session continues at the Drive-reported chunk boundary', async () => {
    const state = new MemoryDriveProviderStateStore();
    const bytes = new Uint8Array(5 * 1024 * 1024 + 7);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    const hash = sha256Bytes(bytes);
    const key = `media/${hash.slice(0, 2)}/${hash}`;
    const uri = 'https://www.googleapis.com/upload/snapshot-test-session';
    state.setUploadSession(vaultId, {
      logicalKey: key,
      contentSha256: hash,
      uri,
      expiresAt: Date.now() + 60_000,
      byteCount: bytes.byteLength,
      uploadedBytes: 0,
    });
    const ranges: string[] = [];
    const fetch: DriveFetchLike = async (url, init = {}) => {
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer synthetic-access');
      if (url !== uri) throw new Error(`Unexpected request ${url}`);
      const range = headers['Content-Range'];
      ranges.push(range);
      if (range === `bytes */${bytes.byteLength}`) {
        return response(308, {}, undefined, { range: `bytes=0-${256 * 1024 - 1}` });
      }
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)!;
      const final = Number(match[2]) + 1 === bytes.byteLength;
      if (!final) return response(308);
      return response(200, {
        id: 'resumed-media',
        name: key,
        size: String(bytes.byteLength),
        createdTime: '2026-08-15T00:00:00.000Z',
        sha256Checksum: hash,
        appProperties: {
          tb_vault: vaultId,
          tb_key: driveMetadataKey(key),
          tb_hash: hash,
          tb_kind: 'media',
        },
      });
    };
    const progress: number[] = [];
    const resumed = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch,
      sleep: async () => {},
      random: () => 0,
      onProgress: (report) => {
        if (report.type === 'bytes' && report.key === key) progress.push(report.done);
      },
    });

    const reads: { offset: number; length: number }[] = [];
    await resumed.uploadMedia(vaultId, hash, {
      byteLength: bytes.byteLength,
      contentHash: hash,
      read: async (offset, length) => {
        reads.push({ offset, length });
        return bytes.slice(offset, offset + length);
      },
    });
    expect(ranges[0]).toBe(`bytes */${bytes.byteLength}`);
    expect(ranges[1]).toBe(
      `bytes ${256 * 1024}-${bytes.byteLength - 1}/${bytes.byteLength}`,
    );
    expect(reads).toEqual([
      {
        offset: 256 * 1024,
        length: bytes.byteLength - 256 * 1024,
      },
    ]);
    expect(state.getUploadSession(vaultId, key, hash)).toBeNull();
    // Progress starts at the resumed offset and advances per uploaded chunk.
    expect(progress).toEqual([256 * 1024, bytes.byteLength, bytes.byteLength]);
  });

  test('a multipart media upload hashes each photo exactly once, with the injected hasher', async () => {
    const server = new FakeDriveServer();
    const hashed: Uint8Array[] = [];
    const app = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      fetch: server.fetch,
      sleep: async () => {},
      random: () => 0,
      hashBytes: async (bytes) => {
        hashed.push(bytes);
        return sha256Bytes(bytes);
      },
    });
    const photos = ['synthetic-photo-one', 'synthetic-photo-two'].map((text) =>
      new TextEncoder().encode(text),
    );
    for (const bytes of photos) {
      const hash = sha256Bytes(bytes);
      await app.uploadMedia(vaultId, hash, {
        byteLength: bytes.byteLength,
        contentHash: hash,
        read: async (offset, length) => bytes.slice(offset, offset + length),
      });
    }
    expect(hashed).toEqual(photos);
    // The verified hash is the one Drive stores as the object's metadata hash.
    for (const bytes of photos) {
      const hash = sha256Bytes(bytes);
      const stored = [...server.files.values()].find(
        (file) => file.name === `media/${hash.slice(0, 2)}/${hash}`,
      );
      expect(stored?.appProperties.tb_hash).toBe(hash);
    }

    // Re-uploading cached media neither reads nor hashes it again.
    const hash = sha256Bytes(photos[0]);
    await app.uploadMedia(vaultId, hash, {
      byteLength: photos[0].byteLength,
      contentHash: hash,
      read: async () => {
        throw new Error('cached media must not be read');
      },
    });
    expect(hashed).toHaveLength(2);
  });

  test('media whose bytes no longer match their hash is rejected before upload', async () => {
    const server = new FakeDriveServer();
    const app = provider(server);
    const bytes = new TextEncoder().encode('synthetic-photo-before-edit');
    const hash = sha256Bytes(bytes);
    await expect(
      app.uploadMedia(vaultId, hash, {
        byteLength: bytes.byteLength,
        contentHash: hash,
        read: async () => new TextEncoder().encode('synthetic-photo-after-edit!'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-data' });
    expect(server.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  test('a media download resumes into a durable sink without returning whole-file bytes', async () => {
    const state = new MemoryDriveProviderStateStore();
    const bytes = new TextEncoder().encode('synthetic-resumable-media-download');
    const hash = sha256Bytes(bytes);
    const key = `media/${hash.slice(0, 2)}/${hash}`;
    state.upsertFile(vaultId, {
      fileId: 'media-download-file',
      logicalKey: key,
      kind: 'media',
      contentSha256: hash,
      byteCount: bytes.byteLength,
      createdAt: 1,
      head: null,
    });
    let partial = bytes.slice(0, 9);
    let requestedRange: string | undefined;
    let promoted = false;
    const progress: number[] = [];
    const app = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: async (_url, init = {}) => {
        requestedRange = (init.headers as Record<string, string>).Range;
        return response(206, {}, bytes.slice(partial.byteLength));
      },
      sleep: async () => {},
      random: () => 0,
      onProgress: (report) => {
        if (report.type === 'bytes') progress.push(report.done);
      },
    });

    await expect(
      app.downloadMedia(vaultId, hash, {
        byteLength: async () => partial.byteLength,
        appendAndSync: async (chunk) => {
          const next = new Uint8Array(partial.byteLength + chunk.byteLength);
          next.set(partial);
          next.set(chunk, partial.byteLength);
          partial = next;
        },
        reset: async () => {
          partial = new Uint8Array();
        },
        verifyAndPromote: async (expectedBytes, expectedHash) => {
          expect(partial).toEqual(bytes);
          expect(expectedBytes).toBe(bytes.byteLength);
          expect(expectedHash).toBe(hash);
          promoted = true;
        },
      }),
    ).resolves.toBe(true);
    expect(requestedRange).toBe('bytes=9-');
    expect(promoted).toBe(true);
    // Reported per read, from the resumed offset to the whole file.
    expect(progress[0]).toBe(9);
    expect(progress.at(-1)).toBe(bytes.byteLength);
  });

  test('a server that ignores a media Range request resets the partial before appending', async () => {
    const state = new MemoryDriveProviderStateStore();
    const bytes = new TextEncoder().encode('synthetic-range-reset-media');
    const hash = sha256Bytes(bytes);
    const key = `media/${hash.slice(0, 2)}/${hash}`;
    state.upsertFile(vaultId, {
      fileId: 'media-range-reset',
      logicalKey: key,
      kind: 'media',
      contentSha256: hash,
      byteCount: bytes.byteLength,
      createdAt: 1,
      head: null,
    });
    let partial = new Uint8Array([1, 2, 3]);
    let resets = 0;
    const app = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: async () => response(200, {}, bytes),
      sleep: async () => {},
      random: () => 0,
    });
    await expect(
      app.downloadMedia(vaultId, hash, {
        byteLength: async () => partial.byteLength,
        appendAndSync: async (chunk) => {
          partial = chunk.slice();
        },
        reset: async () => {
          resets += 1;
          partial = new Uint8Array();
        },
        verifyAndPromote: async () => {
          expect(partial).toEqual(bytes);
        },
      }),
    ).resolves.toBe(true);
    expect(resets).toBe(1);
  });

  test('the 200 MiB media boundary remains chunk-bounded in both directions', async () => {
    const byteCount = 200 * 1024 * 1024;
    const hash = 'a'.repeat(64);
    const key = `media/${hash.slice(0, 2)}/${hash}`;
    const sessionUri = 'https://www.googleapis.com/upload/snapshot-200mib-session';
    const uploadState = new MemoryDriveProviderStateStore();
    let maximumUploadBody = 0;
    let uploaded = 0;
    const uploadFetch: DriveFetchLike = async (url, init = {}) => {
      if (url.includes('uploadType=resumable') && init.method === 'POST') {
        return response(200, {}, undefined, { location: sessionUri });
      }
      if (url !== sessionUri) throw new Error(`Unexpected request ${url}`);
      const body = init.body as Uint8Array;
      maximumUploadBody = Math.max(maximumUploadBody, body.byteLength);
      uploaded += body.byteLength;
      if (uploaded < byteCount)
        return response(308, {}, undefined, {
          range: `bytes=0-${uploaded - 1}`,
        });
      return response(200, {
        id: 'media-200mib',
        name: key,
        size: String(byteCount),
        createdTime: '2026-08-15T00:00:00.000Z',
        sha256Checksum: hash,
        appProperties: {
          tb_vault: vaultId,
          tb_key: driveMetadataKey(key),
          tb_hash: hash,
          tb_kind: 'media',
        },
      });
    };
    const uploadProvider = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state: uploadState,
      fetch: uploadFetch,
      sleep: async () => {},
      random: () => 0,
    });
    let maximumRead = 0;
    await uploadProvider.uploadMedia(vaultId, hash, {
      byteLength: byteCount,
      contentHash: hash,
      read: async (_offset, length) => {
        maximumRead = Math.max(maximumRead, length);
        return new Uint8Array(length);
      },
    });
    expect(uploaded).toBe(byteCount);
    expect(maximumRead).toBe(8 * 1024 * 1024);
    expect(maximumUploadBody).toBe(8 * 1024 * 1024);

    const downloadState = new MemoryDriveProviderStateStore();
    downloadState.upsertFile(vaultId, {
      fileId: 'media-200mib',
      logicalKey: key,
      kind: 'media',
      contentSha256: hash,
      byteCount,
      createdAt: 1,
      head: null,
    });
    let delivered = 0;
    const oneMiB = 1024 * 1024;
    const downloadResponse: DriveResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () =>
            delivered === byteCount
              ? { done: true }
              : (() => {
                  const length = Math.min(oneMiB, byteCount - delivered);
                  delivered += length;
                  return { done: false, value: new Uint8Array(length) };
                })(),
        }),
      },
      json: async () => ({}),
      arrayBuffer: async () => {
        throw new Error('whole-media arrayBuffer forbidden');
      },
    };
    const downloadProvider = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state: downloadState,
      fetch: async () => downloadResponse,
      sleep: async () => {},
      random: () => 0,
    });
    let persisted = 0;
    let maximumAppend = 0;
    await expect(
      downloadProvider.downloadMedia(vaultId, hash, {
        byteLength: async () => persisted,
        appendAndSync: async (chunk) => {
          maximumAppend = Math.max(maximumAppend, chunk.byteLength);
          persisted += chunk.byteLength;
        },
        reset: async () => {
          persisted = 0;
        },
        verifyAndPromote: async (expectedBytes, expectedHash) => {
          expect(expectedBytes).toBe(byteCount);
          expect(expectedHash).toBe(hash);
        },
      }),
    ).resolves.toBe(true);
    expect(persisted).toBe(byteCount);
    expect(maximumAppend).toBe(8 * 1024 * 1024);
  });

  test('a connection dropped mid-download is a retryable transient failure', async () => {
    const hash = 'b'.repeat(64);
    const state = new MemoryDriveProviderStateStore();
    state.upsertFile(vaultId, {
      fileId: 'media-interrupted',
      logicalKey: `media/${hash.slice(0, 2)}/${hash}`,
      kind: 'media',
      contentSha256: hash,
      byteCount: 2048,
      createdAt: 1,
      head: null,
    });
    let reads = 0;
    const interrupted: DriveResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () => {
            if (reads++ === 0) return { done: false, value: new Uint8Array(1024) };
            throw new TypeError('Network request failed');
          },
        }),
      },
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const provider = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: async () => interrupted,
      sleep: async () => {},
      random: () => 0,
    });
    await expect(
      provider.downloadMedia(vaultId, hash, {
        byteLength: async () => 0,
        appendAndSync: async () => {},
        reset: async () => {},
        verifyAndPromote: async () => {},
      }),
    ).rejects.toMatchObject({ code: 'transient' });
  });

  test('a download that breaks off shows a retry wait, then retries', async () => {
    const content = new Uint8Array(2048).fill(5);
    const hash = sha256Bytes(content);
    const state = new MemoryDriveProviderStateStore();
    state.upsertFile(vaultId, {
      fileId: 'media-retried',
      logicalKey: `media/${hash.slice(0, 2)}/${hash}`,
      kind: 'media',
      contentSha256: hash,
      byteCount: content.byteLength,
      createdAt: 1,
      head: null,
    });
    let fetches = 0;
    const reports: unknown[] = [];
    const provider = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: async () => {
        // The first response drops after half the file; the retry completes.
        const chunks =
          fetches++ === 0 ? [content.subarray(0, 1024)] : [content.subarray(0)];
        const dropped = fetches === 1;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: {
            getReader: () => ({
              read: async () => {
                const value = chunks.shift();
                if (value) return { done: false, value };
                if (dropped) throw new TypeError('Network request failed');
                return { done: true };
              },
            }),
          },
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
      sleep: async () => {},
      random: () => 0,
      now: () => 0,
      onProgress: (report) => {
        if (report.type === 'wait') reports.push(report);
      },
    });
    let persisted = new Uint8Array(0);
    await expect(
      provider.downloadMedia(vaultId, hash, {
        byteLength: async () => persisted.byteLength,
        appendAndSync: async (chunk) => {
          const next = new Uint8Array(persisted.byteLength + chunk.byteLength);
          next.set(persisted);
          next.set(chunk, persisted.byteLength);
          persisted = next;
        },
        reset: async () => {
          persisted = new Uint8Array(0);
        },
        verifyAndPromote: async () => {},
      }),
    ).resolves.toBe(true);
    expect(reports).toEqual([
      { type: 'wait', reason: 'retry-backoff', until: 1_000 },
      { type: 'wait', reason: null },
    ]);
    expect(fetches).toBe(2);
    expect(persisted).toEqual(content);
  });

  test('a media download cancelled mid-read stays a cancellation', async () => {
    const hash = 'c'.repeat(64);
    const state = new MemoryDriveProviderStateStore();
    state.upsertFile(vaultId, {
      fileId: 'media-cancelled',
      logicalKey: `media/${hash.slice(0, 2)}/${hash}`,
      kind: 'media',
      contentSha256: hash,
      byteCount: 2048,
      createdAt: 1,
      head: null,
    });
    const stalled: DriveResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => ({ read: () => new Promise(() => {}) }) },
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const controller = new AbortController();
    const provider = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: async () => stalled,
      signal: () => controller.signal,
    });
    const download = provider.downloadMedia(vaultId, hash, {
      byteLength: async () => 0,
      appendAndSync: async () => {},
      reset: async () => {},
      verifyAndPromote: async () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(download).rejects.toBeInstanceOf(SyncCancelledError);
  });

  test('a media stream longer than its declared size is cut off before it is written', async () => {
    const declared = new Uint8Array([7, 7, 7]);
    const hash = sha256Bytes(declared);
    const state = new MemoryDriveProviderStateStore();
    state.upsertFile(vaultId, {
      fileId: 'media-oversized',
      logicalKey: `media/${hash.slice(0, 2)}/${hash}`,
      kind: 'media',
      contentSha256: hash,
      byteCount: declared.byteLength,
      createdAt: 1,
      head: null,
    });
    let reads = 0;
    let cancelled = false;
    const endless: DriveResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          // Effectively endless (bounded only so a regression fails, not hangs).
          read: async () => {
            reads += 1;
            return reads > 64
              ? { done: true }
              : { done: false, value: new Uint8Array(1024) };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const app = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state,
      fetch: async () => endless,
    });
    let persisted = 0;
    let resets = 0;
    await expect(
      app.downloadMedia(vaultId, hash, {
        byteLength: async () => persisted,
        appendAndSync: async (chunk) => {
          persisted += chunk.byteLength;
        },
        reset: async () => {
          resets += 1;
          persisted = 0;
        },
        verifyAndPromote: async () => {
          throw new Error('must not promote');
        },
      }),
    ).rejects.toMatchObject({ code: 'transient' });
    expect(persisted).toBe(0);
    expect(reads).toBe(1);
    expect(cancelled).toBe(true);
    expect(resets).toBe(1);
  });

  describe('many small reads', () => {
    /** A body delivered in `chunkSize` reads, as Android streams a download. */
    function chunkedResponse(
      bytes: Uint8Array,
      chunkSize: number,
      progress: { reads: number; cancelled: boolean },
    ): DriveResponseLike {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: async () => {
              const start = progress.reads * chunkSize;
              if (start >= bytes.byteLength) return { done: true };
              progress.reads += 1;
              return { done: false, value: bytes.slice(start, start + chunkSize) };
            },
            cancel: async () => {
              progress.cancelled = true;
            },
          }),
        },
        json: async () => ({}),
        arrayBuffer: async () => {
          throw new Error('whole-body arrayBuffer forbidden');
        },
      };
    }

    function snapshotState(bytes: Uint8Array, declaredBytes = bytes.byteLength) {
      const snapshotId = 'd'.repeat(64);
      const state = new MemoryDriveProviderStateStore();
      state.upsertFile(vaultId, {
        fileId: 'snapshot-chunked',
        logicalKey: `snapshots/${snapshotId}.json.gz`,
        kind: 'snapshot',
        contentSha256: sha256Bytes(bytes),
        byteCount: declaredBytes,
        createdAt: 1,
        head: null,
      });
      return { snapshotId, state };
    }

    /** Counts Uint8Array allocations and their bytes while `work` runs. */
    async function countAllocations(work: () => Promise<unknown>) {
      const counts = { allocations: 0, bytes: 0 };
      const original = globalThis.Uint8Array;
      globalThis.Uint8Array = new Proxy(original, {
        construct(target, args, newTarget) {
          const created = Reflect.construct(target, args, newTarget) as Uint8Array;
          counts.allocations += 1;
          counts.bytes += created.byteLength;
          return created;
        },
      });
      try {
        await work();
      } finally {
        globalThis.Uint8Array = original;
      }
      return counts;
    }

    test('a snapshot is buffered once, whatever the number of reads', async () => {
      const bytes = new Uint8Array(256 * 1024).map((_, index) => index * 31);
      const { snapshotId, state } = snapshotState(bytes);
      const progress = { reads: 0, cancelled: false };
      const reports: number[] = [];
      const app = new GoogleDriveSnapshotProvider({
        auth: new FakeAuth(),
        state,
        fetch: async () => chunkedResponse(bytes, 64, progress),
        onProgress: (report) => {
          if (report.type === 'bytes') reports.push(report.done);
        },
      });
      let downloaded: Uint8Array | null = null;
      const counts = await countAllocations(async () => {
        downloaded = await app.downloadSnapshot(vaultId, snapshotId);
      });
      expect(downloaded).toEqual(bytes);
      expect(progress.reads).toBe(4096);
      // The declared-size buffer plus the hash's padded copy: not one copy per
      // read, and no chunk list concatenated at the end.
      expect(counts.allocations).toBeLessThanOrEqual(2);
      expect(counts.bytes).toBeLessThan(2 * bytes.byteLength + 1024);
      expect(reports).toHaveLength(4096);
      expect(reports.at(-1)).toBe(bytes.byteLength);
    });

    test('a snapshot stream longer than its declared size is cut off before it is buffered', async () => {
      const bytes = new Uint8Array(4096).fill(3);
      const { snapshotId, state } = snapshotState(bytes, 1024);
      const progress = { reads: 0, cancelled: false };
      const app = new GoogleDriveSnapshotProvider({
        auth: new FakeAuth(),
        state,
        fetch: async () => chunkedResponse(bytes, 1000, progress),
      });
      await expect(app.downloadSnapshot(vaultId, snapshotId)).rejects.toMatchObject({
        code: 'invalid-data',
      });
      expect(progress.reads).toBe(2);
      expect(progress.cancelled).toBe(true);
    });

    test('media is written in large batches, not once per read', async () => {
      const bytes = new Uint8Array(9 * 1024 * 1024).fill(5);
      const hash = sha256Bytes(bytes);
      const state = new MemoryDriveProviderStateStore();
      state.upsertFile(vaultId, {
        fileId: 'media-chunked',
        logicalKey: `media/${hash.slice(0, 2)}/${hash}`,
        kind: 'media',
        contentSha256: hash,
        byteCount: bytes.byteLength,
        createdAt: 1,
        head: null,
      });
      const progress = { reads: 0, cancelled: false };
      const app = new GoogleDriveSnapshotProvider({
        auth: new FakeAuth(),
        state,
        fetch: async () => chunkedResponse(bytes, 4096, progress),
      });
      const appends: number[] = [];
      await expect(
        app.downloadMedia(vaultId, hash, {
          byteLength: async () => appends.reduce((total, size) => total + size, 0),
          appendAndSync: async (chunk) => {
            appends.push(chunk.byteLength);
          },
          reset: async () => {
            appends.length = 0;
          },
          verifyAndPromote: async () => {},
        }),
      ).resolves.toBe(true);
      expect(progress.reads).toBe(2304);
      expect(appends).toEqual([8 * 1024 * 1024, 1024 * 1024]);
    });
  });

  test('revocation metadata is detected without downloading marker bodies', async () => {
    const server = new FakeDriveServer();
    const app = new GoogleDriveSnapshotProvider({
      auth: new FakeAuth(),
      state: new MemoryDriveProviderStateStore(),
      fetch: server.fetch,
      sleep: async () => {},
      random: () => 0,
      now: () => 1_800_000_000_000,
    });
    await app.publishRevocation(vaultId, 'backup-deleted');
    server.calls.length = 0;
    await expect(app.listRevocations(vaultId)).resolves.toEqual(['backup-deleted']);
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].url).toContain('/drive/v3/files?');
  });

  test('production revocation purge preserves its marker and removes every other object', async () => {
    const server = new FakeDriveServer();
    const app = provider(server);
    const remoteHead = head('device-purge', 1, '6'.repeat(64));
    server.seed(
      vaultId,
      'heads/device-purge.json',
      'head',
      encodeCanonicalBytes(remoteHead),
    );
    server.seed(
      vaultId,
      `snapshots/${'6'.repeat(64)}.json.gz`,
      'snapshot',
      new Uint8Array([6]),
    );
    const media = new TextEncoder().encode('synthetic-media-to-purge');
    const mediaHash = sha256Bytes(media);
    server.seed(vaultId, `media/${mediaHash.slice(0, 2)}/${mediaHash}`, 'media', media);

    await app.publishRevocation(vaultId, 'backup-deleted');
    await expect(app.purgeRevokedVault(vaultId)).resolves.toEqual({
      deleted: 3,
      remaining: 0,
    });
    await expect(app.listRevocations(vaultId)).resolves.toEqual(['backup-deleted']);
    expect([...server.files.values()].map((file) => file.appProperties.tb_kind)).toEqual([
      'revocation',
    ]);
  });

  test('request reports reject credentials and provider identifiers', () => {
    expect(() => assertDriveReportIsRedacted({ token: 'synthetic' })).toThrow(
      /forbidden/,
    );
    expect(() => assertDriveReportIsRedacted({ value: 'person@example.test' })).toThrow(
      /email/,
    );
    expect(() =>
      assertDriveReportIsRedacted({ uri: 'https://www.googleapis.com/upload/session' }),
    ).toThrow(/session URI|Google Drive URL/);
    expect(() =>
      assertDriveReportIsRedacted(
        new MemoryDriveInstrumentation('safe-scenario').report(),
      ),
    ).not.toThrow();
  });
});

test('a media upload sends exactly the verified bytes even if its source reuses the buffer', async () => {
  const server = new FakeDriveServer();
  const bytes = new TextEncoder().encode('photo-before');
  const original = bytes.slice();
  const hash = sha256Bytes(bytes);
  const app = new GoogleDriveSnapshotProvider({
    auth: new FakeAuth(),
    state: new MemoryDriveProviderStateStore(),
    fetch: server.fetch,
    sleep: async () => {},
    random: () => 0,
    hashBytes: async (input) => sha256Bytes(input),
  });
  await app.uploadMedia(vaultId, hash, {
    byteLength: bytes.byteLength,
    contentHash: hash,
    read: async () => {
      // The source reuses its buffer while the hash is being awaited.
      queueMicrotask(() => queueMicrotask(() => bytes.fill(0)));
      return bytes;
    },
  });
  expect(
    [...server.files.values()].find((file) => file.name.endsWith(hash))?.bytes,
  ).toEqual(original);
});
