import type { DomainState, EntityType } from '../domain/types';
import type { ByteSource, CloudProvider, VaultRef } from '../providers';
import type { OutboxItem } from '../outbox';
import {
  InMemorySyncDevice,
  type DurableSyncStep,
  type EngineDurableSnapshot,
  type SyncPassHooks,
  type SyncPassResult,
  type RevocationKind,
} from './inMemoryEngine';

export interface SyncCheckpointDatabase {
  execSync(source: string): void;
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  runSync(source: string, ...params: unknown[]): unknown;
}

export interface SyncEngineCheckpointStore {
  load(deviceId: string, vaultId: string): EngineDurableSnapshot | null;
  save(deviceId: string, vaultId: string, snapshot: EngineDurableSnapshot): void;
}

/** SQLite implementation used both by production expo-sqlite and the gate's real SQLite DB. */
export class SQLiteEngineCheckpointStore implements SyncEngineCheckpointStore {
  constructor(private readonly database: SyncCheckpointDatabase) {}

  load(deviceId: string, vaultId: string): EngineDurableSnapshot | null {
    const row = this.database.getFirstSync<{ snapshot_json: string }>(
      'SELECT snapshot_json FROM sync_engine_checkpoints WHERE device_id = ? AND vault_id = ?',
      deviceId,
      vaultId,
    );
    if (!row) return null;
    const snapshot = JSON.parse(row.snapshot_json) as EngineDurableSnapshot;
    if (snapshot.version !== 1) throw new Error('Unsupported durable engine checkpoint');
    return snapshot;
  }

  save(deviceId: string, vaultId: string, snapshot: EngineDurableSnapshot): void {
    const encoded = JSON.stringify(snapshot);
    this.database.execSync('BEGIN IMMEDIATE');
    try {
      this.database.runSync(
        `INSERT INTO sync_engine_checkpoints(device_id, vault_id, snapshot_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(device_id, vault_id) DO UPDATE SET
           snapshot_json = excluded.snapshot_json,
           updated_at = excluded.updated_at`,
        deviceId,
        vaultId,
        encoded,
        Date.now(),
      );
      this.database.execSync('COMMIT');
    } catch (error) {
      this.database.execSync('ROLLBACK');
      throw error;
    }
  }
}

export interface SQLiteSyncEngineOptions {
  onCheckpoint?: (step: DurableSyncStep) => void;
  /** Gate-only: production reconstructs media ByteSources from files/ledger. */
  persistInlineBlobs?: boolean;
}

/**
 * Durable production engine. The deterministic Phase-2 core is intentionally
 * reused; every state transition that can straddle a remote side effect is
 * checkpointed atomically in SQLite before control returns to the runtime.
 */
export class SQLiteSyncEngine {
  private readonly core: InMemorySyncDevice;

  constructor(
    readonly deviceId: string,
    readonly vault: VaultRef,
    readonly provider: CloudProvider,
    private readonly store: SyncEngineCheckpointStore,
    private readonly options: SQLiteSyncEngineOptions = {},
  ) {
    this.core = new InMemorySyncDevice(
      deviceId,
      vault,
      provider,
      {
        checkpoint: (device, step) => {
          const snapshot = device.toDurableSnapshot();
          this.store.save(deviceId, vault.vaultId, {
            ...snapshot,
            blobs: this.options.persistInlineBlobs ? snapshot.blobs : [],
          });
          this.options.onCheckpoint?.(step);
        },
      },
      'silent',
    );
    const checkpoint = this.store.load(deviceId, vault.vaultId);
    if (checkpoint) this.core.restoreDurableSnapshot(checkpoint);
  }

  get stateMachine() { return this.core.stateMachine; }
  get domain() { return this.core.domain; }
  get generations() { return this.core.generations; }
  get outbox() { return this.core.outbox; }
  get graphs() { return this.core.graphs; }
  get conflicts() { return this.core.conflicts; }
  get blobs() { return this.core.blobs; }
  get appliedHeads() { return this.core.appliedHeads; }
  get degradedEntities() { return this.core.degradedEntities; }
  get isRevoked() { return this.core.isRevoked; }
  get seedingCheckpoint() { return this.core.seedingCheckpoint; }
  get isSeeding() { return this.core.isSeeding; }

  initialize(): Promise<void> { return this.core.initialize(); }
  putBlob(bytes: Uint8Array): string { return this.core.putBlob(bytes); }
  registerBlobSource(hash: string, source: ByteSource): void {
    this.core.registerBlobSource(hash, source);
  }
  mutate(
    type: EntityType,
    id: string,
    state: DomainState | null,
    batchId: string | null = null,
  ): void {
    this.core.mutate(type, id, state, batchId);
  }
  adoptQueuedMutation(item: OutboxItem, state: DomainState | null): void {
    this.core.adoptQueuedMutation(item, state);
  }
  seed(states: { type: EntityType; id: string; state: DomainState }[]): void {
    this.core.seed(states);
  }
  snapshot(): Record<string, DomainState> { return this.core.snapshot(); }
  sync(hooks: SyncPassHooks = {}): Promise<SyncPassResult> {
    return this.core.sync({
      beforeApply: hooks.beforeApply
        ? async () => hooks.beforeApply?.(this.core)
        : undefined,
    });
  }
  revoke(kind: RevocationKind, revocationId: string, timestamp: number): Promise<void> {
    return this.core.revoke(kind, revocationId, timestamp);
  }
}
