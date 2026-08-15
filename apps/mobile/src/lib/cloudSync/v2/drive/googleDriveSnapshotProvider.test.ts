import type { CloudAuthorization, GoogleTokenSet } from '../../auth/types';
import { canonicalBytesV2 } from '../canonical';
import { decodeSnapshotV2, encodeSnapshotV2 } from '../codec';
import { sha256BytesV2 } from '../sha256';
import type { JournalSnapshotPayloadV2 } from '../types';
import type { DeviceHeadV2 } from '../sync/types';
import {
  driveV2MetadataKey,
  GoogleDriveSnapshotV2Provider,
  type DriveV2FetchLike,
  type DriveV2ResponseLike,
} from './googleDriveSnapshotProvider';
import {
  assertDriveV2ReportIsRedacted,
  MemoryDriveV2Instrumentation,
} from './instrumentation';
import {
  MemoryDriveV2ProviderStateStore,
  type DriveV2FileRecord,
  type DriveV2ObjectKind,
} from './state';

class FakeAuth implements CloudAuthorization {
  clears = 0;
  async authorize(): Promise<GoogleTokenSet> {
    return { accessToken: 'synthetic-access', expiresAt: Date.now() + 60_000 };
  }
  async getFreshAccessToken() { return 'synthetic-access'; }
  async clearInvalidAccessToken() { this.clears += 1; }
  async signOut() {}
  async getAccountLabel() { return 'Synthetic account'; }
}

function response(
  status: number,
  json: unknown = {},
  bytes?: Uint8Array,
  headers: Record<string, string> = {},
): DriveV2ResponseLike {
  const values = new Map(Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value]));
  if (bytes) values.set('content-length', String(bytes.byteLength));
  let sent = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => values.get(name.toLowerCase()) ?? null },
    body: bytes ? {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: bytes.slice() };
        },
      }),
    } : null,
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
  const metadata = JSON.parse(new TextDecoder().decode(
    body.slice(firstHeader + headerEnd.length, metadataEnd),
  )) as { name: string; parents?: string[]; appProperties: Record<string, string> };
  return { metadata, bytes: body.slice(secondHeader + headerEnd.length, bodyEnd) };
}

class FakeDriveV2Server {
  readonly calls: { url: string; method: string }[] = [];
  readonly files = new Map<string, StoredDriveFile>();
  failAfterNextCreate = false;
  hideNextFileLists = 0;
  hideNextChangeLists = 0;
  rejectChangeCursors = 0;
  private nextId = 0;
  private sequence = 0;
  private readonly changes: { sequence: number; fileId: string; removed: boolean }[] = [];

  readonly fetch: DriveV2FetchLike = async (url, init = {}) => {
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
      const changes = this.changes.filter((change) => change.sequence > from).map((change) => ({
        removed: change.removed,
        fileId: change.fileId,
        file: change.removed ? undefined : this.publicFile(this.files.get(change.fileId)!),
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
        files: [...this.files.values()].filter((file) => this.matches(file, query))
          .map((file) => this.publicFile(file)),
      });
    }
    if (parsed.pathname.endsWith('/files') && method === 'POST' &&
        parsed.searchParams.get('uploadType') === 'multipart') {
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
    if (fileMatch && parsed.searchParams.get('uploadType') === 'multipart' && method === 'PATCH') {
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
    kind: DriveV2ObjectKind,
    bytes: Uint8Array,
    extra: Record<string, string> = {},
  ): StoredDriveFile {
    return this.store({
      name: key,
      appProperties: {
        tb_v2_vault: vaultId,
        tb_v2_key: driveV2MetadataKey(key),
        tb_v2_hash: sha256BytesV2(bytes),
        tb_v2_kind: kind,
        ...extra,
      },
    }, bytes);
  }

  record(file: StoredDriveFile, kind: DriveV2ObjectKind, head: DeviceHeadV2 | null): DriveV2FileRecord {
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

  cursor(): string { return String(this.sequence); }

  private store(
    metadata: { name: string; appProperties: Record<string, string> },
    bytes: Uint8Array,
    existingId?: string,
  ): StoredDriveFile {
    const id = existingId ?? `drive-file-${++this.nextId}`;
    const hash = sha256BytesV2(bytes);
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
    const vault = /key='tb_v2_vault' and value='([^']+)'/.exec(query)?.[1];
    if (vault && file.appProperties.tb_v2_vault !== vault) return false;
    const exactNames = [...query.matchAll(/name = '([^']+)'/g)].map((match) => match[1]);
    if (exactNames.length > 0 && !exactNames.includes(file.name)) return false;
    const prefixes = [...query.matchAll(/name contains '([^']+)'/g)].map((match) => match[1]);
    if (prefixes.length > 0 && !prefixes.some((prefix) => file.name.startsWith(prefix))) return false;
    const kinds = [...query.matchAll(/key='tb_v2_kind' and value='([^']+)'/g)]
      .map((match) => match[1]);
    if (kinds.length > 0 && !kinds.includes(file.appProperties.tb_v2_kind)) return false;
    const key = /key='tb_v2_key' and value='([^']+)'/.exec(query)?.[1];
    if (key && file.appProperties.tb_v2_key !== key) return false;
    return !file.trashed;
  }
}

