import { CloudAuthError, type CloudAuthorization } from '../../auth/types';
import { providerErrorCodeForAuthError } from '../../failureClassification';
import { encodeCanonicalBytes } from '../canonical';
import { SNAPSHOT_CAPS } from '../caps';
import { sha256Bytes, sha256Text } from '../sha256';
import { decodeUtf8Strict, parseJsonStrict } from '../strictJson';
import type {
  DeviceHead,
  ListedDeviceHead,
  SnapshotObject,
  SnapshotProvider,
  MediaDownloadSink,
  MediaUploadSource,
  SnapshotProviderErrorCode,
} from '../sync/types';
import { MediaIntegrityError, SnapshotProviderError } from '../sync/types';
import {
  driveByteBucket,
  driveDurationBucket,
  driveQuotaUnits,
  type DriveInstrumentationSink,
  type DriveMethodClass,
  type DriveResultClass,
} from './instrumentation';
import type {
  DriveFileRecord,
  DriveObjectKind,
  DriveProviderStateStore,
} from './state';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_DATA = 'appDataFolder';
const GOOGLE_RESUMABLE_ORIGIN = 'https://www.googleapis.com';
const PROP_VAULT = 'tb_vault';
const PROP_KEY = 'tb_key';
const PROP_HASH = 'tb_hash';
const PROP_KIND = 'tb_kind';
const PROP_REVOCATION = 'tb_revocation';
const FILE_FIELDS = 'id,name,size,createdTime,sha256Checksum,appProperties,trashed';
const PAGE_SIZE = 1_000;
const MEDIA_QUERY_GROUP = 50;
const CHUNK_SIZE = 256 * 1024;
const MEDIA_CHUNK_SIZE = 8 * 1024 * 1024;
const MULTIPART_MAX_BYTES = 4 * 1024 * 1024;
const HEAD_MAX_BYTES = 256 * 1024;
const SESSION_LIFETIME_MS = 6 * 24 * 60 * 60 * 1_000;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const PROPERTY_PAIR_UTF8_CAP = 124;
const MAX_DISCOVERY_REBUILDS = 1;

interface DriveFile {
  id: string;
  name: string;
  size: string;
  createdTime?: string;
  sha256Checksum: string;
  trashed?: boolean;
  appProperties: Record<string, string>;
}

interface DriveChange {
  removed?: boolean;
  fileId?: string;
  file?: unknown;
}

export interface DriveResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body?: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  } | null;
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

export interface GoogleDriveSnapshotProviderOptions {
  auth: CloudAuthorization;
  state: DriveProviderStateStore;
  fetch?: DriveFetchLike;
  instrumentation?: DriveInstrumentationSink;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface AvailableDriveVault {
  vaultId: string;
  updatedAt: number;
}

export interface DrivePurgeResult {
  deleted: number;
  remaining: number;
}

class DriveRequestError extends SnapshotProviderError {
  constructor(
    code: SnapshotProviderErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(code, message);
    this.name = 'DriveRequestError';
  }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const utf8 = (value: string) => new TextEncoder().encode(value);

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function propertyClause(key: string, value: string): string {
  return `appProperties has { key='${key}' and value='${escapeQueryValue(value)}' }`;
}

export function driveMetadataKey(logicalKey: string): string {
  return utf8(PROP_KEY).length + utf8(logicalKey).length <= PROPERTY_PAIR_UTF8_CAP
    ? logicalKey
    : `h:${sha256Text(logicalKey)}`;
}

export function isTrustedDriveResumableUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'https:' && parsed.origin === GOOGLE_RESUMABLE_ORIGIN;
  } catch {
    return false;
  }
}

function objectKind(value: unknown): DriveObjectKind | null {
  return value === 'snapshot' || value === 'head' || value === 'media' || value === 'revocation'
    ? value
    : null;
}

function parseDriveFile(value: unknown): DriveFile {
  if (!value || typeof value !== 'object') {
    throw new SnapshotProviderError('invalid-data', 'Drive returned invalid file metadata');
  }
  const candidate = value as Partial<DriveFile>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.size !== 'string' ||
    typeof candidate.sha256Checksum !== 'string' ||
    !candidate.appProperties ||
    typeof candidate.appProperties !== 'object'
  ) {
    throw new SnapshotProviderError('invalid-data', 'Drive returned incomplete file metadata');
  }
  return candidate as DriveFile;
}

function parseDiscoveryFile(value: unknown): DriveFile | null {
  try {
    return parseDriveFile(value);
  } catch (error) {
    if (error instanceof SnapshotProviderError && error.code === 'invalid-data') return null;
    throw error;
  }
}

function logicalKey(file: DriveFile): string {
  const stored = file.appProperties[PROP_KEY];
  if (!stored || stored !== driveMetadataKey(file.name)) {
    throw new SnapshotProviderError('invalid-data', 'Drive returned mismatched logical-key metadata');
  }
  return file.name;
}

function parseByteCount(file: DriveFile): number {
  const value = Number(file.size);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SnapshotProviderError('invalid-data', 'Drive returned an invalid byte count');
  }
  return value;
}

function parseCreatedAt(file: DriveFile): number | null {
  if (!file.createdTime) return null;
  const value = Date.parse(file.createdTime);
  return Number.isNaN(value) ? null : value;
}

function requestBodyBytes(body: unknown): number {
  if (body instanceof Uint8Array) return body.byteLength;
  if (typeof body === 'string') return utf8(body).byteLength;
  return 0;
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

async function errorReason(response: DriveResponseLike): Promise<string | null> {
  try {
    const body = await response.json() as {
      error?: { errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] };
    };
    const reasons = [
      ...(body.error?.errors ?? []),
      ...(body.error?.details ?? []),
    ].map((value) => value.reason).filter((value): value is string =>
      typeof value === 'string');
    return reasons[0] ?? null;
  } catch {
    return null;
  }
}

function resultClass(error: DriveRequestError): DriveResultClass {
  if (error.code === 'authorization-required') return 'authorization';
  if (error.code === 'permission-denied') return 'permission';
  if (error.code === 'quota-full') return 'quota';
  if (error.code === 'rate-limited') return 'rate-limit';
  if (error.code === 'invalid-data') return 'invalid';
  if (error.status === 404 || error.status === 410) return 'not-found';
  return 'transient';
}

