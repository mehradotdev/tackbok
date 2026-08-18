import { CloudAuthError, type CloudAuthorization } from '../../auth/types';
import { canonicalBytesV2 } from '../canonical';
import { SNAPSHOT_V2_CAPS } from '../caps';
import { sha256BytesV2, sha256TextV2 } from '../sha256';
import { decodeUtf8Strict, parseJsonStrictV2 } from '../strictJson';
import type {
  DeviceHeadV2,
  ListedDeviceHeadV2,
  SnapshotObjectV2,
  SnapshotV2Provider,
  V2MediaDownloadSink,
  V2MediaUploadSource,
  V2ProviderErrorCode,
} from '../sync/types';
import { V2MediaIntegrityError, V2ProviderError } from '../sync/types';
import {
  driveV2ByteBucket,
  driveV2DurationBucket,
  driveV2QuotaUnits,
  type DriveV2InstrumentationSink,
  type DriveV2MethodClass,
  type DriveV2ResultClass,
} from './instrumentation';
import type {
  DriveV2FileRecord,
  DriveV2ObjectKind,
  DriveV2ProviderStateStore,
} from './state';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_DATA = 'appDataFolder';
const GOOGLE_RESUMABLE_ORIGIN = 'https://www.googleapis.com';
const PROP_VAULT = 'tb_v2_vault';
const PROP_KEY = 'tb_v2_key';
const PROP_HASH = 'tb_v2_hash';
const PROP_KIND = 'tb_v2_kind';
const PROP_REVOCATION = 'tb_v2_revocation';
const FILE_FIELDS = 'id,name,size,createdTime,sha256Checksum,appProperties,trashed';
const PAGE_SIZE = 1_000;
const MEDIA_QUERY_GROUP = 50;
const CHUNK_SIZE = 256 * 1024;
const MEDIA_CHUNK_SIZE = 8 * 1024 * 1024;
const MULTIPART_MAX_BYTES = 5 * 1024 * 1024;
const SESSION_LIFETIME_MS = 6 * 24 * 60 * 60 * 1_000;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const PROPERTY_PAIR_UTF8_CAP = 124;
const MAX_DISCOVERY_REBUILDS = 1;

interface DriveFileV2 {
  id: string;
  name: string;
  size: string;
  createdTime?: string;
  sha256Checksum: string;
  trashed?: boolean;
  appProperties: Record<string, string>;
}

interface DriveChangeV2 {
  removed?: boolean;
  fileId?: string;
  file?: unknown;
}

export interface DriveV2ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body?: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  } | null;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type DriveV2FetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<DriveV2ResponseLike>;

const defaultDriveV2Fetch: DriveV2FetchLike = async (url, init) => {
  const { fetch } = await import('expo/fetch');
  return fetch(url, init as never) as unknown as DriveV2ResponseLike;
};

export interface GoogleDriveSnapshotV2ProviderOptions {
  auth: CloudAuthorization;
  state: DriveV2ProviderStateStore;
  fetch?: DriveV2FetchLike;
  instrumentation?: DriveV2InstrumentationSink;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  /** Destructive probe helpers remain unreachable in production bundles. */
  enableDevProbeMethods?: boolean;
}

export interface AvailableDriveV2Vault {
  vaultId: string;
  updatedAt: number;
}

export interface DriveV2PurgeResult {
  deleted: number;
  remaining: number;
}

class DriveV2RequestError extends V2ProviderError {
  constructor(
    code: V2ProviderErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(code, message);
    this.name = 'DriveV2RequestError';
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

export function driveV2MetadataKey(logicalKey: string): string {
  return utf8(PROP_KEY).length + utf8(logicalKey).length <= PROPERTY_PAIR_UTF8_CAP
    ? logicalKey
    : `h:${sha256TextV2(logicalKey)}`;
}

export function isTrustedDriveV2ResumableUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'https:' && parsed.origin === GOOGLE_RESUMABLE_ORIGIN;
  } catch {
    return false;
  }
}

function objectKind(value: unknown): DriveV2ObjectKind | null {
  return value === 'snapshot' || value === 'head' || value === 'media' || value === 'revocation'
    ? value
    : null;
}

