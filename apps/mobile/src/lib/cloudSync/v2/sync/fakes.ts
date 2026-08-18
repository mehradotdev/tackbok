import { canonicalizeV2 } from '../canonical';
import type { SnapshotDomainV2 } from '../types';
import type { SQLiteV2SyncStateStore } from './sqliteState';
import type {
  BaseShadowFileStore,
  DeviceHeadV2,
  ListedDeviceHeadV2,
  SnapshotObjectV2,
  SnapshotV2JournalStore,
  SnapshotV2MediaStore,
  SnapshotV2Provider,
  V2MediaDownloadSink,
  V2MediaUploadSource,
  V2ProviderError,
} from './types';

export type FakeV2ProviderOperation =
  | 'list-revocations'
  | 'list-heads'
  | 'download-snapshot'
  | 'upload-snapshot'
  | 'verify-snapshot'
  | 'update-head'
  | 'has-media'
  | 'upload-media'
  | 'download-media'
  | 'list-snapshots'
  | 'delete-snapshot';

interface Fault {
  operation: FakeV2ProviderOperation;
  error: V2ProviderError;
  afterMutation: boolean;
}

interface StoredSnapshot {
  bytes: Uint8Array;
  createdAt: number;
}

const cloneBytes = (bytes: Uint8Array) => bytes.slice();

function memorySource(bytes: Uint8Array, contentHash: string): V2MediaUploadSource {
  return {
    byteLength: bytes.byteLength,
    contentHash,
    async read(offset, length) {
      return bytes.slice(offset, Math.min(bytes.byteLength, offset + length));
    },
  };
}

async function readSource(source: V2MediaUploadSource): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < source.byteLength) {
    const chunk = await source.read(offset, Math.min(1024 * 1024, source.byteLength - offset));
    if (chunk.byteLength === 0) throw new Error('Media source ended early');
    chunks.push(chunk);
    offset += chunk.byteLength;
  }
  const result = new Uint8Array(source.byteLength);
  let written = 0;
  for (const chunk of chunks) {
    result.set(chunk, written);
    written += chunk.byteLength;
  }
  return result;
}

export class FakeSnapshotV2Provider implements SnapshotV2Provider {
  readonly requests: FakeV2ProviderOperation[] = [];
  private readonly snapshots = new Map<string, StoredSnapshot>();
  private readonly heads = new Map<string, ListedDeviceHeadV2[]>();
  private readonly media = new Map<string, Uint8Array>();
  private readonly revocations = new Map<string, ('backup-deleted' | 'journal-deleted')[]>();
  private readonly faults: Fault[] = [];
  private physicalSequence = 0;

  private key(vaultId: string, value: string): string {
    return `${vaultId}\0${value}`;
  }

  failNext(
    operation: FakeV2ProviderOperation,
    error: V2ProviderError,
    afterMutation = false,
  ): void {
    this.faults.push({ operation, error, afterMutation });
  }

  private takeFault(operation: FakeV2ProviderOperation, afterMutation: boolean): void {
    const index = this.faults.findIndex((fault) =>
      fault.operation === operation && fault.afterMutation === afterMutation);
    if (index >= 0) throw this.faults.splice(index, 1)[0].error;
  }

  private before(operation: FakeV2ProviderOperation): void {
    this.requests.push(operation);
    this.takeFault(operation, false);
  }

  setRevocations(vaultId: string, values: ('backup-deleted' | 'journal-deleted')[]): void {
    this.revocations.set(vaultId, [...values]);
  }

  injectPhysicalHead(head: DeviceHeadV2, physicalId?: string): void {
    const values = this.heads.get(head.vaultId) ?? [];
    values.push({
      physicalId: physicalId ?? `physical-${++this.physicalSequence}`,
      head: structuredClone(head),
    });
    this.heads.set(head.vaultId, values);
  }

  injectSnapshot(vaultId: string, snapshotId: string, bytes: Uint8Array, createdAt: number): void {
    this.snapshots.set(this.key(vaultId, snapshotId), { bytes: cloneBytes(bytes), createdAt });
  }

  physicalHeads(vaultId: string): ListedDeviceHeadV2[] {
    return structuredClone(this.heads.get(vaultId) ?? []);
  }

