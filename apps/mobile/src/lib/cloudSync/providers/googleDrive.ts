import type { CloudAuthorization } from '../auth';
import { IncrementalSha256, sha256Bytes } from '../codec';
import { validateVaultMarkerBytes } from '../domain/validation';
import { PROTOCOL_V1_CAPS } from '../protocol/validationCaps';
import {
  ProviderError,
  type ByteSource,
  type ChangePage,
  type CloudProvider,
  type DeleteSweepPage,
  type ListPage,
  type LogicalKey,
  type ProviderCapabilities,
  type ProviderConnection,
  type ProviderQuota,
  type RemoteObject,
  type RemoteObjectRef,
  type RemoteVaultSummary,
  type SizedByteSource,
  type VaultMarkerResult,
  type VaultRef,
} from './types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_DATA = 'appDataFolder';
const PROP_VAULT = 'tb_vault';
const PROP_KEY = 'tb_key';
const PROP_HASH = 'tb_hash';
const CHUNK_SIZE = 256 * 1024;
const SESSION_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;
const FILE_FIELDS = 'id,name,size,appProperties,trashed';
const GOOGLE_RESUMABLE_ORIGIN = 'https://www.googleapis.com';

export function isTrustedGoogleResumableSessionUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.origin === GOOGLE_RESUMABLE_ORIGIN && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface DriveFile {
  id: string;
  name?: string;
  size?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
}

export interface DriveResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type DriveFetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<DriveResponseLike>;

const defaultDriveFetch: DriveFetchLike = async (url, init) => {
  const { fetch } = await import('expo/fetch');
  return fetch(url, init as never) as unknown as DriveResponseLike;
};

export interface ResumableUploadSession {
  uri: string;
  expiresAt: number;
}

export interface ResumableSessionIdentity {
  logicalKey: string;
  contentHash: string;
}

export interface ResumableSessionStore {
  get(identity: ResumableSessionIdentity): Promise<ResumableUploadSession | null>;
  set(identity: ResumableSessionIdentity, session: ResumableUploadSession): Promise<void>;
  delete(identity: ResumableSessionIdentity): Promise<void>;
}

export class MemoryResumableSessionStore implements ResumableSessionStore {
  private readonly sessions = new Map<string, ResumableUploadSession>();
  private key(identity: ResumableSessionIdentity) {
    return `${identity.logicalKey}\u0000${identity.contentHash}`;
  }
  async get(identity: ResumableSessionIdentity) { return this.sessions.get(this.key(identity)) ?? null; }
  async set(identity: ResumableSessionIdentity, session: ResumableUploadSession) {
    this.sessions.set(this.key(identity), session);
  }
  async delete(identity: ResumableSessionIdentity) { this.sessions.delete(this.key(identity)); }
}

/** Production session ledger. The lazy import keeps provider contract tests native-free. */
export class SqliteResumableSessionStore implements ResumableSessionStore {
  async get(identity: ResumableSessionIdentity): Promise<ResumableUploadSession | null> {
    const [{ and, eq }, { db, syncRemoteObjects }] = await Promise.all([
      import('drizzle-orm'),
      import('~/db'),
    ]);
    const [row] = await db
      .select({
        uri: syncRemoteObjects.resumable_session_uri,
        expiresAt: syncRemoteObjects.resumable_session_expires_at,
      })
      .from(syncRemoteObjects)
      .where(and(
        eq(syncRemoteObjects.logical_key, identity.logicalKey),
        eq(syncRemoteObjects.content_hash, identity.contentHash),
      ))
      .limit(1);
    return row?.uri && row.expiresAt ? { uri: row.uri, expiresAt: row.expiresAt } : null;
  }

  async set(identity: ResumableSessionIdentity, session: ResumableUploadSession): Promise<void> {
    const { db, syncRemoteObjects } = await import('~/db');
    await db.insert(syncRemoteObjects).values({
      logical_key: identity.logicalKey,
      content_hash: identity.contentHash,
      provider_file_id: null,
      status: 'uploading',
      byte_count: null,
      resumable_session_uri: session.uri,
      resumable_session_expires_at: session.expiresAt,
      updated_at: Date.now(),
    }).onConflictDoUpdate({
      target: syncRemoteObjects.logical_key,
      set: {
        content_hash: identity.contentHash,
        provider_file_id: null,
        status: 'uploading',
        byte_count: null,
        resumable_session_uri: session.uri,
        resumable_session_expires_at: session.expiresAt,
        updated_at: Date.now(),
      },
    });
  }