function mapStatus(
  status: number,
  reason: string | null,
  retryAfterMs: number | null,
): DriveRequestError {
  if (status === 401) {
    return new DriveRequestError('authorization-required', status, 'Drive authorization failed');
  }
  if (status === 403 && reason === 'storageQuotaExceeded') {
    return new DriveRequestError('quota-full', status, 'Drive storage quota is full');
  }
  if (status === 403 && [
    'userRateLimitExceeded', 'rateLimitExceeded', 'sharingRateLimitExceeded',
    'dailyLimitExceeded',
  ].includes(reason ?? '')) {
    return new DriveRequestError('rate-limited', status, 'Drive rate limit reached', retryAfterMs);
  }
  if (status === 403) {
    return new DriveRequestError('permission-denied', status, 'Drive permission denied');
  }
  if (status === 429) {
    return new DriveRequestError('rate-limited', status, 'Drive rate limit reached', retryAfterMs);
  }
  if (status === 400) {
    return new DriveRequestError('invalid-data', status, 'Drive rejected an invalid request');
  }
  if (status === 404 || status === 410) {
    return new DriveRequestError('transient', status, 'Drive object or cursor was not found');
  }
  if (status === 507) {
    return new DriveRequestError('quota-full', status, 'Drive storage quota is full');
  }
  return new DriveRequestError('transient', status, 'Drive request failed', retryAfterMs);
}

// TODO(cloud-sync): Split Drive transport/uploads, discovery, and metadata parsing
// into focused modules once the initial cloud-sync feature has landed.
export class GoogleDriveSnapshotProvider implements SnapshotProvider {
  private readonly auth: CloudAuthorization;
  private readonly state: DriveProviderStateStore;
  private readonly fetcher: DriveFetchLike;
  private readonly instrumentation?: DriveInstrumentationSink;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly immutableWrites = new Map<string, Promise<void>>();

