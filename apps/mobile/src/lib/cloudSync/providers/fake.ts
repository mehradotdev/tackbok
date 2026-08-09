import { sha256Bytes } from '../codec';
import { validateVaultMarkerBytes } from '../domain/validation';
import { PROTOCOL_V1_CAPS } from '../phase0/validationCaps';
import {
  collectByteSource,
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
  type VaultMarkerResult,
  type VaultRef,
} from './types';

interface StoredObject extends RemoteObject {
  vaultId: string;
  deleted: boolean;
}

export interface FakeProviderFaults {
  duplicateNextPut: boolean;
  failNextPutAfterStore: boolean;
  failNextDelete: boolean;
  reverseListings: boolean;
}

export class FakeCloudProvider implements CloudProvider {
  readonly kind = 'google-drive' as const;
  readonly capabilities: ProviderCapabilities = {
    maxObjectSize: null,
    supportsResumableUpload: true,
    deletionIsPermanent: true,
  };
  readonly faults: FakeProviderFaults = {
    duplicateNextPut: false,
    failNextPutAfterStore: false,
    failNextDelete: false,
    reverseListings: false,
  };
  private connected = false;
  private sequence = 0;
  private fileSequence = 0;
  private readonly objects: StoredObject[] = [];
  private readonly vaults = new Map<string, VaultRef>();
  private currentClientId: string | null = null;
  private readonly revocationViews = new Map<
    string,
    Set<'journal-deleted' | 'backup-deleted'>
  >();

  constructor(readonly pageSize = 50) {}

  setClientContext(deviceId: string): void {
    this.currentClientId = deviceId;
  }

  setRevocationView(
    deviceId: string,
    kinds: readonly ('journal-deleted' | 'backup-deleted')[],
  ): void {
    this.revocationViews.set(deviceId, new Set(kinds));
  }

  async connect(): Promise<ProviderConnection> {
    this.connected = true;
    return { accountLabel: 'Fake account' };
  }

  async refreshConnection(): Promise<ProviderConnection> {
    this.assertConnected();
    return { accountLabel: 'Fake account' };
  }

  async disconnect(): Promise<void> {
    // The fake is a shared server used by several simulated devices. A device
    // disconnect is session-local in production, so it must not take the shared
    // in-memory backend offline for the other simulated clients.
  }

  async listVaults(): Promise<RemoteVaultSummary[]> {
    this.assertConnected();
    return Array.from(this.vaults.values()).map((vault) => ({
      vaultId: vault.vaultId,
      remoteRootId: vault.remoteRootId,
      revoked: this.live(vault).some((object) => object.key.startsWith('revocations/')),
    }));
  }

  async createVaultMarker(vaultId: string, body: Uint8Array): Promise<VaultMarkerResult> {
    this.assertConnected();
    validateVaultMarkerBytes(body);
    const vault = this.vaults.get(vaultId) ?? {
      vaultId,
      remoteRootId: `fake-root-${vaultId}`,
    };
    const duplicate = this.vaults.has(vaultId);
    this.vaults.set(vaultId, vault);
    await this.putImmutable(vault, 'vault.json', body);
    return { vault, duplicate };
  }

  async read(vault: VaultRef, key: LogicalKey): Promise<RemoteObject | null> {
    this.assertConnected();
    const candidates = this.live(vault).filter((object) => object.key === key);
    if (candidates.length === 0) return null;
    const hashes = new Set(candidates.map((candidate) => candidate.contentHash));
    if (hashes.size > 1) throw new ProviderError('corrupt', `Conflicting bytes at ${key}`);
    return this.copy(candidates.sort((a, b) => a.fileId.localeCompare(b.fileId))[0]);
  }

  async exists(vault: VaultRef, keys: LogicalKey[]): Promise<Set<LogicalKey>> {
    this.assertConnected();
    const wanted = new Set(keys);
    return new Set(
      this.live(vault)
        .filter((object) => wanted.has(object.key))
        .map((object) => object.key),
    );
  }

  async putImmutable(
    vault: VaultRef,
    key: LogicalKey,
    source: ByteSource,
  ): Promise<RemoteObjectRef> {
    this.assertConnected();
    if (
      key.startsWith('blobs/') &&
      source.byteLength > PROTOCOL_V1_CAPS.maximumMediaBytes
    ) {
      throw new ProviderError('corrupt', 'Media object exceeds the protocol byte cap');
    }
    const body = await collectByteSource(source);
    const hash = sha256Bytes(body);
    const candidates = this.live(vault).filter((object) => object.key === key);
    const conflicting = candidates.find((candidate) => candidate.contentHash !== hash);
    if (conflicting) throw new ProviderError('corrupt', `Immutable key collision at ${key}`);
    if (candidates.length > 0 && !this.faults.duplicateNextPut) {
      return this.reference(candidates[0]);
    }

    const stored = this.store(vault, key, body, hash);
    if (this.faults.duplicateNextPut) {
      this.faults.duplicateNextPut = false;
      this.store(vault, key, body, hash);
    }
    if (this.faults.failNextPutAfterStore) {
      this.faults.failNextPutAfterStore = false;
      throw new ProviderError('transient', 'Simulated lost upload response');
    }
    return this.reference(stored);
  }

