import type { CloudAuthorization } from '../../auth/types';
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
} from '../sync/types';
import { MediaIntegrityError, SnapshotProviderError } from '../sync/types';
import { DriveDiscovery } from './discovery';
import type { DriveInstrumentationSink, DriveMethodClass } from './instrumentation';
import type {
  DriveFileRecord,
  DriveObjectKind,
  DriveProviderStateStore,
} from './state';
import {
  DriveRequestError,
  DriveTransport,
  type DriveFetchLike,
  type DriveResponseLike,
} from './transport';

export type { DriveFetchLike, DriveResponseLike } from './transport';

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
const PROPERTY_PAIR_UTF8_CAP = 124;

export interface DriveFile {
  id: string;
  name: string;
  size: string;
  createdTime?: string;
  sha256Checksum: string;
  trashed?: boolean;
  appProperties: Record<string, string>;
}

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

// TODO(cloud-sync): Split Drive transport/uploads, discovery, and metadata parsing
// into focused modules once the initial cloud-sync feature has landed.
export class GoogleDriveSnapshotProvider implements SnapshotProvider {
  private readonly state: DriveProviderStateStore;
  private readonly transport: DriveTransport;
  private readonly discovery: DriveDiscovery;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly immutableWrites = new Map<string, Promise<void>>();

  constructor(options: GoogleDriveSnapshotProviderOptions) {
    this.state = options.state;
    this.sleep = options.sleep ?? ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.transport = new DriveTransport({
      auth: options.auth,
      state: options.state,
      fetch: options.fetch,
      instrumentation: options.instrumentation,
      sleep: this.sleep,
      random: this.random,
      now: this.now,
    });
    this.discovery = new DriveDiscovery({
      state: this.state,
      request: (...args) => this.request(...args),
      queryFiles: (vaultId, query) => this.queryFiles(vaultId, query),
      parseFile: parseDiscoveryFile,
      kindOf: objectKind,
      materialize: (vaultId, file, kind, rejectInvalid) =>
        this.safeMaterializeRecord(vaultId, file, kind, rejectInvalid),
      vaultQuery: (vaultId, suffix) => this.vaultQuery(vaultId, suffix),
      propertyClause,
      sleep: this.sleep,
    });
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
    if (refresh) await this.discovery.refresh(vaultId);
    else if (!this.state.loadDiscovery(vaultId).inventoryComplete) {
      await this.discovery.refresh(vaultId);
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
      await this.discovery.refresh(vaultId);
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
    return this.resumableUploadFromSource(
      vaultId,
      key,
      kind,
      {
        byteLength: bytes.byteLength,
        contentHash: sha256Bytes(bytes),
        read: async (offset, length) => bytes.slice(offset, offset + length),
      },
      CHUNK_SIZE,
    );
  }

  private async resumableUploadSource(
    vaultId: string,
    key: string,
    source: MediaUploadSource,
  ): Promise<DriveFile> {
    return this.resumableUploadFromSource(
      vaultId,
      key,
      'media',
      source,
      MEDIA_CHUNK_SIZE,
    );
  }

  private async resumableUploadFromSource(
    vaultId: string,
    key: string,
    kind: 'snapshot' | 'media',
    source: MediaUploadSource,
    chunkSize: number,
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
            (uploaded < source.byteLength && uploaded % CHUNK_SIZE !== 0)) {
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
        byteCount: source.byteLength,
        uploadedBytes: 0,
      };
      this.state.setUploadSession(vaultId, session);
    }

    try {
      while (uploaded < source.byteLength) {
        const requested = Math.min(chunkSize, source.byteLength - uploaded);
        const chunk = await source.read(uploaded, requested);
        if (chunk.byteLength !== requested) {
          throw new SnapshotProviderError('invalid-data', 'Upload source ended before its declared size');
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
    throw new SnapshotProviderError('transient', 'Drive resumable upload did not complete');
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
    return this.transport.request(vaultId, methodClass, url, init, options);
  }
}