  constructor(options: GoogleDriveSnapshotProviderOptions) {
    this.auth = options.auth;
    this.state = options.state;
    this.fetcher = options.fetch ?? defaultDriveFetch;
    this.instrumentation = options.instrumentation;
    this.sleep = options.sleep ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  async listRevocations(
    vaultId: string,
  ): Promise<('backup-deleted' | 'journal-deleted')[]> {
    const query = this.vaultQuery(vaultId,
      `name contains 'revocations/' and ${propertyClause(PROP_KIND, 'revocation')}`);
    const files = await this.queryFiles(vaultId, query);
    const values = files.map((file) => file.appProperties[PROP_REVOCATION])
      .filter((value): value is 'backup-deleted' | 'journal-deleted' =>
        value === 'backup-deleted' || value === 'journal-deleted');
    return [...new Set(values)].sort();
  }

  /** Discovers restorable snapshot vaults without exposing Drive file IDs. */
  async listAvailableVaults(): Promise<AvailableDriveVault[]> {
    const scope = '__vault-discovery__';
    const query = `'${APP_DATA}' in parents and trashed=false and ` +
      propertyClause(PROP_KIND, 'head');
    const files = await this.queryFiles(scope, query);
    const newest = new Map<string, number>();
    for (const file of files) {
      const vaultId = file.appProperties[PROP_VAULT];
      if (!vaultId || !/^[\x20-\x7e]+$/.test(vaultId) || utf8(vaultId).length > 128) continue;
      const record = await this.safeMaterializeRecord(vaultId, file, 'head');
      if (!record) continue;
      if (!record.head || record.head.vaultId !== vaultId) continue;
      newest.set(vaultId, Math.max(newest.get(vaultId) ?? 0, record.head.updatedAt));
    }
    return [...newest].map(([vaultId, updatedAt]) => ({ vaultId, updatedAt }))
      .sort((left, right) => right.updatedAt - left.updatedAt ||
        left.vaultId.localeCompare(right.vaultId));
  }

  async publishRevocation(
    vaultId: string,
    reason: 'backup-deleted' | 'journal-deleted',
  ): Promise<void> {
    const key = `revocations/${sha256Text(reason)}.json`;
    const bytes = encodeCanonicalBytes({ format: 'tackbok-revocation', reason });
    const hash = sha256Bytes(bytes);
    const existing = await this.queryExactKey(vaultId, key, 'revocation');
    if (existing.some((file) => file.sha256Checksum === hash &&
        parseByteCount(file) === bytes.byteLength &&
        file.appProperties[PROP_REVOCATION] === reason)) return;
    if (existing.length > 0) {
      throw new SnapshotProviderError('invalid-data', 'Revocation key has conflicting content');
    }
    const uploaded = await this.multipartUpload(
      vaultId,
      key,
      'revocation',
      bytes,
      'create',
      undefined,
      { [PROP_REVOCATION]: reason },
    );
    this.state.upsertFile(vaultId, this.record(uploaded, 'revocation', null));
  }

  /** Permanently purges a vault while preserving its revocation marker. */
  async purgeRevokedVault(vaultId: string): Promise<DrivePurgeResult> {
    const files = await this.queryFiles(vaultId, this.vaultQuery(vaultId));
    let deleted = 0;
    for (const file of files) {
      if (file.appProperties[PROP_KIND] === 'revocation') continue;
      await this.request(vaultId, 'delete', `${API}/files/${encodeURIComponent(file.id)}`,
        { method: 'DELETE' }, { idempotent: true, accepted: [404] });
      this.state.removeFile(vaultId, file.id);
      deleted += 1;
    }
    const remaining = (await this.queryFiles(vaultId, this.vaultQuery(vaultId)))
      .filter((file) => file.appProperties[PROP_KIND] !== 'revocation').length;
    return { deleted, remaining };
  }

  async listHeads(vaultId: string, refresh = true): Promise<ListedDeviceHead[]> {
    if (refresh) await this.refreshDiscovery(vaultId);
    else if (!this.state.loadDiscovery(vaultId).inventoryComplete) {
      await this.initializeDiscovery(vaultId);
    }
    return this.state.listKind(vaultId, 'head').map((record) => {
      if (!record.head) {
        throw new SnapshotProviderError('invalid-data', 'Cached Drive head has no validated envelope');
      }
      return { physicalId: record.fileId, head: { ...record.head } };
    });
  }

  async downloadSnapshot(vaultId: string, snapshotId: string): Promise<Uint8Array | null> {
    const key = this.snapshotKey(snapshotId);
    const candidates = await this.filesForKey(vaultId, key, 'snapshot');
    if (candidates.length === 0) return null;
    this.assertImmutableCandidates(candidates);
    if (candidates[0].byteCount > SNAPSHOT_CAPS.compressedBytes) {
      throw new SnapshotProviderError('invalid-data', 'Snapshot exceeds the compressed-byte cap');
    }
    return this.downloadVerified(vaultId, candidates[0]);
  }

  async uploadSnapshot(
    vaultId: string,
    snapshotId: string,
    bytes: Uint8Array,
    createdAt: number,
  ): Promise<void> {
    if (bytes.byteLength > SNAPSHOT_CAPS.compressedBytes) {
      throw new SnapshotProviderError('invalid-data', 'Snapshot exceeds the compressed-byte cap');
    }
    const key = this.snapshotKey(snapshotId);
    await this.putImmutable(vaultId, key, 'snapshot', bytes, createdAt);
  }

  async verifySnapshot(
    vaultId: string,
    snapshotId: string,
    expectedBytes: Uint8Array,
  ): Promise<boolean> {
    const candidates = await this.filesForKey(vaultId, this.snapshotKey(snapshotId), 'snapshot');
    if (candidates.length === 0) return false;
    const hash = sha256Bytes(expectedBytes);
    return candidates.every((candidate) =>
      candidate.contentSha256 === hash && candidate.byteCount === expectedBytes.byteLength);
  }

  async updateDeviceHead(vaultId: string, head: DeviceHead): Promise<void> {
    const key = this.headKey(head.deviceId);
    const bytes = encodeCanonicalBytes(head);
    const hash = sha256Bytes(bytes);
    const existing = this.state.listKey(vaultId, key).filter((file) => file.kind === 'head');
    const cachedId = existing.sort((left, right) => left.fileId.localeCompare(right.fileId))[0]
      ?.fileId;
    const selectedId = cachedId ?? (!this.state.loadDiscovery(vaultId).inventoryComplete
      ? (await this.queryExactKey(vaultId, key, 'head'))
        .sort((left, right) => left.id.localeCompare(right.id))[0]?.id
      : undefined);
    try {
      const uploaded = selectedId
        ? await this.multipartUpload(vaultId, key, 'head', bytes, 'update', selectedId)
        : await this.multipartUpload(vaultId, key, 'head', bytes, 'create');
      this.state.upsertFile(vaultId, this.record(uploaded, 'head', head));
    } catch (error) {
      if (!(error instanceof SnapshotProviderError) || error.code !== 'transient') throw error;
      const matching = await this.reconcileAmbiguousWrite(
        vaultId, key, 'head', hash, bytes.byteLength,
      );
      if (!matching) throw error;
      this.state.upsertFile(vaultId, this.record(matching, 'head', head));
    }
  }

  async hasMediaBatch(
    vaultId: string,
    blobHashes: readonly string[],
  ): Promise<Set<string>> {
    const unique = [...new Set(blobHashes)].sort();
    const found = new Set<string>();
    const unknown: string[] = [];
    for (const hash of unique) {
      const key = this.mediaKey(hash);
      const cached = this.state.listKey(vaultId, key)
        .some((file) => file.kind === 'media' && file.contentSha256 === hash);
      if (cached) found.add(hash);
      else unknown.push(hash);
    }
    for (let offset = 0; offset < unknown.length; offset += MEDIA_QUERY_GROUP) {
      const group = unknown.slice(offset, offset + MEDIA_QUERY_GROUP);
      if (group.length === 0) continue;
      const names = group.map((hash) => `name = '${this.mediaKey(hash)}'`).join(' or ');
      const files = await this.queryFiles(
        vaultId,
        this.vaultQuery(vaultId, `${propertyClause(PROP_KIND, 'media')} and (${names})`),
      );
      for (const file of files) {
        const record = this.record(file, 'media', null);
        if (record.logicalKey !== this.mediaKey(record.contentSha256)) continue;
        this.state.upsertFile(vaultId, record);
        found.add(record.contentSha256);
      }
    }
    return found;
  }

  async uploadMedia(
    vaultId: string,
    blobHash: string,
    source: MediaUploadSource,
  ): Promise<void> {
    if (source.contentHash !== blobHash || !Number.isSafeInteger(source.byteLength) ||
        source.byteLength < 0 || source.byteLength > SNAPSHOT_CAPS.mediaByteSize) {
      throw new SnapshotProviderError('invalid-data', 'Media source metadata is invalid');
    }
    await this.putImmutableMedia(vaultId, this.mediaKey(blobHash), source, this.now());
  }

  async downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: MediaDownloadSink,
  ): Promise<boolean> {
    const candidates = await this.filesForKey(vaultId, this.mediaKey(blobHash), 'media');
    if (candidates.length === 0) return false;
    this.assertImmutableCandidates(candidates);
    const file = candidates[0];
    if (file.contentSha256 !== blobHash || file.byteCount > SNAPSHOT_CAPS.mediaByteSize) {
      throw new SnapshotProviderError('invalid-data', 'Drive media metadata does not match its key');
    }
    try {
      await this.downloadMediaToSink(vaultId, file, sink);
      return true;
    } catch (error) {
      if (error instanceof MediaIntegrityError) return false;
      throw error;
    }
  }

  async listSnapshots(vaultId: string): Promise<SnapshotObject[]> {
    if (!this.state.loadDiscovery(vaultId).inventoryComplete) {
      await this.initializeDiscovery(vaultId);
    }
    const grouped = new Map<string, SnapshotObject>();
    for (const file of this.state.listKind(vaultId, 'snapshot')) {
      const match = /^snapshots\/([0-9a-f]{64})\.json\.gz$/.exec(file.logicalKey);
      if (!match) continue;
      const prior = grouped.get(match[1]);
      const candidate = {
        snapshotId: match[1],
        createdAt: file.createdAt ?? 0,
        byteCount: file.byteCount,
      };
      if (!prior || candidate.createdAt < prior.createdAt) grouped.set(match[1], candidate);
    }
    return [...grouped.values()].sort((left, right) =>
      left.createdAt - right.createdAt || left.snapshotId.localeCompare(right.snapshotId));
  }

  async deleteSnapshot(vaultId: string, snapshotId: string): Promise<void> {
    const key = this.snapshotKey(snapshotId);
    const candidates = await this.filesForKey(vaultId, key, 'snapshot');
    for (const candidate of candidates) {
      await this.request(vaultId, 'delete',
        `${API}/files/${encodeURIComponent(candidate.fileId)}`,
        { method: 'DELETE' },
        { idempotent: true, accepted: [404] });
      this.state.removeFile(vaultId, candidate.fileId);
    }
  }

