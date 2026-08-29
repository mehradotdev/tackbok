import { canonicalize } from '../canonical';
import type { SnapshotDomain } from '../types';
import type { SQLiteSyncStateStore } from './sqliteState';
import type {
  BaseShadowFileStore,
  DeviceHead,
  ListedDeviceHead,
  SnapshotObject,
  SnapshotJournalStore,
  SnapshotMediaStore,
  SnapshotProvider,
  MediaDownloadSink,
  MediaUploadSource,
  SnapshotProviderError,
} from './types';

export type FakeProviderOperation =
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
  operation: FakeProviderOperation;
  error: SnapshotProviderError;
  afterMutation: boolean;
}

interface StoredSnapshot {
  bytes: Uint8Array;
  createdAt: number;
}

const cloneBytes = (bytes: Uint8Array) => bytes.slice();

function memorySource(bytes: Uint8Array, contentHash: string): MediaUploadSource {
  return {
    byteLength: bytes.byteLength,
    contentHash,
    async read(offset, length) {
      return bytes.slice(offset, Math.min(bytes.byteLength, offset + length));
    },
  };
}

async function readSource(source: MediaUploadSource): Promise<Uint8Array> {
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

export class FakeSnapshotProvider implements SnapshotProvider {
  readonly requests: FakeProviderOperation[] = [];
  private readonly snapshots = new Map<string, StoredSnapshot>();
  private readonly heads = new Map<string, ListedDeviceHead[]>();
  private readonly media = new Map<string, Uint8Array>();
  private readonly revocations = new Map<string, ('backup-deleted' | 'journal-deleted')[]>();
  private readonly faults: Fault[] = [];
  private physicalSequence = 0;

  private key(vaultId: string, value: string): string {
    return `${vaultId}\0${value}`;
  }

  failNext(
    operation: FakeProviderOperation,
    error: SnapshotProviderError,
    afterMutation = false,
  ): void {
    this.faults.push({ operation, error, afterMutation });
  }

  private takeFault(operation: FakeProviderOperation, afterMutation: boolean): void {
    const index = this.faults.findIndex((fault) =>
      fault.operation === operation && fault.afterMutation === afterMutation);
    if (index >= 0) throw this.faults.splice(index, 1)[0].error;
  }

  private before(operation: FakeProviderOperation): void {
    this.requests.push(operation);
    this.takeFault(operation, false);
  }

  setRevocations(vaultId: string, values: ('backup-deleted' | 'journal-deleted')[]): void {
    this.revocations.set(vaultId, [...values]);
  }

  injectPhysicalHead(head: DeviceHead, physicalId?: string): void {
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

  physicalHeads(vaultId: string): ListedDeviceHead[] {
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

  async listHeads(vaultId: string): Promise<ListedDeviceHead[]> {
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

  async updateDeviceHead(vaultId: string, head: DeviceHead): Promise<void> {
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
    source: MediaUploadSource,
  ): Promise<void> {
    this.before('upload-media');
    this.media.set(this.key(vaultId, blobHash), await readSource(source));
    this.takeFault('upload-media', true);
  }

  async downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: MediaDownloadSink,
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

  async listSnapshots(vaultId: string): Promise<SnapshotObject[]> {
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

export class MemorySnapshotMediaStore implements SnapshotMediaStore {
  readonly media = new Map<string, Uint8Array>();

  async hasVerified(blobHash: string): Promise<boolean> {
    return this.media.has(blobHash);
  }

  /** Test-only seed helper; production media never crosses this whole-buffer API. */
  async writeVerified(blobHash: string, bytes: Uint8Array): Promise<void> {
    this.media.set(blobHash, cloneBytes(bytes));
  }

  async openVerifiedSource(blobHash: string): Promise<MediaUploadSource | null> {
    const bytes = this.media.get(blobHash);
    return bytes ? memorySource(bytes, blobHash) : null;
  }

  async openDownloadSink(blobHash: string): Promise<MediaDownloadSink> {
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

export class MemorySnapshotJournalStore implements SnapshotJournalStore {
  applyCount = 0;
  private domain: SnapshotDomain;

  constructor(
    initial: SnapshotDomain,
    private readonly state: SQLiteSyncStateStore,
    private readonly vaultId: string,
    private readonly deviceId: string,
  ) {
    this.domain = structuredClone(initial);
  }

  mutate(next: SnapshotDomain): number {
    this.domain = structuredClone(next);
    return this.state.markDirty(this.vaultId, this.deviceId);
  }

  current(): SnapshotDomain {
    return structuredClone(this.domain);
  }

  async capture() {
    const generation = this.state.loadState(this.vaultId, this.deviceId).journalGeneration;
    return { domain: structuredClone(this.domain), generation };
  }

  async applyMergedIfGeneration(
    domain: SnapshotDomain,
    expectedGeneration: number,
  ): Promise<boolean> {
    const current = this.state.loadState(this.vaultId, this.deviceId).journalGeneration;
    if (current !== expectedGeneration) return false;
    this.applyCount += 1;
    if (canonicalize(this.domain) !== canonicalize(domain)) {
      this.domain = structuredClone(domain);
    }
    return true;
  }
}