const vaultId = 'vault-v7-drive-test';

function head(deviceId: string, sequence: number, snapshotId: string): DeviceHeadV2 {
  return {
    format: 'tackbok-device-head',
    formatVersion: 2,
    vaultId,
    deviceId,
    deviceSequence: sequence,
    snapshotId,
    updatedAt: 1,
  };
}

function representativePresentlyPayload(deviceId: string): JournalSnapshotPayloadV2 {
  return {
    format: 'tackbok-snapshot', formatVersion: 2, vaultId,
    parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: deviceId,
    deviceSequence: 1, createdAt: 1,
    entries: Array.from({ length: 2_000 }, (_, index) => ({
      entryId: `presently-${index.toString().padStart(6, '0')}`,
      title: null, content: `Synthetic import row ${index}`, mood: null,
      createdAt: index + 1, updatedAt: index + 1, conflictOriginId: null,
    })),
    tags: [], entryTags: [], prompts: [],
    profile: {
      profileId: 'profile', displayName: null, photoAssetId: null, updatedAt: 1,
    },
    media: [], tombstones: [], conflicts: [],
  };
}

function provider(
  server: FakeDriveV2Server,
  state = new MemoryDriveV2ProviderStateStore(),
  instrumentation?: MemoryDriveV2Instrumentation,
) {
  return new GoogleDriveSnapshotV2Provider({
    auth: new FakeAuth(),
    state,
    fetch: server.fetch,
    instrumentation,
    sleep: async () => {},
    random: () => 0,
    now: () => 1_800_000_000_000,
  });
}