  removeDeviceHeadForTest(vaultId: string, deviceId: string): void {
    const remaining = (this.heads.get(vaultId) ?? [])
      .filter((candidate) => candidate.head.deviceId !== deviceId);
    this.heads.set(vaultId, remaining);
  }

  snapshotIds(vaultId: string): string[] {
    return [...this.snapshots.keys()]
      .filter((key) => key.startsWith(`${vaultId}\0`))
      .map((key) => key.slice(vaultId.length + 1))
      .sort();
  }

  removeMediaForTest(vaultId: string, blobHash: string): void {
    this.media.delete(this.key(vaultId, blobHash));
  }

  async listRevocations(vaultId: string) {
    this.before('list-revocations');
    return [...(this.revocations.get(vaultId) ?? [])];
  }

  async listHeads(vaultId: string): Promise<ListedDeviceHeadV2[]> {
    this.before('list-heads');
    return this.physicalHeads(vaultId);
  }

  async downloadSnapshot(vaultId: string, snapshotId: string): Promise<Uint8Array | null> {
    this.before('download-snapshot');
    return this.snapshots.get(this.key(vaultId, snapshotId))?.bytes.slice() ?? null;
  }

  async uploadSnapshot(
    vaultId: string,
    snapshotId: string,
    bytes: Uint8Array,
    createdAt: number,
  ): Promise<void> {
    this.before('upload-snapshot');
    const key = this.key(vaultId, snapshotId);
    const existing = this.snapshots.get(key);
    if (existing && !bytesEqual(existing.bytes, bytes)) {
      throw new Error('Immutable snapshot ID collision');
    }
    this.snapshots.set(key, { bytes: cloneBytes(bytes), createdAt });
    this.takeFault('upload-snapshot', true);
  }

  async verifySnapshot(
    vaultId: string,
    snapshotId: string,
    expectedBytes: Uint8Array,
  ): Promise<boolean> {
    this.before('verify-snapshot');
    const stored = this.snapshots.get(this.key(vaultId, snapshotId))?.bytes;
    return Boolean(stored && bytesEqual(stored, expectedBytes));
  }

  async updateDeviceHead(vaultId: string, head: DeviceHeadV2): Promise<void> {
    this.before('update-head');
    const values = (this.heads.get(vaultId) ?? [])
      .filter((candidate) => candidate.head.deviceId !== head.deviceId);
    values.push({
      physicalId: `physical-${++this.physicalSequence}`,
      head: structuredClone(head),
    });
    this.heads.set(vaultId, values);
    this.takeFault('update-head', true);
  }

  async hasMediaBatch(vaultId: string, blobHashes: readonly string[]): Promise<Set<string>> {
    this.before('has-media');
    return new Set(blobHashes.filter((blobHash) =>
      this.media.has(this.key(vaultId, blobHash))));
  }

  async uploadMedia(
    vaultId: string,
    blobHash: string,
    source: V2MediaUploadSource,
  ): Promise<void> {
    this.before('upload-media');
    this.media.set(this.key(vaultId, blobHash), await readSource(source));
    this.takeFault('upload-media', true);
  }