  async list(vault: VaultRef, prefix: LogicalKey, cursor?: string): Promise<ListPage> {
    this.assertConnected();
    const offset = cursor ? Number(cursor) : 0;
    let objects = this.visible(vault)
      .filter((object) => object.key.startsWith(prefix))
      .sort((left, right) =>
        left.key.localeCompare(right.key) || left.fileId.localeCompare(right.fileId),
      );
    if (this.faults.reverseListings) objects = objects.reverse();
    const page = objects.slice(offset, offset + this.pageSize).map((object) => this.copy(object));
    const next = offset + page.length < objects.length ? String(offset + page.length) : null;
    return { objects: page, cursor: next };
  }

  async getChanges(vault: VaultRef, cursor?: string): Promise<ChangePage> {
    this.assertConnected();
    const sequence = cursor ? Number(cursor) : 0;
    const changes = this.live(vault)
      .filter((object) => object.sequence > sequence)
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, this.pageSize);
    const delivered = this.faults.reverseListings ? [...changes].reverse() : changes;
    return {
      objects: delivered.map((object) => this.copy(object)),
      cursor:
        changes.length > 0
          ? String(Math.max(...changes.map((object) => object.sequence)))
          : cursor ?? '0',
    };
  }

  async getQuota(): Promise<ProviderQuota> {
    this.assertConnected();
    return {
      usedBytes: this.objects
        .filter((object) => !object.deleted)
        .reduce((total, object) => total + object.body.length, 0),
      limitBytes: null,
    };
  }

  async deleteObject(_vault: VaultRef, ref: RemoteObjectRef): Promise<void> {
    this.assertConnected();
    if (this.faults.failNextDelete) {
      this.faults.failNextDelete = false;
      throw new ProviderError('transient', 'Simulated interrupted delete');
    }
    const object = this.objects.find((candidate) => candidate.fileId === ref.fileId);
    if (object && !object.deleted) {
      object.deleted = true;
      object.sequence = ++this.sequence;
    }
  }

  async deleteVaultResidue(
    vault: VaultRef,
    cursor?: string,
  ): Promise<DeleteSweepPage> {
    this.assertConnected();
    const candidates = this.live(vault)
      .filter((object) => !object.key.startsWith('revocations/'))
      .sort((left, right) => left.fileId.localeCompare(right.fileId));
    const batch = candidates.slice(0, this.pageSize);
    for (const object of batch) await this.deleteObject(vault, this.reference(object));
    const remaining = this.live(vault).some(
      (object) => !object.key.startsWith('revocations/'),
    );
    return {
      deleted: batch.length,
      cursor: remaining ? cursor ?? 'resume' : null,
      complete: !remaining,
    };
  }

  physicalObjects(vault: VaultRef): RemoteObject[] {
    return this.live(vault).map((object) => this.copy(object));
  }

  private store(vault: VaultRef, key: string, body: Uint8Array, hash: string): StoredObject {
    const object: StoredObject = {
      vaultId: vault.vaultId,
      fileId: `fake-file-${++this.fileSequence}`,
      key,
      contentHash: hash,
      body: body.slice(),
      sequence: ++this.sequence,
      deleted: false,
    };
    this.objects.push(object);
    return object;
  }

  private live(vault: VaultRef): StoredObject[] {
    return this.objects.filter(
      (object) => object.vaultId === vault.vaultId && !object.deleted,
    );
  }

  private visible(vault: VaultRef): StoredObject[] {
    const live = this.live(vault);
    if (!this.currentClientId) return live;
    const view = this.revocationViews.get(this.currentClientId);
    if (!view) return live;
    return live.filter((object) => {
      if (!object.key.startsWith('revocations/')) return true;
      try {
        const marker = JSON.parse(new TextDecoder().decode(object.body)) as {
          kind?: string;
        };
        return (
          marker.kind === 'journal-deleted' || marker.kind === 'backup-deleted'
        ) && view.has(marker.kind);
      } catch {
        return true;
      }
    });
  }

  private reference(object: StoredObject): RemoteObjectRef {
    return { fileId: object.fileId, key: object.key, contentHash: object.contentHash };
  }

  private copy(object: StoredObject): RemoteObject {
    return { ...this.reference(object), body: object.body.slice(), sequence: object.sequence };
  }

  private assertConnected(): void {
    if (!this.connected) throw new ProviderError('auth', 'Provider is disconnected');
  }
}