  private async refreshDiscovery(vaultId: string, rebuilds = 0): Promise<void> {
    const discovery = this.state.loadDiscovery(vaultId);
    if (!discovery.inventoryComplete || !discovery.cursor) {
      await this.initializeDiscovery(vaultId, rebuilds);
      return;
    }
    let cursor = discovery.cursor;
    try {
      while (true) {
        const params = new URLSearchParams({
          pageToken: cursor,
          spaces: APP_DATA,
          pageSize: String(PAGE_SIZE),
          includeRemoved: 'true',
          fields: `nextPageToken,newStartPageToken,changes(removed,fileId,file(${FILE_FIELDS}))`,
        });
        const response = await this.request(
          vaultId,
          'list',
          `${API}/changes?${params}`,
          {},
          { idempotent: true },
        );
        const body = await response.json() as {
          nextPageToken?: unknown;
          newStartPageToken?: unknown;
          changes?: DriveChange[];
        };
        const files: DriveFileRecord[] = [];
        const removed: string[] = [];
        for (const change of body.changes ?? []) {
          if (change.removed && typeof change.fileId === 'string') {
            removed.push(change.fileId);
            continue;
          }
          if (!change.file) continue;
          const file = parseDiscoveryFile(change.file);
          if (!file) continue;
          if (file.appProperties[PROP_VAULT] !== vaultId) continue;
          const kind = objectKind(file.appProperties[PROP_KIND]);
          if (!kind) continue;
          const record = await this.safeMaterializeRecord(vaultId, file, kind, kind === 'head');
          if (record) files.push(record);
        }
        const next = typeof body.nextPageToken === 'string'
          ? body.nextPageToken
          : typeof body.newStartPageToken === 'string'
            ? body.newStartPageToken
            : cursor;
        this.state.applyChangePage(vaultId, files, removed, next);
        if (typeof body.nextPageToken !== 'string') return;
        cursor = body.nextPageToken;
      }
    } catch (error) {
      if (!(error instanceof DriveRequestError) ||
          ![400, 404, 410].includes(error.status)) throw error;
      if (rebuilds >= MAX_DISCOVERY_REBUILDS) {
        throw new SnapshotProviderError(
          'transient',
          'Drive rejected a freshly rebuilt discovery cursor',
        );
      }
      this.state.resetDiscovery(vaultId);
      await this.initializeDiscovery(vaultId, rebuilds + 1);
    }
  }

  private async initializeDiscovery(vaultId: string, rebuilds = 0): Promise<void> {
    const tokenResponse = await this.request(
      vaultId,
      'start-token',
      `${API}/changes/startPageToken?spaces=${APP_DATA}`,
      {},
      { idempotent: true },
    );
    const tokenBody = await tokenResponse.json() as { startPageToken?: unknown };
    if (typeof tokenBody.startPageToken !== 'string') {
      throw new SnapshotProviderError('invalid-data', 'Drive returned no start-page token');
    }
    const scope = `(name contains 'heads/' or name contains 'snapshots/') and (` +
      `${propertyClause(PROP_KIND, 'head')} or ${propertyClause(PROP_KIND, 'snapshot')})`;
    const query = this.vaultQuery(vaultId, scope);
    const initial = await this.queryFiles(vaultId, query);
    // Drive changes are authoritative only after startPageToken. A second
    // prefix scan reduces the real service's listing-visibility window for
    // objects that predate that token; the subsequent changes catch-up closes
    // the race for objects written after it. This costs two extra first-run
    // requests, keeping a one-head text restore at the approved ceiling of 8.
    await this.sleep(250);
    const repeated = await this.queryFiles(vaultId, query);
    const files = [...new Map([...initial, ...repeated].map((file) => [file.id, file])).values()];
    const records: DriveFileRecord[] = [];
    for (const file of files) {
      const kind = objectKind(file.appProperties[PROP_KIND]);
      if (kind !== 'head' && kind !== 'snapshot') continue;
      const record = await this.safeMaterializeRecord(vaultId, file, kind, kind === 'head');
      if (record) records.push(record);
    }
    this.state.replaceInitialInventory(vaultId, records, tokenBody.startPageToken);
    await this.refreshDiscovery(vaultId, rebuilds);
  }

  private async materializeRecord(
    vaultId: string,
    file: DriveFile,
    kind: DriveObjectKind,
  ): Promise<DriveFileRecord> {
    if (kind !== 'head') return this.record(file, kind, null);
    const cached = this.state.listKey(vaultId, logicalKey(file)).find((record) =>
      record.fileId === file.id &&
      record.kind === 'head' &&
      record.head !== null &&
      record.contentSha256 === file.sha256Checksum &&
      record.byteCount === parseByteCount(file));
    if (cached) return cached;
    const bytes = await this.downloadFile(vaultId, file);
    const parsed = parseJsonStrict(decodeUtf8Strict(bytes));
    if (!bytesEqual(bytes, encodeCanonicalBytes(parsed))) {
      throw new SnapshotProviderError('invalid-data', 'Drive head is not canonical JSON');
    }
    return this.record(file, kind, parsed as DeviceHead);
  }

  private async safeMaterializeRecord(
    vaultId: string,
    file: DriveFile,
    kind: DriveObjectKind,
    rejectInvalid = false,
  ): Promise<DriveFileRecord | null> {
    try {
      return await this.materializeRecord(vaultId, file, kind);
    } catch (error) {
      if (!(error instanceof SnapshotProviderError) || error.code !== 'invalid-data') throw error;
      this.state.removeFile(vaultId, file.id);
      if (rejectInvalid) throw error;
      return null;
    }
  }

  private async filesForKey(
    vaultId: string,
    key: string,
    kind: DriveObjectKind,
  ): Promise<DriveFileRecord[]> {
    const cached = this.state.listKey(vaultId, key).filter((file) => file.kind === kind);
    if (cached.length > 0) return cached;
    const files = await this.queryExactKey(vaultId, key, kind);
    const records: DriveFileRecord[] = [];
    for (const file of files) {
      const record = await this.safeMaterializeRecord(vaultId, file, kind, kind === 'head');
      if (!record) continue;
      this.state.upsertFile(vaultId, record);
      records.push(record);
    }
    return records.sort((left, right) => left.fileId.localeCompare(right.fileId));
  }