  async downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: V2MediaDownloadSink,
  ): Promise<boolean> {
    this.before('download-media');
    const bytes = this.media.get(this.key(vaultId, blobHash));
    if (!bytes) return false;
    const offset = await sink.byteLength();
    if (offset > bytes.byteLength) await sink.reset();
    const resumedAt = Math.min(await sink.byteLength(), bytes.byteLength);
    if (resumedAt < bytes.byteLength) await sink.appendAndSync(bytes.slice(resumedAt));
    await sink.verifyAndPromote(bytes.byteLength, blobHash);
    return true;
  }

  async listSnapshots(vaultId: string): Promise<SnapshotObjectV2[]> {
    this.before('list-snapshots');
    return [...this.snapshots.entries()]
      .filter(([key]) => key.startsWith(`${vaultId}\0`))
      .map(([key, value]) => ({
        snapshotId: key.slice(vaultId.length + 1),
        createdAt: value.createdAt,
        byteCount: value.bytes.length,
      }))
      .sort((left, right) => left.createdAt - right.createdAt ||
        left.snapshotId.localeCompare(right.snapshotId));
  }

  async deleteSnapshot(vaultId: string, snapshotId: string): Promise<void> {
    this.before('delete-snapshot');
    this.snapshots.delete(this.key(vaultId, snapshotId));
    this.takeFault('delete-snapshot', true);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export class MemoryBaseShadowFileStore implements BaseShadowFileStore {
  readonly files = new Map<string, Uint8Array>();
  readonly fsynced = new Set<string>();
  readonly quarantined: string[] = [];

  async writeTempAndFsync(fileName: string, bytes: Uint8Array): Promise<void> {
    this.files.set(fileName, cloneBytes(bytes));
    this.fsynced.add(fileName);
  }

  async read(fileName: string): Promise<Uint8Array> {
    const bytes = this.files.get(fileName);
    if (!bytes) throw new Error('File not found');
    return cloneBytes(bytes);
  }

  async replaceAndFsync(tempFileName: string, finalFileName: string): Promise<void> {
    if (!this.fsynced.has(tempFileName)) throw new Error('Attempted rename before fsync');
    const bytes = this.files.get(tempFileName);
    if (!bytes) throw new Error('Temporary file not found');
    this.files.set(finalFileName, bytes);
    this.files.delete(tempFileName);
    this.fsynced.delete(tempFileName);
    this.fsynced.add(finalFileName);
  }

  async quarantine(fileName: string): Promise<void> {
    const bytes = this.files.get(fileName);
    if (!bytes) return;
    const target = `quarantine-${this.quarantined.length}-${fileName}`;
    this.files.set(target, bytes);
    this.files.delete(fileName);
    this.quarantined.push(target);
  }

  async delete(fileName: string): Promise<void> {
    this.files.delete(fileName);
    this.fsynced.delete(fileName);
  }
}

export class MemorySnapshotV2MediaStore implements SnapshotV2MediaStore {
  readonly media = new Map<string, Uint8Array>();

  async hasVerified(blobHash: string): Promise<boolean> {
    return this.media.has(blobHash);
  }

  /** Test-only seed helper; production media never crosses this whole-buffer API. */
  async writeVerified(blobHash: string, bytes: Uint8Array): Promise<void> {
    this.media.set(blobHash, cloneBytes(bytes));
  }

  async openVerifiedSource(blobHash: string): Promise<V2MediaUploadSource | null> {
    const bytes = this.media.get(blobHash);
    return bytes ? memorySource(bytes, blobHash) : null;
  }

  async openDownloadSink(blobHash: string): Promise<V2MediaDownloadSink> {
    let partial = new Uint8Array();
    return {
      byteLength: async () => partial.byteLength,
      appendAndSync: async (bytes) => {
        const next = new Uint8Array(partial.byteLength + bytes.byteLength);
        next.set(partial);
        next.set(bytes, partial.byteLength);
        partial = next;
      },
      reset: async () => { partial = new Uint8Array(); },
      verifyAndPromote: async (expectedByteLength, expectedSha256) => {
        if (expectedSha256 !== blobHash || partial.byteLength !== expectedByteLength) {
          throw new Error('Invalid in-memory media download');
        }
        this.media.set(blobHash, partial.slice());
      },
    };
  }
}

export class MemorySnapshotV2JournalStore implements SnapshotV2JournalStore {
  applyCount = 0;
  private domain: SnapshotDomainV2;

  constructor(
    initial: SnapshotDomainV2,
    private readonly state: SQLiteV2SyncStateStore,
    private readonly vaultId: string,
    private readonly deviceId: string,
  ) {
    this.domain = structuredClone(initial);
  }

  mutate(next: SnapshotDomainV2): number {
    this.domain = structuredClone(next);
    return this.state.markDirty(this.vaultId, this.deviceId);
  }

  current(): SnapshotDomainV2 {
    return structuredClone(this.domain);
  }

  async capture() {
    const generation = this.state.loadState(this.vaultId, this.deviceId).journalGeneration;
    return { domain: structuredClone(this.domain), generation };
  }

  async applyMergedIfGeneration(
    domain: SnapshotDomainV2,
    expectedGeneration: number,
  ): Promise<boolean> {
    const current = this.state.loadState(this.vaultId, this.deviceId).journalGeneration;
    if (current !== expectedGeneration) return false;
    this.applyCount += 1;
    if (canonicalizeV2(this.domain) !== canonicalizeV2(domain)) {
      this.domain = structuredClone(domain);
    }
    return true;
  }
}