function parseDriveFile(value: unknown): DriveFileV2 {
  if (!value || typeof value !== 'object') {
    throw new V2ProviderError('invalid-data', 'Drive returned invalid file metadata');
  }
  const candidate = value as Partial<DriveFileV2>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.size !== 'string' ||
    typeof candidate.sha256Checksum !== 'string' ||
    !candidate.appProperties ||
    typeof candidate.appProperties !== 'object'
  ) {
    throw new V2ProviderError('invalid-data', 'Drive returned incomplete file metadata');
  }
  return candidate as DriveFileV2;
}

function logicalKey(file: DriveFileV2): string {
  const stored = file.appProperties[PROP_KEY];
  if (!stored || stored !== driveV2MetadataKey(file.name)) {
    throw new V2ProviderError('invalid-data', 'Drive returned mismatched logical-key metadata');
  }
  return file.name;
}

function parseByteCount(file: DriveFileV2): number {
  const value = Number(file.size);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new V2ProviderError('invalid-data', 'Drive returned an invalid byte count');
  }
  return value;
}

function parseCreatedAt(file: DriveFileV2): number | null {
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

async function errorReason(response: DriveV2ResponseLike): Promise<string | null> {
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

function resultClass(error: DriveV2RequestError): DriveV2ResultClass {
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
): DriveV2RequestError {
  if (status === 401) {
    return new DriveV2RequestError('authorization-required', status, 'Drive authorization failed');
  }
  if (status === 403 && reason === 'storageQuotaExceeded') {
    return new DriveV2RequestError('quota-full', status, 'Drive storage quota is full');
  }
  if (status === 403 && [
    'userRateLimitExceeded', 'rateLimitExceeded', 'sharingRateLimitExceeded',
  ].includes(reason ?? '')) {
    return new DriveV2RequestError('rate-limited', status, 'Drive rate limit reached', retryAfterMs);
  }
  if (status === 403) {
    return new DriveV2RequestError('permission-denied', status, 'Drive permission denied');
  }
  if (status === 429) {
    return new DriveV2RequestError('rate-limited', status, 'Drive rate limit reached', retryAfterMs);
  }
  if (status === 400) {
    return new DriveV2RequestError('invalid-data', status, 'Drive rejected an invalid request');
  }
  if (status === 404 || status === 410) {
    return new DriveV2RequestError('transient', status, 'Drive object or cursor was not found');
  }
  if (status === 507) {
    return new DriveV2RequestError('quota-full', status, 'Drive storage quota is full');
  }
  return new DriveV2RequestError('transient', status, 'Drive request failed', retryAfterMs);
}

export class GoogleDriveSnapshotV2Provider implements SnapshotV2Provider {
  private readonly auth: CloudAuthorization;
  private readonly state: DriveV2ProviderStateStore;
  private readonly fetcher: DriveV2FetchLike;
  private readonly instrumentation?: DriveV2InstrumentationSink;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly devProbeMethodsEnabled: boolean;

  constructor(options: GoogleDriveSnapshotV2ProviderOptions) {
    this.auth = options.auth;
    this.state = options.state;
    this.fetcher = options.fetch ?? defaultDriveV2Fetch;
    this.instrumentation = options.instrumentation;
    this.sleep = options.sleep ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.devProbeMethodsEnabled = __DEV__ && options.enableDevProbeMethods === true;
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

  /** Discovers restorable protocol-v2 vaults without exposing Drive file IDs. */
  async listAvailableVaults(): Promise<AvailableDriveV2Vault[]> {
    const scope = '__v2-vault-discovery__';
    const query = `'${APP_DATA}' in parents and trashed=false and ` +
      propertyClause(PROP_KIND, 'head');
    const files = await this.queryFiles(scope, query);
    const newest = new Map<string, number>();
    for (const file of files) {
      const vaultId = file.appProperties[PROP_VAULT];
      if (!vaultId || !/^[\x20-\x7e]+$/.test(vaultId) || utf8(vaultId).length > 128) continue;
      const record = await this.materializeRecord(vaultId, file, 'head');
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
    const key = `revocations/${sha256TextV2(reason)}.json`;
    const bytes = canonicalBytesV2({ format: 'tackbok-revocation', formatVersion: 2, reason });
    const hash = sha256BytesV2(bytes);
    const existing = await this.queryExactKey(vaultId, key, 'revocation');
    if (existing.some((file) => file.sha256Checksum === hash &&
        parseByteCount(file) === bytes.byteLength &&
        file.appProperties[PROP_REVOCATION] === reason)) return;
    if (existing.length > 0) {
      throw new V2ProviderError('invalid-data', 'Revocation key has conflicting content');
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
  async purgeRevokedVault(vaultId: string): Promise<DriveV2PurgeResult> {
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

  async listHeads(vaultId: string, refresh = true): Promise<ListedDeviceHeadV2[]> {
    if (refresh) await this.refreshDiscovery(vaultId);
    else if (!this.state.loadDiscovery(vaultId).inventoryComplete) {
      await this.initializeDiscovery(vaultId);
    }
    return this.state.listKind(vaultId, 'head').map((record) => {
      if (!record.head) {
        throw new V2ProviderError('invalid-data', 'Cached Drive head has no validated envelope');
      }
      return { physicalId: record.fileId, head: { ...record.head } };
    });
  }

  async downloadSnapshot(vaultId: string, snapshotId: string): Promise<Uint8Array | null> {
    const key = this.snapshotKey(snapshotId);
    const candidates = await this.filesForKey(vaultId, key, 'snapshot');
    if (candidates.length === 0) return null;
    this.assertImmutableCandidates(candidates);
    return this.downloadVerified(vaultId, candidates[0]);
  }

  async uploadSnapshot(
    vaultId: string,
    snapshotId: string,
    bytes: Uint8Array,
    createdAt: number,
  ): Promise<void> {
    if (bytes.byteLength > SNAPSHOT_V2_CAPS.compressedBytes) {
      throw new V2ProviderError('invalid-data', 'Snapshot exceeds the compressed-byte cap');
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
    const hash = sha256BytesV2(expectedBytes);
    return candidates.every((candidate) =>
      candidate.contentSha256 === hash && candidate.byteCount === expectedBytes.byteLength);
  }

  async updateDeviceHead(vaultId: string, head: DeviceHeadV2): Promise<void> {
    const key = this.headKey(head.deviceId);
    const bytes = canonicalBytesV2(head);
    const hash = sha256BytesV2(bytes);
    const existing = this.state.listKey(vaultId, key).filter((file) => file.kind === 'head');
    const selected = existing.sort((left, right) => left.fileId.localeCompare(right.fileId))[0];
    try {
      const uploaded = selected
        ? await this.multipartUpload(vaultId, key, 'head', bytes, 'update', selected.fileId)
        : await this.multipartUpload(vaultId, key, 'head', bytes, 'create');
      this.state.upsertFile(vaultId, this.record(uploaded, 'head', head));
    } catch (error) {
      if (!(error instanceof V2ProviderError) || error.code !== 'transient') throw error;
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
    source: V2MediaUploadSource,
  ): Promise<void> {
    if (source.contentHash !== blobHash || !Number.isSafeInteger(source.byteLength) ||
        source.byteLength < 0 || source.byteLength > SNAPSHOT_V2_CAPS.mediaByteSize) {
      throw new V2ProviderError('invalid-data', 'Media source metadata is invalid');
    }
    await this.putImmutableMedia(vaultId, this.mediaKey(blobHash), source, this.now());
  }

  async downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: V2MediaDownloadSink,
  ): Promise<boolean> {
    const candidates = await this.filesForKey(vaultId, this.mediaKey(blobHash), 'media');
    if (candidates.length === 0) return false;
    this.assertImmutableCandidates(candidates);
    const file = candidates[0];
    if (file.contentSha256 !== blobHash || file.byteCount > SNAPSHOT_V2_CAPS.mediaByteSize) {
      throw new V2ProviderError('invalid-data', 'Drive media metadata does not match its key');
    }
    try {
      await this.downloadMediaToSink(vaultId, file, sink);
      return true;
    } catch (error) {
      if (error instanceof V2MediaIntegrityError) return false;
      throw error;
    }
  }

  async listSnapshots(vaultId: string): Promise<SnapshotObjectV2[]> {
    if (!this.state.loadDiscovery(vaultId).inventoryComplete) {
      await this.initializeDiscovery(vaultId);
    }
    const grouped = new Map<string, SnapshotObjectV2>();
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
      try {
        await this.request(vaultId, 'delete',
          `${API}/files/${encodeURIComponent(candidate.fileId)}`,
          { method: 'DELETE' },
          { idempotent: true, accepted: [404] });
      } finally {
        this.state.removeFile(vaultId, candidate.fileId);
      }
    }
  }

  /** Probe-only creation of a second physical name for duplicate-head evidence. */
  async createPhysicalHeadForProbe(vaultId: string, head: DeviceHeadV2): Promise<void> {
    this.assertDevProbeMethodsEnabled();
    const bytes = canonicalBytesV2(head);
    const uploaded = await this.multipartUpload(
      vaultId,
      this.headKey(head.deviceId),
      'head',
      bytes,
      'create',
    );
    this.state.upsertFile(vaultId, this.record(uploaded, 'head', head));
  }

  async createRevocationForProbe(
    vaultId: string,
    reason: 'backup-deleted' | 'journal-deleted',
  ): Promise<void> {
    this.assertDevProbeMethodsEnabled();
    await this.publishRevocation(vaultId, reason);
  }

  async deleteAllForProbe(vaultId: string): Promise<number> {
    this.assertDevProbeMethodsEnabled();
    const files = await this.queryFiles(vaultId, this.vaultQuery(vaultId));
    let deleted = 0;
    for (const file of files) {
      await this.request(vaultId, 'delete', `${API}/files/${encodeURIComponent(file.id)}`,
        { method: 'DELETE' }, { idempotent: true, accepted: [404] });
      this.state.removeFile(vaultId, file.id);
      deleted += 1;
    }
    this.state.resetDiscovery(vaultId);
    return deleted;
  }

  setCursorForProbe(vaultId: string, cursor: string): void {
    this.assertDevProbeMethodsEnabled();
    this.state.applyChangePage(vaultId, [], [], cursor);
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
          changes?: DriveChangeV2[];
        };
        const files: DriveV2FileRecord[] = [];
        const removed: string[] = [];
        for (const change of body.changes ?? []) {
          if (change.removed && typeof change.fileId === 'string') {
            removed.push(change.fileId);
            continue;
          }
          if (!change.file) continue;
          const file = parseDriveFile(change.file);
          if (file.appProperties[PROP_VAULT] !== vaultId) continue;
          const kind = objectKind(file.appProperties[PROP_KIND]);
          if (!kind) continue;
          files.push(await this.materializeRecord(vaultId, file, kind));
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
      if (!(error instanceof DriveV2RequestError) ||
          ![400, 404, 410].includes(error.status)) throw error;
      if (rebuilds >= MAX_DISCOVERY_REBUILDS) {
        throw new V2ProviderError(
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
      throw new V2ProviderError('invalid-data', 'Drive returned no start-page token');
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
    const records: DriveV2FileRecord[] = [];
    for (const file of files) {
      const kind = objectKind(file.appProperties[PROP_KIND]);
      if (kind !== 'head' && kind !== 'snapshot') continue;
      records.push(await this.materializeRecord(vaultId, file, kind));
    }
    this.state.replaceInitialInventory(vaultId, records, tokenBody.startPageToken);
    await this.refreshDiscovery(vaultId, rebuilds);
  }

  private assertDevProbeMethodsEnabled(): void {
    if (!this.devProbeMethodsEnabled) {
      throw new Error('Destructive Drive probe methods are disabled');
    }
  }

  private async materializeRecord(
    vaultId: string,
    file: DriveFileV2,
    kind: DriveV2ObjectKind,
  ): Promise<DriveV2FileRecord> {
    if (kind !== 'head') return this.record(file, kind, null);
    const cached = this.state.listKey(vaultId, logicalKey(file)).find((record) =>
      record.fileId === file.id &&
      record.kind === 'head' &&
      record.head !== null &&
      record.contentSha256 === file.sha256Checksum &&
      record.byteCount === parseByteCount(file));
    if (cached) return cached;
    const bytes = await this.downloadFile(vaultId, file);
    const parsed = parseJsonStrictV2(decodeUtf8Strict(bytes));
    if (!bytesEqual(bytes, canonicalBytesV2(parsed))) {
      throw new V2ProviderError('invalid-data', 'Drive head is not canonical JSON');
    }
    return this.record(file, kind, parsed as DeviceHeadV2);
  }

  private async filesForKey(
    vaultId: string,
    key: string,
    kind: DriveV2ObjectKind,
  ): Promise<DriveV2FileRecord[]> {
    const cached = this.state.listKey(vaultId, key).filter((file) => file.kind === kind);
    if (cached.length > 0) return cached;
    const files = await this.queryExactKey(vaultId, key, kind);
    const records: DriveV2FileRecord[] = [];
    for (const file of files) {
      const record = await this.materializeRecord(vaultId, file, kind);
      this.state.upsertFile(vaultId, record);
      records.push(record);
    }
    return records.sort((left, right) => left.fileId.localeCompare(right.fileId));
  }

  private async queryExactKey(
    vaultId: string,
    key: string,
    kind: DriveV2ObjectKind,
  ): Promise<DriveFileV2[]> {
    return this.queryFiles(vaultId, this.vaultQuery(vaultId,
      `name = '${escapeQueryValue(key)}' and ${propertyClause(PROP_KIND, kind)} and ` +
      propertyClause(PROP_KEY, driveV2MetadataKey(key))));
  }

  private async putImmutable(
    vaultId: string,
    key: string,
    kind: 'snapshot' | 'media',
    bytes: Uint8Array,
    createdAt: number,
  ): Promise<void> {
    const hash = sha256BytesV2(bytes);
    const cached = this.state.listKey(vaultId, key).filter((file) => file.kind === kind);
    if (cached.length > 0) {
      if (cached.some((file) =>
        file.contentSha256 !== hash || file.byteCount !== bytes.byteLength)) {
        throw new V2ProviderError('invalid-data', 'Immutable Drive key has conflicting content');
      }
      return;
    }
    try {
      const uploaded = bytes.byteLength <= MULTIPART_MAX_BYTES
        ? await this.multipartUpload(vaultId, key, kind, bytes, 'create')
        : await this.resumableUpload(vaultId, key, kind, bytes);
      const record = this.record(uploaded, kind, null);
      if (record.contentSha256 !== hash || record.byteCount !== bytes.byteLength) {
        throw new V2ProviderError('invalid-data', 'Drive upload checksum does not match');
      }
      this.state.upsertFile(vaultId, { ...record, createdAt });
    } catch (error) {
      if (!(error instanceof V2ProviderError) || error.code !== 'transient') throw error;
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
    source: V2MediaUploadSource,
    createdAt: number,
  ): Promise<void> {
    const cached = this.state.listKey(vaultId, key).filter((file) => file.kind === 'media');
    if (cached.length > 0) {
      if (cached.some((file) => file.contentSha256 !== source.contentHash ||
          file.byteCount !== source.byteLength)) {
        throw new V2ProviderError('invalid-data', 'Immutable Drive key has conflicting content');
      }
      return;
    }
    try {
      let uploaded: DriveFileV2;
      if (source.byteLength <= MULTIPART_MAX_BYTES) {
        const bytes = source.byteLength === 0
          ? new Uint8Array()
          : await source.read(0, source.byteLength);
        if (bytes.byteLength !== source.byteLength) {
          throw new V2ProviderError('invalid-data', 'Media source ended before its declared size');
        }
        if (sha256BytesV2(bytes) !== source.contentHash) {
          throw new V2ProviderError('invalid-data', 'Media source content changed before upload');
        }
        uploaded = await this.multipartUpload(vaultId, key, 'media', bytes, 'create');
      } else {
        uploaded = await this.resumableUploadSource(vaultId, key, source);
      }
      const record = this.record(uploaded, 'media', null);
      if (record.contentSha256 !== source.contentHash ||
          record.byteCount !== source.byteLength) {
        throw new V2ProviderError('invalid-data', 'Drive upload checksum does not match');
      }
      this.state.upsertFile(vaultId, { ...record, createdAt });
    } catch (error) {
      if (!(error instanceof V2ProviderError) || error.code !== 'transient') throw error;
      const match = await this.reconcileAmbiguousWrite(
        vaultId, key, 'media', source.contentHash, source.byteLength,
      );
      if (!match) throw error;
      this.state.upsertFile(vaultId, this.record(match, 'media', null));
    }
  }

  private async reconcileAmbiguousWrite(
    vaultId: string,
    key: string,
    kind: DriveV2ObjectKind,
    expectedHash: string,
    expectedBytes: number,
  ): Promise<DriveFileV2 | null> {
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
    kind: DriveV2ObjectKind,
    bytes: Uint8Array,
    operation: 'create' | 'update',
    fileId?: string,
    extraProperties: Record<string, string> = {},
  ): Promise<DriveFileV2> {
    const boundary = `tackbok_v2_${this.now().toString(36)}`;
    const metadata = this.metadata(
      vaultId,
      key,
      kind,
      sha256BytesV2(bytes),
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
  ): Promise<DriveFileV2> {
    const hash = sha256BytesV2(bytes);
    let session = this.state.getUploadSession(vaultId, key, hash);
    let uploaded = 0;
    if (session && (!isTrustedDriveV2ResumableUri(session.uri) ||
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
          throw new V2ProviderError('invalid-data', 'Drive returned an invalid upload offset');
        }
      } catch (error) {
        if (!(error instanceof DriveV2RequestError) || ![404, 410].includes(error.status)) {
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
      if (!uri || !isTrustedDriveV2ResumableUri(uri)) {
        throw new V2ProviderError('invalid-data', 'Drive returned an untrusted upload session');
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
      if (error instanceof DriveV2RequestError && [404, 410].includes(error.status)) {
        this.state.deleteUploadSession(vaultId, key, hash);
      }
      throw error;
    }
    throw new V2ProviderError('transient', 'Drive resumable upload did not complete');
  }

  private async resumableUploadSource(
    vaultId: string,
    key: string,
    source: V2MediaUploadSource,
  ): Promise<DriveFileV2> {
    const hash = source.contentHash;
    let session = this.state.getUploadSession(vaultId, key, hash);
    let uploaded = session?.uploadedBytes ?? 0;
    if (session && (!isTrustedDriveV2ResumableUri(session.uri) ||
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
          throw new V2ProviderError('invalid-data', 'Drive returned an invalid upload offset');
        }
        session = { ...session, uploadedBytes: uploaded };
        this.state.setUploadSession(vaultId, session);
      } catch (error) {
        if (!(error instanceof DriveV2RequestError) || ![404, 410].includes(error.status)) {
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
      if (!uri || !isTrustedDriveV2ResumableUri(uri)) {
        throw new V2ProviderError('invalid-data', 'Drive returned an untrusted upload session');
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
          throw new V2ProviderError('invalid-data', 'Media source ended before its declared size');
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
      if (error instanceof DriveV2RequestError && [404, 410].includes(error.status)) {
        this.state.deleteUploadSession(vaultId, key, hash);
      }
      throw error;
    }
    throw new V2ProviderError('transient', 'Drive resumable media upload did not complete');
  }

  private async downloadVerified(
    vaultId: string,
    file: DriveV2FileRecord,
  ): Promise<Uint8Array> {
    const metadata: DriveFileV2 = {
      id: file.fileId,
      name: file.logicalKey,
      size: String(file.byteCount),
      sha256Checksum: file.contentSha256,
      appProperties: {
        [PROP_VAULT]: vaultId,
        [PROP_KEY]: driveV2MetadataKey(file.logicalKey),
        [PROP_HASH]: file.contentSha256,
        [PROP_KIND]: file.kind,
      },
    };
    return this.downloadFile(vaultId, metadata);
  }

  private async downloadFile(vaultId: string, file: DriveFileV2): Promise<Uint8Array> {
    const response = await this.request(
      vaultId,
      'download',
      `${API}/files/${encodeURIComponent(file.id)}?alt=media`,
      {},
      { idempotent: true },
    );
    const chunks: Uint8Array[] = [];
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) chunks.push(new Uint8Array(value));
      }
    } else {
      chunks.push(new Uint8Array(await response.arrayBuffer()));
    }
    const bytes = concatBytes(chunks);
    if (bytes.byteLength !== parseByteCount(file) ||
        sha256BytesV2(bytes) !== file.sha256Checksum) {
      throw new V2ProviderError('invalid-data', 'Drive download checksum does not match');
    }
    return bytes;
  }

  private async downloadMediaToSink(
    vaultId: string,
    file: DriveV2FileRecord,
    sink: V2MediaDownloadSink,
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
      throw new V2ProviderError('transient', 'Drive did not provide a streaming media body');
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
      throw new V2ProviderError(
        'transient',
        `Drive media download stopped before its declared size`,
      );
    }
    await sink.verifyAndPromote(file.byteCount, file.contentSha256);
  }

  private async queryFiles(vaultId: string, query: string): Promise<DriveFileV2[]> {
    const files: DriveFileV2[] = [];
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
      files.push(...(body.files ?? []).map(parseDriveFile));
      pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined;
    } while (pageToken);
    return files;
  }

  private metadata(
    vaultId: string,
    key: string,
    kind: DriveV2ObjectKind,
    hash: string,
    extraProperties: Record<string, string> = {},
    includeParent = true,
  ): object {
    return {
      name: key,
      ...(includeParent ? { parents: [APP_DATA] } : {}),
      appProperties: {
        [PROP_VAULT]: vaultId,
        [PROP_KEY]: driveV2MetadataKey(key),
        [PROP_HASH]: hash,
        [PROP_KIND]: kind,
        ...extraProperties,
      },
    };
  }

  private record(
    file: DriveFileV2,
    expectedKind: DriveV2ObjectKind,
    head: DeviceHeadV2 | null,
  ): DriveV2FileRecord {
    const kind = objectKind(file.appProperties[PROP_KIND]);
    if (kind !== expectedKind || file.appProperties[PROP_HASH] !== file.sha256Checksum) {
      throw new V2ProviderError('invalid-data', 'Drive file metadata is internally inconsistent');
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

  private assertImmutableCandidates(candidates: readonly DriveV2FileRecord[]): void {
    const identities = new Set(candidates.map((candidate) =>
      `${candidate.contentSha256}:${candidate.byteCount}`));
    if (identities.size > 1) {
      throw new V2ProviderError('invalid-data', 'Immutable Drive key has conflicting duplicates');
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
    methodClass: DriveV2MethodClass,
    url: string,
    init: Record<string, unknown> = {},
    options: { idempotent: boolean; accepted?: readonly number[] },
  ): Promise<DriveV2ResponseLike> {
    const accepted = options.accepted ?? [];
    const retryNotBefore = this.state.loadDiscovery(vaultId).retryNotBefore;
    if (retryNotBefore > this.now()) {
      throw new DriveV2RequestError(
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
          throw new V2ProviderError('authorization-required', 'Google Drive authorization required');
        }
        throw error;
      }
      const started = this.now();
      let response: DriveV2ResponseLike;
      try {
        response = await this.fetcher(url, {
          ...init,
          headers: {
            ...((init.headers as Record<string, string> | undefined) ?? {}),
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        const error = new DriveV2RequestError('transient', 0, 'Unable to reach Google Drive');
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
    throw new V2ProviderError('transient', 'Drive retry limit reached');
  }

  private retryDelay(attempt: number): number {
    return Math.min(
      BASE_RETRY_DELAY_MS * (2 ** attempt) + Math.floor(this.random() * 1_000),
      MAX_RETRY_DELAY_MS,
    );
  }

  private recordAttempt(
    methodClass: DriveV2MethodClass,
    error: DriveV2RequestError | null,
    startedAt: number,
    requestBody: unknown,
    response: DriveV2ResponseLike | null,
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
      durationBucket: driveV2DurationBucket(Math.max(0, this.now() - startedAt)),
      requestBytesBucket: driveV2ByteBucket(requestBodyBytes(requestBody)),
      responseBytesBucket: parsedResponseLength !== null &&
        Number.isSafeInteger(parsedResponseLength) && parsedResponseLength >= 0
        ? driveV2ByteBucket(parsedResponseLength)
        : 'unknown',
      retry,
      quotaUnits: driveV2QuotaUnits(methodClass),
    });
  }
}