describe('GoogleDriveSnapshotV2Provider', () => {
  test('one 2,000-entry snapshot publishes and fresh-restores within both request ceilings', async () => {
    const server = new FakeDriveV2Server();
    const encoded = encodeSnapshotV2(representativePresentlyPayload('device-import'));
    const importMetrics = new MemoryDriveV2Instrumentation('representative-import');
    const importing = provider(server, new MemoryDriveV2ProviderStateStore(), importMetrics);
    await importing.listRevocations(vaultId);
    await importing.listHeads(vaultId, true);
    await importing.uploadSnapshot(vaultId, encoded.snapshotId, encoded.compressedBytes, 1);
    expect(await importing.verifySnapshot(
      vaultId, encoded.snapshotId, encoded.compressedBytes,
    )).toBe(true);
    await importing.updateDeviceHead(vaultId, head('device-import', 1, encoded.snapshotId));

    const restoreMetrics = new MemoryDriveV2Instrumentation('fresh-restore');
    const restoring = provider(server, new MemoryDriveV2ProviderStateStore(), restoreMetrics);
    await restoring.listRevocations(vaultId);
    const heads = await restoring.listHeads(vaultId, true);
    const downloaded = await restoring.downloadSnapshot(vaultId, encoded.snapshotId);
    expect(downloaded).not.toBeNull();
    expect(decodeSnapshotV2(downloaded!, encoded.snapshotId).payload.entries).toHaveLength(2_000);
    await restoring.updateDeviceHead(vaultId, head('device-restore', 1, encoded.snapshotId));

    expect(heads).toHaveLength(1);
    expect(importMetrics.report()).toMatchObject({ attempts: 7, retries: 0 });
    expect(restoreMetrics.report()).toMatchObject({ attempts: 8, retries: 0 });
    expect([...server.files.values()].filter((file) => file.name.startsWith('snapshots/')))
      .toHaveLength(1);
  });

  test('warm quiet sync and one text edit stay inside the approved request ceilings', async () => {
    const server = new FakeDriveV2Server();
    const state = new MemoryDriveV2ProviderStateStore();
    const existingSnapshot = 'a'.repeat(64);
    const existingHead = head('device-budget', 1, existingSnapshot);
    const headFile = server.seed(
      vaultId,
      `heads/${existingHead.deviceId}.json`,
      'head',
      canonicalBytesV2(existingHead),
    );
    state.replaceInitialInventory(vaultId, [server.record(headFile, 'head', existingHead)], server.cursor());

    const quietMetrics = new MemoryDriveV2Instrumentation('warm-quiet-sync');
    const quiet = provider(server, state, quietMetrics);
    await quiet.listRevocations(vaultId);
    await quiet.listHeads(vaultId, true);
    await quiet.listHeads(vaultId, false);
    expect(quietMetrics.report()).toMatchObject({ attempts: 2, retries: 0 });

    const editMetrics = new MemoryDriveV2Instrumentation('one-text-edit');
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
    const server = new FakeDriveV2Server();
    const duplicate = head('device-duplicate', 1, 'c'.repeat(64));
    server.seed(vaultId, `heads/${duplicate.deviceId}.json`, 'head', canonicalBytesV2(duplicate));
    server.seed(vaultId, `heads/${duplicate.deviceId}.json`, 'head', canonicalBytesV2(duplicate));
    const first = provider(server);
    expect(await first.listHeads(vaultId, true)).toHaveLength(2);

    const second = provider(server);
    await second.updateDeviceHead(vaultId, head('device-second', 1, 'd'.repeat(64)));
    const observer = provider(server);
    const listed = await observer.listHeads(vaultId, true);
    expect(listed.filter((value) => value.head.deviceId === 'device-duplicate')).toHaveLength(2);
    expect(listed.some((value) => value.head.deviceId === 'device-second')).toBe(true);
  });

  test('a lost immutable create response reconciles the created object without data loss', async () => {
    const server = new FakeDriveV2Server();
    const app = provider(server);
    server.failAfterNextCreate = true;
    const bytes = new Uint8Array([2, 7, 1, 8]);
    const snapshotId = 'e'.repeat(64);
    await expect(app.uploadSnapshot(vaultId, snapshotId, bytes, 1)).resolves.toBeUndefined();
    expect([...server.files.values()].filter((file) =>
      file.name === `snapshots/${snapshotId}.json.gz`)).toHaveLength(1);
    await expect(app.downloadSnapshot(vaultId, snapshotId)).resolves.toEqual(bytes);
  });

  test('a lost response tolerates delayed exact-key visibility', async () => {
    const server = new FakeDriveV2Server();
    const app = provider(server);
    server.failAfterNextCreate = true;
    server.hideNextFileLists = 1;
    const bytes = new Uint8Array([1, 6, 1, 8]);
    const snapshotId = '9'.repeat(64);

    await expect(app.uploadSnapshot(vaultId, snapshotId, bytes, 1)).resolves.toBeUndefined();
    expect(server.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    await expect(app.downloadSnapshot(vaultId, snapshotId)).resolves.toEqual(bytes);
  });

  test('a server retry window is durable and manual retry issues no request inside it', async () => {
    const state = new MemoryDriveV2ProviderStateStore();
    let attempts = 0;
    const limitedFetch: DriveV2FetchLike = async () => {
      attempts += 1;
      return response(429, {}, undefined, { 'retry-after': '60' });
    };
    const first = new GoogleDriveSnapshotV2Provider({
      auth: new FakeAuth(), state, fetch: limitedFetch, sleep: async () => {},
      now: () => 1_000, random: () => 0,
    });
    await expect(first.listRevocations(vaultId)).rejects.toMatchObject({ code: 'rate-limited' });
    expect(attempts).toBe(3);

    const reconstructed = new GoogleDriveSnapshotV2Provider({
      auth: new FakeAuth(), state, fetch: limitedFetch, sleep: async () => {},
      now: () => 2_000, random: () => 0,
    });
    await expect(reconstructed.listRevocations(vaultId))
      .rejects.toMatchObject({ code: 'rate-limited' });
    expect(attempts).toBe(3);
  });

  test('an expired change cursor rebuilds the prefix-scoped inventory', async () => {
    const server = new FakeDriveV2Server();
    const remote = head('device-cursor', 1, 'f'.repeat(64));
    server.seed(vaultId, `heads/${remote.deviceId}.json`, 'head', canonicalBytesV2(remote));
    const state = new MemoryDriveV2ProviderStateStore();
    state.replaceInitialInventory(vaultId, [], 'expired-cursor');
    const app = provider(server, state);

    await expect(app.listHeads(vaultId, true)).resolves.toMatchObject([{ head: remote }]);
    expect(state.loadDiscovery(vaultId)).toMatchObject({
      inventoryComplete: true,
      cursor: server.cursor(),
    });
  });

  test('discovery rebuild is bounded when Drive rejects each fresh cursor', async () => {
    const server = new FakeDriveV2Server();
    server.rejectChangeCursors = 2;

    await expect(provider(server).listHeads(vaultId, true)).rejects.toMatchObject({
      code: 'transient',
    });
    expect(server.calls.filter((call) => call.url.includes('/changes/startPageToken')))
      .toHaveLength(2);
    expect(server.calls.filter((call) =>
      call.url.includes('/changes?') && !call.url.includes('startPageToken')))
      .toHaveLength(2);
  });

  test('vault discovery validates head bodies and returns no Drive identifiers', async () => {
    const server = new FakeDriveV2Server();
    const olderVault = 'vault-discovery-older';
    const newerVault = 'vault-discovery-newer';
    const olderHead: DeviceHeadV2 = {
      ...head('device-older', 1, '3'.repeat(64)), vaultId: olderVault, updatedAt: 10,
    };
    const newerHead: DeviceHeadV2 = {
      ...head('device-newer', 1, '4'.repeat(64)), vaultId: newerVault, updatedAt: 20,
    };
    server.seed(olderVault, 'heads/device-older.json', 'head', canonicalBytesV2(olderHead));
    server.seed(newerVault, 'heads/device-newer.json', 'head', canonicalBytesV2(newerHead));
    server.seed('vault-invalid', 'heads/device-invalid.json', 'head', canonicalBytesV2(olderHead));

    await expect(provider(server).listAvailableVaults()).resolves.toEqual([
      { vaultId: newerVault, updatedAt: 20 },
      { vaultId: olderVault, updatedAt: 10 },
    ]);
  });

  test('initial discovery survives one eventually-consistent empty prefix listing', async () => {
    const server = new FakeDriveV2Server();
    const remote = head('device-eventual', 1, '0'.repeat(64));
    server.seed(vaultId, `heads/${remote.deviceId}.json`, 'head', canonicalBytesV2(remote));
    server.hideNextFileLists = 1;
    const metrics = new MemoryDriveV2Instrumentation('fresh-eventual-list');

    await expect(provider(
      server,
      new MemoryDriveV2ProviderStateStore(),
      metrics,
    ).listHeads(vaultId, true)).resolves.toMatchObject([{ head: remote }]);
    expect(metrics.report()).toMatchObject({
      attempts: 5,
      byMethod: { 'start-token': 1, list: 3, download: 1 },
    });
  });

  test('cursor catch-up reuses an identical cached head without redownloading its body', async () => {
    const server = new FakeDriveV2Server();
    const remote = head('device-cached-change', 1, '8'.repeat(64));
    const stored = server.seed(
      vaultId, `heads/${remote.deviceId}.json`, 'head', canonicalBytesV2(remote),
    );
    const state = new MemoryDriveV2ProviderStateStore();
    state.replaceInitialInventory(vaultId, [server.record(stored, 'head', remote)], '0');
    const metrics = new MemoryDriveV2Instrumentation('cached-change-catch-up');

    await expect(provider(server, state, metrics).listHeads(vaultId, true))
      .resolves.toMatchObject([{ head: remote }]);
    expect(metrics.report()).toMatchObject({ attempts: 1, byMethod: { list: 1 } });
  });

  test('a pre-publication recheck discovers a head hidden from the first change read', async () => {
    const server = new FakeDriveV2Server();
    const state = new MemoryDriveV2ProviderStateStore();
    state.replaceInitialInventory(vaultId, [], '0');
    const remote = head('device-delayed-change', 1, '7'.repeat(64));
    server.seed(vaultId, `heads/${remote.deviceId}.json`, 'head', canonicalBytesV2(remote));
    server.hideNextChangeLists = 1;
    const app = provider(server, state);

    await expect(app.listHeads(vaultId, true)).resolves.toEqual([]);
    await expect(app.listHeads(vaultId, true)).resolves.toMatchObject([{ head: remote }]);
  });

  test('unknown media hashes use bounded grouped existence queries', async () => {
    const server = new FakeDriveV2Server();
    const hashes: string[] = [];
    for (let index = 0; index < 51; index += 1) {
      const bytes = new TextEncoder().encode(`synthetic-media-${index}`);
      const hash = sha256BytesV2(bytes);
      hashes.push(hash);
      server.seed(vaultId, `media/${hash.slice(0, 2)}/${hash}`, 'media', bytes);
    }
    const metrics = new MemoryDriveV2Instrumentation('grouped-media-existence');
    const app = provider(server, new MemoryDriveV2ProviderStateStore(), metrics);
    expect(await app.hasMediaBatch(vaultId, hashes)).toEqual(new Set(hashes));
    expect(metrics.report()).toMatchObject({ attempts: 2, byMethod: { list: 2 } });
  });

  test('snapshot deletion is permanent and repeated deletion is idempotent', async () => {
    const server = new FakeDriveV2Server();
    const state = new MemoryDriveV2ProviderStateStore();
    const snapshotId = '1'.repeat(64);
    const bytes = new Uint8Array([9, 9, 9]);
    const stored = server.seed(vaultId, `snapshots/${snapshotId}.json.gz`, 'snapshot', bytes);
    state.replaceInitialInventory(vaultId, [server.record(stored, 'snapshot', null)], server.cursor());
    const app = provider(server, state);

    await app.deleteSnapshot(vaultId, snapshotId);
    await app.deleteSnapshot(vaultId, snapshotId);
    expect([...server.files.values()].some((file) => file.id === stored.id)).toBe(false);
    await expect(app.downloadSnapshot(vaultId, snapshotId)).resolves.toBeNull();
  });

  test('cleanup interruption leaves excess history and the next delete resumes safely', async () => {
    const server = new FakeDriveV2Server();
    const state = new MemoryDriveV2ProviderStateStore();
    const snapshotId = '2'.repeat(64);
    const bytes = new Uint8Array([8, 6, 7, 5]);
    const first = server.seed(vaultId, `snapshots/${snapshotId}.json.gz`, 'snapshot', bytes);
    const second = server.seed(vaultId, `snapshots/${snapshotId}.json.gz`, 'snapshot', bytes);
    state.replaceInitialInventory(vaultId, [
      server.record(first, 'snapshot', null),
      server.record(second, 'snapshot', null),
    ], server.cursor());
    let failures = 3;
    const interruptedFetch: DriveV2FetchLike = async (url, init) => {
      if (String(init?.method ?? 'GET') === 'DELETE' && url.includes(second.id) && failures > 0) {
        failures -= 1;
        throw new Error('synthetic interrupted cleanup');
      }
      return server.fetch(url, init);
    };
    const interrupted = new GoogleDriveSnapshotV2Provider({
      auth: new FakeAuth(), state, fetch: interruptedFetch, sleep: async () => {}, random: () => 0,
    });
    await expect(interrupted.deleteSnapshot(vaultId, snapshotId))
      .rejects.toMatchObject({ code: 'transient' });
    expect([...server.files.values()].filter((file) => file.name.includes(snapshotId)))
      .toHaveLength(1);

    await provider(server, state).deleteSnapshot(vaultId, snapshotId);
    expect([...server.files.values()].filter((file) => file.name.includes(snapshotId)))
      .toHaveLength(0);
  });

  test('a persisted resumable session continues at the Drive-reported chunk boundary', async () => {
    const state = new MemoryDriveV2ProviderStateStore();
    const bytes = new Uint8Array(5 * 1024 * 1024 + 7);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    const hash = sha256BytesV2(bytes);
    const key = `media/${hash.slice(0, 2)}/${hash}`;
    const uri = 'https://www.googleapis.com/upload/v7-test-session';
    state.setUploadSession(vaultId, {
      logicalKey: key,
      contentSha256: hash,
      uri,
      expiresAt: Date.now() + 60_000,
      byteCount: bytes.byteLength,
    });
    const ranges: string[] = [];
    const fetch: DriveV2FetchLike = async (url, init = {}) => {
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
          tb_v2_vault: vaultId,
          tb_v2_key: driveV2MetadataKey(key),
          tb_v2_hash: hash,
          tb_v2_kind: 'media',
        },
      });
    };
    const resumed = new GoogleDriveSnapshotV2Provider({
      auth: new FakeAuth(), state, fetch, sleep: async () => {}, random: () => 0,
    });

    await resumed.uploadMedia(vaultId, hash, bytes);
    expect(ranges[0]).toBe(`bytes */${bytes.byteLength}`);
    expect(ranges[1]).toBe(`bytes ${256 * 1024}-${2 * 256 * 1024 - 1}/${bytes.byteLength}`);
    expect(state.getUploadSession(vaultId, key, hash)).toBeNull();
  });

  test('revocation metadata is detected without downloading marker bodies', async () => {
    const server = new FakeDriveV2Server();
    const app = new GoogleDriveSnapshotV2Provider({
      auth: new FakeAuth(),
      state: new MemoryDriveV2ProviderStateStore(),
      fetch: server.fetch,
      sleep: async () => {},
      random: () => 0,
      now: () => 1_800_000_000_000,
      enableDevProbeMethods: true,
    });
    await app.createRevocationForProbe(vaultId, 'backup-deleted');
    server.calls.length = 0;
    await expect(app.listRevocations(vaultId)).resolves.toEqual(['backup-deleted']);
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].url).toContain('/drive/v3/files?');
  });

  test('production revocation purge preserves its marker and removes every other object', async () => {
    const server = new FakeDriveV2Server();
    const app = provider(server);
    const remoteHead = head('device-purge', 1, '6'.repeat(64));
    server.seed(vaultId, 'heads/device-purge.json', 'head', canonicalBytesV2(remoteHead));
    server.seed(vaultId, `snapshots/${'6'.repeat(64)}.json.gz`, 'snapshot',
      new Uint8Array([6]));
    const media = new TextEncoder().encode('synthetic-media-to-purge');
    const mediaHash = sha256BytesV2(media);
    server.seed(vaultId, `media/${mediaHash.slice(0, 2)}/${mediaHash}`, 'media', media);

    await app.publishRevocation(vaultId, 'backup-deleted');
    await expect(app.purgeRevokedVault(vaultId)).resolves.toEqual({ deleted: 3, remaining: 0 });
    await expect(app.listRevocations(vaultId)).resolves.toEqual(['backup-deleted']);
    expect([...server.files.values()].map((file) => file.appProperties.tb_v2_kind))
      .toEqual(['revocation']);
  });

  test('destructive probe methods are hard-gated on ordinary provider instances', async () => {
    const app = provider(new FakeDriveV2Server());
    expect(() => app.setCursorForProbe(vaultId, 'cursor')).toThrow(/disabled/);
    await expect(app.deleteAllForProbe(vaultId)).rejects.toThrow(/disabled/);
  });

  test('request reports reject credentials and provider identifiers', () => {
    expect(() => assertDriveV2ReportIsRedacted({ token: 'synthetic' })).toThrow(/forbidden/);
    expect(() => assertDriveV2ReportIsRedacted({ value: 'person@example.test' })).toThrow(/email/);
    expect(() => assertDriveV2ReportIsRedacted({ uri: 'https://www.googleapis.com/upload/session' }))
      .toThrow(/session URI|Google Drive URL/);
    expect(() => assertDriveV2ReportIsRedacted(
      new MemoryDriveV2Instrumentation('safe-scenario').report(),
    )).not.toThrow();
  });
});