  async delete(identity: ResumableSessionIdentity): Promise<void> {
    const [{ and, eq }, { db, syncRemoteObjects }] = await Promise.all([
      import('drizzle-orm'),
      import('~/db'),
    ]);
    await db.delete(syncRemoteObjects).where(and(
      eq(syncRemoteObjects.logical_key, identity.logicalKey),
      eq(syncRemoteObjects.content_hash, identity.contentHash),
    ));
  }
}

export interface GoogleDriveProviderOptions {
  auth: CloudAuthorization;
  sessionStore?: ResumableSessionStore;
  fetch?: DriveFetchLike;
  pageSize?: number;
}

/** A durable file sink used to resume large downloads without buffering in JS. */
export interface ResumableDownloadSink {
  byteLength(): Promise<number>;
  append(chunk: Uint8Array): Promise<void>;
  reset(): Promise<void>;
  digestSha256(): Promise<string>;
}

const utf8 = (value: string) => new TextEncoder().encode(value);

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function propertyClause(key: string, value: string): string {
  return `appProperties has { key='${key}' and value='${escapeQueryValue(value)}' }`;
}

function asDriveFile(value: unknown): DriveFile {
  if (!value || typeof value !== 'object' || typeof (value as DriveFile).id !== 'string') {
    throw new ProviderError('corrupt', 'Drive returned invalid file metadata');
  }
  return value as DriveFile;
}

function logicalKey(file: DriveFile): string {
  const value = file.appProperties?.[PROP_KEY];
  if (!value) throw new ProviderError('corrupt', `Drive file ${file.id} has no logical key`);
  return value;
}

