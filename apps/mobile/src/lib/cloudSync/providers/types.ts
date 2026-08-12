export type LogicalKey = string;
export interface SizedByteSource {
  byteLength: number;
  contentHash: string;
  chunks: AsyncIterable<Uint8Array>;
}

export type ByteSource = Uint8Array | SizedByteSource;

export interface VaultRef {
  vaultId: string;
  remoteRootId: string;
}

export interface ProviderCapabilities {
  maxObjectSize: number | null;
  supportsResumableUpload: boolean;
  deletionIsPermanent: boolean;
}

export interface ProviderConnection {
  accountLabel: string | null;
}

export interface RemoteVaultSummary {
  vaultId: string;
  remoteRootId: string;
  revoked: boolean;
  /** Drive marker creation time for human-readable vault selection. */
  createdAt?: number | null;
}

export interface RemoteObjectRef {
  fileId: string;
  key: LogicalKey;
  contentHash: string;
}

export interface RemoteObject extends RemoteObjectRef {
  body: Uint8Array;
  sequence: number;
}

export interface VaultMarkerResult {
  vault: VaultRef;
  duplicate: boolean;
}

export interface ListPage {
  objects: RemoteObject[];
  cursor: string | null;
}

export type ChangePage = ListPage;

export interface ProviderQuota {
  usedBytes: number;
  limitBytes: number | null;
}

export interface DeleteSweepPage {
  deleted: number;
  cursor: string | null;
  complete: boolean;
}

export interface CloudProvider {
  readonly kind: 'google-drive' | 'dropbox';
  readonly capabilities: ProviderCapabilities;
  /** Test-provider hook for observation-local server views. */
  setClientContext?(deviceId: string): void;
  connect(): Promise<ProviderConnection>;
  refreshConnection(): Promise<ProviderConnection>;
  disconnect(): Promise<void>;
  listVaults(): Promise<RemoteVaultSummary[]>;
  createVaultMarker(vaultId: string, body: Uint8Array): Promise<VaultMarkerResult>;
  read(vault: VaultRef, key: LogicalKey): Promise<RemoteObject | null>;
  exists(vault: VaultRef, keys: LogicalKey[]): Promise<Set<LogicalKey>>;
  putImmutable(
    vault: VaultRef,
    key: LogicalKey,
    body: ByteSource,
  ): Promise<RemoteObjectRef>;
  list(vault: VaultRef, prefix: LogicalKey, cursor?: string): Promise<ListPage>;
  getChanges(vault: VaultRef, cursor?: string): Promise<ChangePage>;
  getQuota(): Promise<ProviderQuota | null>;
  deleteObject(vault: VaultRef, ref: RemoteObjectRef): Promise<void>;
  deleteVaultResidue(vault: VaultRef, cursor?: string): Promise<DeleteSweepPage>;
}

export class ProviderError extends Error {
  constructor(
    readonly category:
      | 'auth'
      | 'quota'
      | 'not-found'
      | 'rate-limit'
      | 'transient'
      | 'corrupt',
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export async function collectByteSource(source: ByteSource): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source.slice();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of source.chunks) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