  private async queryExactKey(
    vaultId: string,
    key: string,
    kind: DriveObjectKind,
  ): Promise<DriveFile[]> {
    return this.queryFiles(vaultId, this.vaultQuery(vaultId,
      `name = '${escapeQueryValue(key)}' and ${propertyClause(PROP_KIND, kind)} and ` +
      propertyClause(PROP_KEY, driveMetadataKey(key))));
  }

  private async putImmutable(
    vaultId: string,
    key: string,
    kind: 'snapshot' | 'media',
    bytes: Uint8Array,
    createdAt: number,
  ): Promise<void> {
    return this.serializeImmutableWrite(vaultId, kind, key, () =>
      this.putImmutableOnce(vaultId, key, kind, bytes, createdAt));
  }

  private async putImmutableOnce(
    vaultId: string,
    key: string,
    kind: 'snapshot' | 'media',
    bytes: Uint8Array,
    createdAt: number,
  ): Promise<void> {
    const hash = sha256Bytes(bytes);
    const cached = this.state.listKey(vaultId, key).filter((file) => file.kind === kind);
    if (cached.length > 0) {
      if (cached.some((file) =>
        file.contentSha256 !== hash || file.byteCount !== bytes.byteLength)) {
        throw new SnapshotProviderError('invalid-data', 'Immutable Drive key has conflicting content');
      }
      return;
    }
    let uploaded: DriveFile | null = null;
    try {
      uploaded = bytes.byteLength <= MULTIPART_MAX_BYTES
        ? await this.multipartUpload(vaultId, key, kind, bytes, 'create')
        : await this.resumableUpload(vaultId, key, kind, bytes);
      const record = this.record(uploaded, kind, null);
      if (record.contentSha256 !== hash || record.byteCount !== bytes.byteLength) {
        throw new SnapshotProviderError('invalid-data', 'Drive upload checksum does not match');
      }
      this.state.upsertFile(vaultId, { ...record, createdAt });
    } catch (error) {
      if (uploaded && error instanceof SnapshotProviderError && error.code === 'invalid-data') {
        await this.deleteCreatedFileBestEffort(vaultId, uploaded.id);
      }
      if (!(error instanceof SnapshotProviderError) || error.code !== 'transient') throw error;
      const match = await this.reconcileAmbiguousWrite(
        vaultId, key, kind, hash, bytes.byteLength,
      );
      if (!match) throw error;
      this.state.upsertFile(vaultId, this.record(match, kind, null));
    }
  }

  private async putImmutableMedia(
    vaultId: string,
    key: string,
    source: MediaUploadSource,
    createdAt: number,
  ): Promise<void> {
    return this.serializeImmutableWrite(vaultId, 'media', key, () =>
      this.putImmutableMediaOnce(vaultId, key, source, createdAt));
  }

  private async putImmutableMediaOnce(
    vaultId: string,
    key: string,
    source: MediaUploadSource,
    createdAt: number,
  ): Promise<void> {
    const cached = this.state.listKey(vaultId, key).filter((file) => file.kind === 'media');
    if (cached.length > 0) {
      if (cached.some((file) => file.contentSha256 !== source.contentHash ||
          file.byteCount !== source.byteLength)) {
        throw new SnapshotProviderError('invalid-data', 'Immutable Drive key has conflicting content');
      }
      return;
    }
    let uploaded: DriveFile | null = null;
    try {
      if (source.byteLength <= MULTIPART_MAX_BYTES) {
        const bytes = source.byteLength === 0
          ? new Uint8Array()
          : await source.read(0, source.byteLength);
        if (bytes.byteLength !== source.byteLength) {
          throw new SnapshotProviderError('invalid-data', 'Media source ended before its declared size');
        }
        if (sha256Bytes(bytes) !== source.contentHash) {
          throw new SnapshotProviderError('invalid-data', 'Media source content changed before upload');
        }
        uploaded = await this.multipartUpload(vaultId, key, 'media', bytes, 'create');
      } else {
        uploaded = await this.resumableUploadSource(vaultId, key, source);
      }
      const record = this.record(uploaded, 'media', null);
      if (record.contentSha256 !== source.contentHash ||
          record.byteCount !== source.byteLength) {
        throw new SnapshotProviderError('invalid-data', 'Drive upload checksum does not match');
      }
      this.state.upsertFile(vaultId, { ...record, createdAt });
    } catch (error) {
      if (uploaded && error instanceof SnapshotProviderError && error.code === 'invalid-data') {
        await this.deleteCreatedFileBestEffort(vaultId, uploaded.id);
      }
      if (!(error instanceof SnapshotProviderError) || error.code !== 'transient') throw error;
      const match = await this.reconcileAmbiguousWrite(
        vaultId, key, 'media', source.contentHash, source.byteLength,
      );
      if (!match) throw error;
      this.state.upsertFile(vaultId, this.record(match, 'media', null));
    }
  }

  private async serializeImmutableWrite(
    vaultId: string,
    kind: 'snapshot' | 'media',
    key: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const identity = `${vaultId}\0${kind}\0${key}`;
    const previous = this.immutableWrites.get(identity);
    const running = (previous
      ? previous.catch(() => undefined).then(operation)
      : operation()).finally(() => {
      if (this.immutableWrites.get(identity) === running) this.immutableWrites.delete(identity);
    });
    this.immutableWrites.set(identity, running);
    return running;
  }

  private async deleteCreatedFileBestEffort(vaultId: string, fileId: string): Promise<void> {
    try {
      await this.request(vaultId, 'delete', `${API}/files/${encodeURIComponent(fileId)}`,
        { method: 'DELETE' }, { idempotent: true, accepted: [404] });
      this.state.removeFile(vaultId, fileId);
    } catch {
      // Discovery quarantines the inconsistent object if cleanup cannot complete.
    }
  }