function contentHash(file: DriveFile): string {
  const value = file.appProperties?.[PROP_HASH];
  if (!value) throw new ProviderError('corrupt', `Drive file ${file.id} has no content hash`);
  return value;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function statusError(status: number, retryAfter: string | null): ProviderError {
  const message = `Google Drive request failed (${status})`;
  if (status === 401 || status === 403) return new ProviderError('auth', message);
  if (status === 404 || status === 410) return new ProviderError('not-found', message);
  if (status === 429) return new ProviderError('rate-limit', message, parseRetryAfter(retryAfter));
  if (status === 507) return new ProviderError('quota', message);
  return new ProviderError('transient', message, parseRetryAfter(retryAfter));
}

export class GoogleDriveProvider implements CloudProvider {
  readonly kind = 'google-drive' as const;
  readonly capabilities: ProviderCapabilities = {
    maxObjectSize: null,
    supportsResumableUpload: true,
    deletionIsPermanent: true,
  };
  private readonly auth: CloudAuthorization;
  private readonly fetcher: DriveFetchLike;
  private readonly sessions: ResumableSessionStore;
  private readonly pageSize: number;

  constructor(options: GoogleDriveProviderOptions) {
    this.auth = options.auth;
    this.fetcher = options.fetch ?? defaultDriveFetch;
    this.sessions = options.sessionStore ?? new SqliteResumableSessionStore();
    this.pageSize = options.pageSize ?? 100;
  }

  async connect(): Promise<ProviderConnection> {
    await this.auth.authorize();
    return { accountLabel: await this.auth.getAccountLabel() };
  }

  async refreshConnection(): Promise<ProviderConnection> {
    await this.auth.getFreshAccessToken();
    return { accountLabel: await this.auth.getAccountLabel() };
  }

  async disconnect(): Promise<void> { await this.auth.signOut(); }

  async listVaults(): Promise<RemoteVaultSummary[]> {
    const files = await this.queryFiles(`'${APP_DATA}' in parents and trashed=false`);
    const markers = files.filter((file) => file.appProperties?.[PROP_KEY] === 'vault.json');
    const result = new Map<string, { summary: RemoteVaultSummary; hash: string }>();
    for (const marker of markers) {
      const vaultId = marker.appProperties?.[PROP_VAULT];
      if (!vaultId) continue;
      const bytes = await this.downloadVerified(marker);
      try {
        const body = JSON.parse(new TextDecoder().decode(bytes)) as { vaultId?: unknown };
        if (body.vaultId !== vaultId) throw new Error('mismatch');
      } catch {
        throw new ProviderError('corrupt', `Invalid vault marker ${marker.id}`);
      }
      const prior = result.get(vaultId);
      if (prior && prior.hash !== contentHash(marker)) {
        throw new ProviderError('corrupt', `Conflicting vault markers for ${vaultId}`);
      }
      if (!prior) {
        result.set(vaultId, {
          hash: contentHash(marker),
          summary: { vaultId, remoteRootId: marker.id, revoked: false },
        });
      }
    }
    for (const file of files) {
      const vaultId = file.appProperties?.[PROP_VAULT];
      const key = file.appProperties?.[PROP_KEY];
      if (vaultId && key?.startsWith('revocations/')) {
        const vault = result.get(vaultId);
        if (vault) vault.summary.revoked = true;
      }
    }
    return [...result.values()].map(({ summary }) => summary).sort((a, b) => a.vaultId.localeCompare(b.vaultId));
  }

  async createVaultMarker(vaultId: string, body: Uint8Array): Promise<VaultMarkerResult> {
    validateVaultMarkerBytes(body);
    const existing = await this.findByKey(vaultId, 'vault.json');
    const ref = await this.putImmutable({ vaultId, remoteRootId: APP_DATA }, 'vault.json', body);
    return {
      vault: { vaultId, remoteRootId: existing[0]?.id ?? ref.fileId },
      duplicate: existing.length > 0,
    };
  }

  async read(vault: VaultRef, key: LogicalKey): Promise<RemoteObject | null> {
    const files = await this.findByKey(vault.vaultId, key);
    if (files.length === 0) return null;
    if (new Set(files.map(contentHash)).size > 1) {
      throw new ProviderError('corrupt', `Immutable key collision at ${key}`);
    }
    const file = files.sort((a, b) => a.id.localeCompare(b.id))[0];
    return this.remoteObject(file, await this.downloadVerified(file));
  }

  /**
   * Streams a large immutable object into durable storage. A caller can invoke
   * this again with the same sink after interruption; Drive resumes via Range.
   */
  async downloadToSink(
    vault: VaultRef,
    key: LogicalKey,
    sink: ResumableDownloadSink,
  ): Promise<RemoteObjectRef | null> {
    const files = await this.findByKey(vault.vaultId, key);
    if (files.length === 0) return null;
    if (new Set(files.map(contentHash)).size > 1) {
      throw new ProviderError('corrupt', `Immutable key collision at ${key}`);
    }
    const file = files.sort((a, b) => a.id.localeCompare(b.id))[0];
    const expectedSize = Number(file.size);
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
      throw new ProviderError('corrupt', `Drive returned an invalid size for ${key}`);
    }
    if (key.startsWith('blobs/') && expectedSize > PROTOCOL_V1_CAPS.maximumMediaBytes) {
      throw new ProviderError('corrupt', 'Media object exceeds the protocol byte cap');
    }
    let offset = await sink.byteLength();
    if (offset > expectedSize) {
      await sink.reset();
      offset = 0;
    }
    const headers = offset > 0 ? { Range: `bytes=${offset}-` } : undefined;
    const response = await this.request(
      `${API}/files/${encodeURIComponent(file.id)}?alt=media`,
      headers ? { headers } : {},
    );
    if (offset > 0 && response.status === 200) {
      // The server ignored Range, so restart rather than duplicate the prefix.
      await sink.reset();
      offset = 0;
    }
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.length) {
          await sink.append(new Uint8Array(value));
          offset += value.length;
        }
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      await sink.append(bytes);
      offset += bytes.length;
    }
    if (offset !== expectedSize) {
      throw new ProviderError('transient', `Drive download stopped at ${offset}/${expectedSize} bytes`);
    }
    if (await sink.digestSha256() !== contentHash(file)) {
      await sink.reset();
      throw new ProviderError('corrupt', `Drive content hash mismatch for ${key}`);
    }
    return this.remoteReference(file);
  }

  async exists(vault: VaultRef, keys: LogicalKey[]): Promise<Set<LogicalKey>> {
    const found = new Set<LogicalKey>();
    for (let index = 0; index < keys.length; index += 20) {
      const batch = keys.slice(index, index + 20);
      if (batch.length === 0) continue;
      const expression = batch.map((key) => propertyClause(PROP_KEY, key)).join(' or ');
      const query = `'${APP_DATA}' in parents and trashed=false and ${propertyClause(PROP_VAULT, vault.vaultId)} and (${expression})`;
      for (const file of await this.queryFiles(query)) found.add(logicalKey(file));
    }
    return found;
  }

  async putImmutable(vault: VaultRef, key: LogicalKey, source: ByteSource): Promise<RemoteObjectRef> {
    if (
      key.startsWith('blobs/') &&
      (source instanceof Uint8Array ? source.byteLength : source.byteLength) >
        PROTOCOL_V1_CAPS.maximumMediaBytes
    ) {
      throw new ProviderError('corrupt', 'Media object exceeds the protocol byte cap');
    }
    const hash = source instanceof Uint8Array ? sha256Bytes(source) : source.contentHash;
    const candidates = await this.findByKey(vault.vaultId, key);
    for (const candidate of candidates) {
      if (contentHash(candidate) !== hash) {
        throw new ProviderError('corrupt', `Immutable key collision at ${key}`);
      }
      await this.downloadVerified(candidate);
    }
    if (candidates.length > 0) return this.remoteReference(candidates[0]);
    const metadata = this.metadata(vault.vaultId, key, hash);
    const file = source instanceof Uint8Array
      ? await this.multipartUpload(metadata, source)
      : await this.resumableUpload(vault, key, hash, metadata, source);
    return this.remoteReference(file);
  }

  async list(vault: VaultRef, prefix: LogicalKey, cursor?: string): Promise<ListPage> {
    const query = `'${APP_DATA}' in parents and trashed=false and ${propertyClause(PROP_VAULT, vault.vaultId)}`;
    const page = await this.queryFilePage(query, cursor);
    const files = page.files.filter((file) => logicalKey(file).startsWith(prefix));
    const objects = await Promise.all(files.map(async (file) => this.remoteObject(file, await this.downloadVerified(file))));
    objects.sort((a, b) => a.key.localeCompare(b.key) || a.fileId.localeCompare(b.fileId));
    return { objects, cursor: page.nextPageToken ?? null };
  }

  async getChanges(vault: VaultRef, cursor?: string): Promise<ChangePage> {
    if (!cursor) {
      const response = await this.request(`${API}/changes/startPageToken?spaces=${APP_DATA}`);
      const body = (await response.json()) as { startPageToken?: unknown };
      if (typeof body.startPageToken !== 'string') throw new ProviderError('corrupt', 'Drive returned no change cursor');
      return { objects: [], cursor: body.startPageToken };
    }
    const params = new URLSearchParams({
      pageToken: cursor,
      spaces: APP_DATA,
      pageSize: String(this.pageSize),
      includeRemoved: 'true',
      fields: `nextPageToken,newStartPageToken,changes(removed,file(${FILE_FIELDS}))`,
    });
    const response = await this.request(`${API}/changes?${params}`);
    const body = (await response.json()) as {
      nextPageToken?: unknown;
      newStartPageToken?: unknown;
      changes?: { removed?: boolean; file?: DriveFile }[];
    };
    const files = (body.changes ?? [])
      .filter((change) => !change.removed && change.file?.appProperties?.[PROP_VAULT] === vault.vaultId)
      .map((change) => asDriveFile(change.file));
    const objects = await Promise.all(files.map(async (file) => this.remoteObject(file, await this.downloadVerified(file))));
    const next = typeof body.nextPageToken === 'string'
      ? body.nextPageToken
      : typeof body.newStartPageToken === 'string' ? body.newStartPageToken : cursor;
    return { objects, cursor: next };
  }

  async getQuota(): Promise<ProviderQuota | null> {
    const response = await this.request(`${API}/about?fields=storageQuota`);
    const body = (await response.json()) as { storageQuota?: { usageInDrive?: string; limit?: string } };
    if (!body.storageQuota) return null;
    return {
      usedBytes: Number(body.storageQuota.usageInDrive ?? 0),
      limitBytes: body.storageQuota.limit ? Number(body.storageQuota.limit) : null,
    };
  }

  async deleteObject(_vault: VaultRef, ref: RemoteObjectRef): Promise<void> {
    try {
      await this.request(`${API}/files/${encodeURIComponent(ref.fileId)}`, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof ProviderError && error.category === 'not-found') return;
      throw error;
    }
  }

  async deleteVaultResidue(vault: VaultRef, _cursor?: string): Promise<DeleteSweepPage> {
    const query = `'${APP_DATA}' in parents and trashed=false and ${propertyClause(PROP_VAULT, vault.vaultId)}`;
    const page = await this.queryFilePage(query);
    const batch = page.files.filter((file) => !logicalKey(file).startsWith('revocations/'));
    for (const file of batch) await this.deleteObject(vault, this.remoteReference(file));
    const remaining = await this.queryFiles(query);
    const complete = remaining.every((file) => logicalKey(file).startsWith('revocations/'));
    return { deleted: batch.length, cursor: complete ? null : 'resume', complete };
  }

  private metadata(vaultId: string, key: string, hash: string) {
    return {
      name: key,
      parents: [APP_DATA],
      appProperties: { [PROP_VAULT]: vaultId, [PROP_KEY]: key, [PROP_HASH]: hash },
    };
  }

  private findByKey(vaultId: string, key: string): Promise<DriveFile[]> {
    return this.queryFiles(`'${APP_DATA}' in parents and trashed=false and ${propertyClause(PROP_VAULT, vaultId)} and ${propertyClause(PROP_KEY, key)}`);
  }

  private async queryFiles(query: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.queryFilePage(query, cursor);
      files.push(...page.files);
      cursor = page.nextPageToken;
    } while (cursor);
    return files;
  }

  private async queryFilePage(query: string, cursor?: string): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      spaces: APP_DATA,
      q: query,
      pageSize: String(this.pageSize),
      fields: `nextPageToken,files(${FILE_FIELDS})`,
    });
    if (cursor) params.set('pageToken', cursor);
    const response = await this.request(`${API}/files?${params}`);
    const body = (await response.json()) as { files?: unknown[]; nextPageToken?: unknown };
    return {
      files: (body.files ?? []).map(asDriveFile),
      nextPageToken: typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined,
    };
  }

  private async downloadVerified(file: DriveFile): Promise<Uint8Array> {
    const size = file.size === undefined ? null : Number(file.size);
    if (
      logicalKey(file).startsWith('blobs/') &&
      (size === null || !Number.isSafeInteger(size) || size > PROTOCOL_V1_CAPS.maximumMediaBytes)
    ) {
      throw new ProviderError('corrupt', 'Media object exceeds the protocol byte cap');
    }
    const response = await this.request(`${API}/files/${encodeURIComponent(file.id)}?alt=media`);
    const hasher = new IncrementalSha256();
    const chunks: Uint8Array[] = [];
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { const chunk = new Uint8Array(value); hasher.update(chunk); chunks.push(chunk); }
      }
    } else {
      const chunk = new Uint8Array(await response.arrayBuffer());
      hasher.update(chunk);
      chunks.push(chunk);
    }
    if (hasher.digestHex() !== contentHash(file)) {
      throw new ProviderError('corrupt', `Drive content hash mismatch for ${logicalKey(file)}`);
    }
    return concatBytes(chunks);
  }

  private remoteReference(file: DriveFile): RemoteObjectRef {
    return { fileId: file.id, key: logicalKey(file), contentHash: contentHash(file) };
  }

  private remoteObject(file: DriveFile, body: Uint8Array): RemoteObject {
    return { ...this.remoteReference(file), body, sequence: 0 };
  }

  private async multipartUpload(metadata: object, body: Uint8Array): Promise<DriveFile> {
    const boundary = `tackbok_${Date.now().toString(36)}`;
    const payload = concatBytes([
      utf8(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      utf8(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      body,
      utf8(`\r\n--${boundary}--`),
    ]);
    const response = await this.request(`${UPLOAD_API}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: payload,
    });
    return asDriveFile(await response.json());
  }

  private async resumableUpload(vault: VaultRef, key: string, hash: string, metadata: object, source: SizedByteSource): Promise<DriveFile> {
    const identity = { logicalKey: key, contentHash: hash };
    let session = await this.sessions.get(identity);
    let uploaded = 0;
    if (session && !isTrustedGoogleResumableSessionUri(session.uri)) {
      await this.sessions.delete(identity);
      session = null;
    }
    if (!session || session.expiresAt <= Date.now()) {
      await this.sessions.delete(identity);
      const response = await this.request(`${UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'application/octet-stream',
          'X-Upload-Content-Length': String(source.byteLength),
        },
        body: JSON.stringify(metadata),
      });
      const uri = response.headers.get('location');
      if (!uri) throw new ProviderError('transient', 'Drive returned no resumable session URI');
      if (!isTrustedGoogleResumableSessionUri(uri)) {
        throw new ProviderError('corrupt', 'Drive returned an untrusted resumable session URI');
      }
      session = { uri, expiresAt: Date.now() + SESSION_LIFETIME_MS };
      await this.sessions.set(identity, session);
    } else {
      try {
        const status = await this.request(session.uri, {
          method: 'PUT',
          headers: {
            'Content-Length': '0',
            'Content-Range': `bytes */${source.byteLength}`,
          },
        }, [200, 201, 308]);
        if (status.status === 200 || status.status === 201) {
          await this.sessions.delete(identity);
          return asDriveFile(await status.json());
        }
        const match = /^bytes=0-(\d+)$/.exec(status.headers.get('range') ?? '');
        uploaded = match ? Number(match[1]) + 1 : 0;
        if (uploaded > source.byteLength || (uploaded < source.byteLength && uploaded % CHUNK_SIZE !== 0)) {
          await this.sessions.delete(identity);
          throw new ProviderError('corrupt', 'Drive returned an invalid resumable upload offset');
        }
      } catch (error) {
        if (!(error instanceof ProviderError) || error.category !== 'not-found') throw error;
        await this.sessions.delete(identity);
        const response = await this.request(`${UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'application/octet-stream',
            'X-Upload-Content-Length': String(source.byteLength),
          },
          body: JSON.stringify(metadata),
        });
        const uri = response.headers.get('location');
        if (!uri) throw new ProviderError('transient', 'Drive returned no resumable session URI');
        if (!isTrustedGoogleResumableSessionUri(uri)) {
          throw new ProviderError('corrupt', 'Drive returned an untrusted resumable session URI');
        }
        session = { uri, expiresAt: Date.now() + SESSION_LIFETIME_MS };
        await this.sessions.set(identity, session);
        uploaded = 0;
      }
    }
    const hasher = new IncrementalSha256();
    const resumeOffset = uploaded;
    let streamOffset = 0;
    let pending: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let finalFile: DriveFile | null = null;
    const send = async (chunk: Uint8Array, final: boolean) => {
      const start = uploaded;
      const response = await this.request(session!.uri, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${start + chunk.length - 1}/${source.byteLength}`,
        },
        body: chunk,
      }, final ? [200, 201] : [308]);
      uploaded += chunk.length;
      if (final) finalFile = asDriveFile(await response.json());
    };
    try {
      for await (const incoming of source.chunks) {
        hasher.update(incoming);
        pending = concatBytes([pending, incoming]);
        while (pending.length >= CHUNK_SIZE && streamOffset + CHUNK_SIZE < source.byteLength) {
          if (streamOffset >= resumeOffset) await send(pending.slice(0, CHUNK_SIZE), false);
          pending = pending.slice(CHUNK_SIZE);
          streamOffset += CHUNK_SIZE;
        }
      }
      if (streamOffset + pending.length !== source.byteLength) throw new ProviderError('corrupt', 'Upload byte count does not match declared size');
      if (hasher.digestHex() !== hash) throw new ProviderError('corrupt', 'Upload content does not match declared hash');
      if (streamOffset < resumeOffset) throw new ProviderError('corrupt', 'Upload source ended before the persisted offset');
      await send(pending, true);
      await this.sessions.delete(identity);
      if (!finalFile) throw new ProviderError('transient', 'Drive did not complete resumable upload');
      return finalFile;
    } catch (error) {
      if (error instanceof ProviderError && error.category === 'not-found') {
        await this.sessions.delete(identity);
        throw new ProviderError('transient', 'Drive resumable session expired; retry upload');
      }
      throw error;
    }
  }

  private async request(
    url: string,
    init: Record<string, unknown> = {},
    accepted: number[] = [],
  ): Promise<DriveResponseLike> {
    let retriedAuth = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await this.auth.getFreshAccessToken();
      const headers = { ...((init.headers as Record<string, string> | undefined) ?? {}), Authorization: `Bearer ${token}` };
      let response: DriveResponseLike;
      try {
        response = await this.fetcher(url, { ...init, headers });
      } catch {
        if (attempt < 2) continue;
        throw new ProviderError('transient', 'Unable to reach Google Drive');
      }
      if (response.ok || accepted.includes(response.status)) return response;
      if (response.status === 401 && !retriedAuth) {
        retriedAuth = true;
        await this.auth.clearInvalidAccessToken();
        continue;
      }
      const error = statusError(response.status, response.headers.get('retry-after'));
      if ((error.category === 'rate-limit' || error.category === 'transient') && attempt < 2) continue;
      throw error;
    }
    throw new ProviderError('transient', 'Google Drive retry limit reached');
  }
}