  private async reconcileAmbiguousWrite(
    vaultId: string,
    key: string,
    kind: DriveObjectKind,
    expectedHash: string,
    expectedBytes: number,
  ): Promise<DriveFile | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const files = await this.queryExactKey(vaultId, key, kind);
      const match = files.find((file) =>
        file.sha256Checksum === expectedHash && parseByteCount(file) === expectedBytes);
      if (match) return match;
      if (attempt < 2) await this.sleep(250 * (attempt + 1));
    }
    return null;
  }

  private async multipartUpload(
    vaultId: string,
    key: string,
    kind: DriveObjectKind,
    bytes: Uint8Array,
    operation: 'create' | 'update',
    fileId?: string,
    extraProperties: Record<string, string> = {},
  ): Promise<DriveFile> {
    const boundary = `tackbok_${this.now().toString(36)}_${Math.floor(
      this.random() * Number.MAX_SAFE_INTEGER,
    ).toString(36)}`;
    const metadata = this.metadata(
      vaultId,
      key,
      kind,
      sha256Bytes(bytes),
      extraProperties,
      operation === 'create',
    );
    const payload = concatBytes([
      utf8(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      utf8(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes,
      utf8(`\r\n--${boundary}--`),
    ]);
    const target = operation === 'update'
      ? `${UPLOAD_API}/files/${encodeURIComponent(fileId!)}?uploadType=multipart&fields=${FILE_FIELDS}`
      : `${UPLOAD_API}/files?uploadType=multipart&fields=${FILE_FIELDS}`;
    const response = await this.request(
      vaultId,
      operation,
      target,
      {
        method: operation === 'update' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: payload,
      },
      { idempotent: operation === 'update' },
    );
    return parseDriveFile(await response.json());
  }

  private async resumableUpload(
    vaultId: string,
    key: string,
    kind: 'snapshot' | 'media',
    bytes: Uint8Array,
  ): Promise<DriveFile> {
    const hash = sha256Bytes(bytes);
    let session = this.state.getUploadSession(vaultId, key, hash);
    let uploaded = 0;
    if (session && (!isTrustedDriveResumableUri(session.uri) ||
        session.expiresAt <= this.now() || session.byteCount !== bytes.byteLength)) {
      this.state.deleteUploadSession(vaultId, key, hash);
      session = null;
    }
    if (session) {
      try {
        const status = await this.request(
          vaultId,
          'resumable-chunk',
          session.uri,
          {
            method: 'PUT',
            headers: {
              'Content-Length': '0',
              'Content-Range': `bytes */${bytes.byteLength}`,
            },
          },
          { idempotent: true, accepted: [200, 201, 308] },
        );
        if (status.status === 200 || status.status === 201) {
          this.state.deleteUploadSession(vaultId, key, hash);
          return parseDriveFile(await status.json());
        }
        const range = /^bytes=0-(\d+)$/.exec(status.headers.get('range') ?? '');
        uploaded = range ? Number(range[1]) + 1 : 0;
        if (uploaded > bytes.byteLength ||
            (uploaded < bytes.byteLength && uploaded % CHUNK_SIZE !== 0)) {
          this.state.deleteUploadSession(vaultId, key, hash);
          throw new SnapshotProviderError('invalid-data', 'Drive returned an invalid upload offset');
        }
      } catch (error) {
        if (!(error instanceof DriveRequestError) || ![404, 410].includes(error.status)) {
          throw error;
        }
        this.state.deleteUploadSession(vaultId, key, hash);
        session = null;
      }
    }
    if (!session) {
      const response = await this.request(
        vaultId,
        'resumable-start',
        `${UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'application/octet-stream',
            'X-Upload-Content-Length': String(bytes.byteLength),
          },
          body: JSON.stringify(this.metadata(vaultId, key, kind, hash)),
        },
        { idempotent: false },
      );
      const uri = response.headers.get('location');
      if (!uri || !isTrustedDriveResumableUri(uri)) {
        throw new SnapshotProviderError('invalid-data', 'Drive returned an untrusted upload session');
      }
      session = {
        logicalKey: key,
        contentSha256: hash,
        uri,
        expiresAt: this.now() + SESSION_LIFETIME_MS,
        byteCount: bytes.byteLength,
        uploadedBytes: 0,
      };
      this.state.setUploadSession(vaultId, session);
    }

    try {
      while (uploaded < bytes.byteLength) {
        const end = Math.min(uploaded + CHUNK_SIZE, bytes.byteLength);
        const final = end === bytes.byteLength;
        const response = await this.request(
          vaultId,
          'resumable-chunk',
          session.uri,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(end - uploaded),
              'Content-Range': `bytes ${uploaded}-${end - 1}/${bytes.byteLength}`,
            },
            body: bytes.slice(uploaded, end),
          },
          { idempotent: true, accepted: final ? [200, 201] : [308] },
        );
        uploaded = end;
        this.state.setUploadSession(vaultId, { ...session, uploadedBytes: uploaded });
        if (final) {
          this.state.deleteUploadSession(vaultId, key, hash);
          return parseDriveFile(await response.json());
        }
      }
    } catch (error) {
      if (error instanceof DriveRequestError && [404, 410].includes(error.status)) {
        this.state.deleteUploadSession(vaultId, key, hash);
      }
      throw error;
    }
    throw new SnapshotProviderError('transient', 'Drive resumable upload did not complete');
  }

  private async resumableUploadSource(
    vaultId: string,
    key: string,
    source: MediaUploadSource,
  ): Promise<DriveFile> {
    const hash = source.contentHash;
    let session = this.state.getUploadSession(vaultId, key, hash);
    let uploaded = session?.uploadedBytes ?? 0;
    if (session && (!isTrustedDriveResumableUri(session.uri) ||
        session.expiresAt <= this.now() || session.byteCount !== source.byteLength ||
        uploaded < 0 || uploaded > source.byteLength)) {
      this.state.deleteUploadSession(vaultId, key, hash);
      session = null;
      uploaded = 0;
    }
    if (session) {
      try {
        const status = await this.request(vaultId, 'resumable-chunk', session.uri, {
          method: 'PUT',
          headers: {
            'Content-Length': '0',
            'Content-Range': `bytes */${source.byteLength}`,
          },
        }, { idempotent: true, accepted: [200, 201, 308] });
        if (status.status === 200 || status.status === 201) {
          this.state.deleteUploadSession(vaultId, key, hash);
          return parseDriveFile(await status.json());
        }
        const range = /^bytes=0-(\d+)$/.exec(status.headers.get('range') ?? '');
        uploaded = range ? Number(range[1]) + 1 : 0;
        if (uploaded > source.byteLength ||
            (uploaded < source.byteLength && uploaded % (256 * 1024) !== 0)) {
          this.state.deleteUploadSession(vaultId, key, hash);
          throw new SnapshotProviderError('invalid-data', 'Drive returned an invalid upload offset');
        }
        session = { ...session, uploadedBytes: uploaded };
        this.state.setUploadSession(vaultId, session);
      } catch (error) {
        if (!(error instanceof DriveRequestError) || ![404, 410].includes(error.status)) {
          throw error;
        }
        this.state.deleteUploadSession(vaultId, key, hash);
        session = null;
        uploaded = 0;
      }
    }
    if (!session) {
      const response = await this.request(
        vaultId,
        'resumable-start',
        `${UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'application/octet-stream',
            'X-Upload-Content-Length': String(source.byteLength),
          },
          body: JSON.stringify(this.metadata(vaultId, key, 'media', hash)),
        },
        { idempotent: false },
      );
      const uri = response.headers.get('location');
      if (!uri || !isTrustedDriveResumableUri(uri)) {
        throw new SnapshotProviderError('invalid-data', 'Drive returned an untrusted upload session');
      }
      session = {
        logicalKey: key,
        contentSha256: hash,
        uri,
        expiresAt: this.now() + SESSION_LIFETIME_MS,
        byteCount: source.byteLength,
        uploadedBytes: 0,
      };
      this.state.setUploadSession(vaultId, session);
    }

    try {
      while (uploaded < source.byteLength) {
        const requested = Math.min(MEDIA_CHUNK_SIZE, source.byteLength - uploaded);
        const chunk = await source.read(uploaded, requested);
        if (chunk.byteLength !== requested) {
          throw new SnapshotProviderError('invalid-data', 'Media source ended before its declared size');
        }
        const end = uploaded + chunk.byteLength;
        const final = end === source.byteLength;
        const response = await this.request(vaultId, 'resumable-chunk', session.uri, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(chunk.byteLength),
            'Content-Range': `bytes ${uploaded}-${end - 1}/${source.byteLength}`,
          },
          body: chunk,
        }, { idempotent: true, accepted: final ? [200, 201] : [308] });
        uploaded = end;
        session = { ...session, uploadedBytes: uploaded };
        this.state.setUploadSession(vaultId, session);
        if (final) {
          this.state.deleteUploadSession(vaultId, key, hash);
          return parseDriveFile(await response.json());
        }
      }
    } catch (error) {
      if (error instanceof DriveRequestError && [404, 410].includes(error.status)) {
        this.state.deleteUploadSession(vaultId, key, hash);
      }
      throw error;
    }
    throw new SnapshotProviderError('transient', 'Drive resumable media upload did not complete');
  }

  private async downloadVerified(
    vaultId: string,
    file: DriveFileRecord,
  ): Promise<Uint8Array> {
    const metadata: DriveFile = {
      id: file.fileId,
      name: file.logicalKey,
      size: String(file.byteCount),
      sha256Checksum: file.contentSha256,
      appProperties: {
        [PROP_VAULT]: vaultId,
        [PROP_KEY]: driveMetadataKey(file.logicalKey),
        [PROP_HASH]: file.contentSha256,
        [PROP_KIND]: file.kind,
      },
    };
    return this.downloadFile(vaultId, metadata);
  }

  private async downloadFile(vaultId: string, file: DriveFile): Promise<Uint8Array> {
    const kind = objectKind(file.appProperties[PROP_KIND]);
    const declaredBytes = parseByteCount(file);
    const byteCap = kind === 'head' ? HEAD_MAX_BYTES : SNAPSHOT_CAPS.compressedBytes;
    if (declaredBytes > byteCap) {
      throw new SnapshotProviderError('invalid-data', `Drive ${kind ?? 'object'} exceeds its byte cap`);
    }
    const response = await this.request(
      vaultId,
      'download',
      `${API}/files/${encodeURIComponent(file.id)}?alt=media`,
      {},
      { idempotent: true },
    );
    const responseLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(responseLength) && responseLength > byteCap) {
      throw new SnapshotProviderError('invalid-data', 'Drive download exceeds its byte cap');
    }
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          receivedBytes += value.byteLength;
          if (receivedBytes > byteCap) {
            throw new SnapshotProviderError('invalid-data', 'Drive download exceeded its byte cap');
          }
          chunks.push(new Uint8Array(value));
        }
      }
    } else {
      const value = new Uint8Array(await response.arrayBuffer());
      if (value.byteLength > byteCap) {
        throw new SnapshotProviderError('invalid-data', 'Drive download exceeded its byte cap');
      }
      chunks.push(value);
    }
    const bytes = concatBytes(chunks);
    if (bytes.byteLength !== parseByteCount(file) ||
        sha256Bytes(bytes) !== file.sha256Checksum) {
      throw new SnapshotProviderError('invalid-data', 'Drive download checksum does not match');
    }
    return bytes;
  }

  private async downloadMediaToSink(
    vaultId: string,
    file: DriveFileRecord,
    sink: MediaDownloadSink,
  ): Promise<void> {
    let offset = await sink.byteLength();
    if (offset > file.byteCount) {
      await sink.reset();
      offset = 0;
    }
    if (offset === file.byteCount) {
      await sink.verifyAndPromote(file.byteCount, file.contentSha256);
      return;
    }
    const response = await this.request(
      vaultId,
      'download',
      `${API}/files/${encodeURIComponent(file.fileId)}?alt=media`,
      offset > 0 ? { headers: { Range: `bytes=${offset}-` } } : {},
      { idempotent: true, accepted: [206] },
    );
    if (offset > 0 && response.status === 200) {
      await sink.reset();
      offset = 0;
    }
    const pending: Uint8Array[] = [];
    let pendingBytes = 0;
    const flush = async () => {
      if (pendingBytes === 0) return;
      const combined = concatBytes(pending);
      pending.length = 0;
      pendingBytes = 0;
      await sink.appendAndSync(combined);
      offset += combined.byteLength;
    };
    if (!response.body) {
      throw new SnapshotProviderError('transient', 'Drive did not provide a streaming media body');
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      let consumed = 0;
      while (consumed < value.byteLength) {
        const accepted = Math.min(MEDIA_CHUNK_SIZE - pendingBytes, value.byteLength - consumed);
        pending.push(value.subarray(consumed, consumed + accepted));
        pendingBytes += accepted;
        consumed += accepted;
        if (pendingBytes === MEDIA_CHUNK_SIZE) await flush();
      }
    }
    await flush();
    if (offset !== file.byteCount) {
      throw new SnapshotProviderError(
        'transient',
        `Drive media download stopped before its declared size`,
      );
    }
    await sink.verifyAndPromote(file.byteCount, file.contentSha256);
  }

  private async queryFiles(vaultId: string, query: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        spaces: APP_DATA,
        q: query,
        pageSize: String(PAGE_SIZE),
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await this.request(
        vaultId,
        'list',
        `${API}/files?${params}`,
        {},
        { idempotent: true },
      );
      const body = await response.json() as { files?: unknown[]; nextPageToken?: unknown };
      for (const value of body.files ?? []) {
        const file = parseDiscoveryFile(value);
        if (file) files.push(file);
      }
      pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined;
    } while (pageToken);
    return files;
  }

  private metadata(
    vaultId: string,
    key: string,
    kind: DriveObjectKind,
    hash: string,
    extraProperties: Record<string, string> = {},
    includeParent = true,
  ): object {
    return {
      name: key,
      ...(includeParent ? { parents: [APP_DATA] } : {}),
      appProperties: {
        [PROP_VAULT]: vaultId,
        [PROP_KEY]: driveMetadataKey(key),
        [PROP_HASH]: hash,
        [PROP_KIND]: kind,
        ...extraProperties,
      },
    };
  }

  private record(
    file: DriveFile,
    expectedKind: DriveObjectKind,
    head: DeviceHead | null,
  ): DriveFileRecord {
    const kind = objectKind(file.appProperties[PROP_KIND]);
    if (kind !== expectedKind || file.appProperties[PROP_HASH] !== file.sha256Checksum) {
      throw new SnapshotProviderError('invalid-data', 'Drive file metadata is internally inconsistent');
    }
    return {
      fileId: file.id,
      logicalKey: logicalKey(file),
      kind,
      contentSha256: file.sha256Checksum,
      byteCount: parseByteCount(file),
      createdAt: parseCreatedAt(file),
      head: head ? { ...head } : null,
    };
  }

  private assertImmutableCandidates(candidates: readonly DriveFileRecord[]): void {
    const identities = new Set(candidates.map((candidate) =>
      `${candidate.contentSha256}:${candidate.byteCount}`));
    if (identities.size > 1) {
      throw new SnapshotProviderError('invalid-data', 'Immutable Drive key has conflicting duplicates');
    }
  }

  private snapshotKey(snapshotId: string): string {
    return `snapshots/${snapshotId}.json.gz`;
  }

  private headKey(deviceId: string): string {
    return `heads/${deviceId}.json`;
  }

  private mediaKey(blobHash: string): string {
    return `media/${blobHash.slice(0, 2)}/${blobHash}`;
  }

  private vaultQuery(vaultId: string, suffix?: string): string {
    return `'${APP_DATA}' in parents and trashed=false and ` +
      `${propertyClause(PROP_VAULT, vaultId)}${suffix ? ` and (${suffix})` : ''}`;
  }

  private async request(
    vaultId: string,
    methodClass: DriveMethodClass,
    url: string,
    init: Record<string, unknown> = {},
    options: { idempotent: boolean; accepted?: readonly number[] },
  ): Promise<DriveResponseLike> {
    const accepted = options.accepted ?? [];
    const retryNotBefore = this.state.loadDiscovery(vaultId).retryNotBefore;
    if (retryNotBefore > this.now()) {
      throw new DriveRequestError(
        'rate-limited',
        429,
        'Drive retry window is still active',
        retryNotBefore - this.now(),
      );
    }
    let authRetried = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let token: string;
      try {
        token = await this.auth.getFreshAccessToken();
      } catch (error) {
        if (error instanceof CloudAuthError) {
          const code = providerErrorCodeForAuthError(error.code);
          throw new SnapshotProviderError(
            code,
            code === 'transient'
              ? 'Google authorization is temporarily unavailable'
              : 'Google Drive authorization required',
          );
        }
        throw error;
      }
      const started = this.now();
      let response: DriveResponseLike;
      try {
        response = await this.fetcher(url, {
          ...init,
          headers: {
            ...((init.headers as Record<string, string> | undefined) ?? {}),
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        const error = new DriveRequestError('transient', 0, 'Unable to reach Google Drive');
        this.recordAttempt(methodClass, error, started, init.body, null, attempt > 0);
        if (options.idempotent && attempt < 2) {
          await this.sleep(this.retryDelay(attempt));
          continue;
        }
        throw error;
      }
      if (response.ok || accepted.includes(response.status)) {
        this.recordAttempt(methodClass, null, started, init.body, response, attempt > 0);
        return response;
      }
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), this.now());
      const error = mapStatus(response.status, await errorReason(response), retryAfterMs);
      this.recordAttempt(methodClass, error, started, init.body, response, attempt > 0);
      if (response.status === 401 && !authRetried) {
        authRetried = true;
        await this.auth.clearInvalidAccessToken();
        continue;
      }
      if (error.code === 'rate-limited' && retryAfterMs !== null) {
        this.state.setRetryNotBefore(vaultId, this.now() + retryAfterMs);
      }
      if (options.idempotent && attempt < 2 &&
          (error.code === 'rate-limited' || error.code === 'transient') &&
          ![404, 410].includes(error.status)) {
        await this.sleep(Math.min(retryAfterMs ?? this.retryDelay(attempt), MAX_RETRY_DELAY_MS));
        continue;
      }
      throw error;
    }
    throw new SnapshotProviderError('transient', 'Drive retry limit reached');
  }

  private retryDelay(attempt: number): number {
    return Math.min(
      BASE_RETRY_DELAY_MS * (2 ** attempt) + Math.floor(this.random() * 1_000),
      MAX_RETRY_DELAY_MS,
    );
  }

  private recordAttempt(
    methodClass: DriveMethodClass,
    error: DriveRequestError | null,
    startedAt: number,
    requestBody: unknown,
    response: DriveResponseLike | null,
    retry: boolean,
  ): void {
    if (!this.instrumentation) return;
    const responseLength = response?.headers.get('content-length');
    const parsedResponseLength = responseLength === null || responseLength === undefined
      ? null
      : Number(responseLength);
    this.instrumentation.record({
      methodClass,
      resultClass: error ? resultClass(error) : 'success',
      durationBucket: driveDurationBucket(Math.max(0, this.now() - startedAt)),
      requestBytesBucket: driveByteBucket(requestBodyBytes(requestBody)),
      responseBytesBucket: parsedResponseLength !== null &&
        Number.isSafeInteger(parsedResponseLength) && parsedResponseLength >= 0
        ? driveByteBucket(parsedResponseLength)
        : 'unknown',
      retry,
      quotaUnits: driveQuotaUnits(methodClass),
    });
  }
}
