import type { ConflictRecord, DomainState, EntityType, EntityVersionBody } from '../domain/types';
import { hashVersion } from '../domain/version';
import type { ByteSource, CloudProvider, VaultRef } from '../providers';
import type { OutboxItem } from '../outbox';
import {
  InMemorySyncDevice,
  type DurableSyncStep,
  type EngineDurableCheckpoint,
  type EngineDurableDelta,
  type EngineDurableEntity,
  type SyncPassHooks,
  type SyncPassResult,
  type RevocationKind,
} from './inMemoryEngine';

export interface SyncCheckpointDatabase {
  execSync(source: string): void;
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  getAllSync<T>(source: string, ...params: unknown[]): T[];
  runSync(source: string, ...params: unknown[]): unknown;
}

export interface EngineDurableRestore {
  checkpoint: EngineDurableCheckpoint;
  entities: EngineDurableEntity[];
  conflicts: ConflictRecord[];
  blobs: [string, Uint8Array][];
}

export interface SyncEngineCheckpointStore {
  load(deviceId: string, vaultId: string): EngineDurableRestore | null;
  save(deviceId: string, vaultId: string, delta: EngineDurableDelta): void;
}

function parseJson<T>(value: string | T): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

function splitKey(key: string): [EntityType, string] {
  const separator = key.indexOf(':');
  return [key.slice(0, separator) as EntityType, key.slice(separator + 1)];
}

function defaultCheckpoint(): EngineDurableCheckpoint {
  return {
    version: 2,
    state: 'disabled',
    cursor: null,
    editSequence: 1,
    logicalAuthoredAt: 0,
    revokedKind: null,
    seedAwaiting: [],
    seedAwaitingCursor: null,
    seedCursor: null,
    seedComplete: false,
    purgeCursor: null,
    pendingCaptures: [],
    pendingMaterializationKeys: [],
    pendingRemoteMaterializationKeys: [],
  };
}

/**
 * Structured SQLite persistence for the deterministic engine. Only bounded
 * pass-local state is stored in `sync_engine_checkpoints`; entity state,
 * versions, conflicts and queue rows are rehydrated from normalized tables.
 */
export class SQLiteEngineCheckpointStore implements SyncEngineCheckpointStore {
  readonly stats = {
    loadCount: 0,
    restoredLoadCount: 0,
    saveCount: 0,
    checkpointBytesWritten: 0,
    maxCheckpointBytes: 0,
  };
  private readonly lastCheckpoint = new Map<string, string>();

  constructor(private readonly database: SyncCheckpointDatabase) {}

  private checkpointKey(deviceId: string, vaultId: string): string {
    return JSON.stringify([deviceId, vaultId]);
  }

  load(deviceId: string, vaultId: string): EngineDurableRestore | null {
    this.stats.loadCount++;
    this.teardownPreviousVault(deviceId, vaultId);
    const row = this.database.getFirstSync<{ snapshot_json: string }>(
      'SELECT snapshot_json FROM sync_engine_checkpoints WHERE device_id = ? AND vault_id = ?',
      deviceId,
      vaultId,
    );
    let checkpoint = defaultCheckpoint();
    if (row) {
      this.stats.restoredLoadCount++;
      this.lastCheckpoint.set(this.checkpointKey(deviceId, vaultId), row.snapshot_json);
      const decoded = JSON.parse(row.snapshot_json) as { version?: number };
      // Phase 4a was not released. Ignore its obsolete full-vault v1 image and
      // rebuild from the structured tables it already mirrored.
      if (decoded.version === 2) {
        const current = decoded as Partial<EngineDurableCheckpoint>;
        checkpoint = {
          ...defaultCheckpoint(),
          ...current,
          pendingCaptures: current.pendingCaptures ?? [],
          pendingMaterializationKeys: current.pendingMaterializationKeys ?? [],
          pendingRemoteMaterializationKeys: current.pendingRemoteMaterializationKeys ?? [],
        };
      }
    }

    const stateRows = this.database.getAllSync<{
      entity_type: EntityType;
      entity_id: string;
      current_head_hashes: string;
      local_generation: number;
      tombstone: number;
    }>(`SELECT state.entity_type, state.entity_id, state.current_head_hashes,
               state.local_generation, state.tombstone
        FROM sync_entity_state AS state
        WHERE EXISTS (
          SELECT 1 FROM sync_engine_entity_metadata AS metadata
          WHERE metadata.device_id = ? AND metadata.vault_id = ?
            AND metadata.entity_type = state.entity_type
            AND metadata.entity_id = state.entity_id
        ) OR EXISTS (
          SELECT 1 FROM sync_engine_local_domain AS local
          WHERE local.device_id = ? AND local.vault_id = ?
            AND local.entity_type = state.entity_type
            AND local.entity_id = state.entity_id
        )`, deviceId, vaultId, deviceId, vaultId);
    const queueRows = this.database.getAllSync<{
      entity_type: EntityType;
      entity_id: string;
      action: 'upsert' | 'delete';
      base_head_hashes: string;
      generation: number;
      batch_id: string | null;
      created_at: number;
    }>(`SELECT queue.entity_type, queue.entity_id, queue.action, queue.base_head_hashes,
               queue.generation, queue.batch_id, queue.created_at
        FROM sync_change_queue AS queue
        WHERE EXISTS (
          SELECT 1 FROM sync_engine_local_domain AS local
          WHERE local.device_id = ? AND local.vault_id = ?
            AND local.entity_type = queue.entity_type
            AND local.entity_id = queue.entity_id
        )`, deviceId, vaultId);
    const versionRows = this.database.getAllSync<{
      version_hash: string;
      entity_type: EntityType;
      entity_id: string;
      state: 'provisional' | 'incomplete' | 'complete';
      published: number;
      canonical_body: string | null;
    }>(`SELECT version_hash, entity_type, entity_id, state, published, canonical_body
        FROM sync_versions WHERE vault_id = ? ORDER BY created_at, version_hash`, vaultId);
    const metadataRows = this.database.getAllSync<{
      entity_type: EntityType;
      entity_id: string;
      fetched_dependencies_json: string;
      recovery_dependencies_json: string;
      degraded_reason: string | null;
    }>(`SELECT entity_type, entity_id, fetched_dependencies_json,
               recovery_dependencies_json, degraded_reason
        FROM sync_engine_entity_metadata WHERE device_id = ? AND vault_id = ?`, deviceId, vaultId);
    const localRows = this.database.getAllSync<{
      entity_type: EntityType;
      entity_id: string;
      state_json: string | null;
    }>(`SELECT entity_type, entity_id, state_json FROM sync_engine_local_domain
        WHERE device_id = ? AND vault_id = ?`, deviceId, vaultId);

    const queue = new Map(queueRows.map((item) => [
      `${item.entity_type}:${item.entity_id}`,
      {
        entityType: item.entity_type,
        entityId: item.entity_id,
        action: item.action,
        baseHeads: parseJson<string[]>(item.base_head_hashes),
        generation: item.generation,
        batchId: item.batch_id,
        authoredAt: item.created_at,
      } satisfies OutboxItem,
    ]));
    const metadata = new Map(metadataRows.map((item) => [
      `${item.entity_type}:${item.entity_id}`,
      item,
    ]));
    const local = new Map(localRows.map((item) => [
      `${item.entity_type}:${item.entity_id}`,
      item.state_json === null ? null : parseJson<DomainState>(item.state_json),
    ]));
    const graphRows = new Map<string, {
      body: EntityVersionBody;
      hash: string;
      status: 'provisional' | 'incomplete' | 'complete';
      published: boolean;
    }[]>();
    const bodiesByHash = new Map<string, EntityVersionBody>();
    for (const version of versionRows) {
      if (!version.canonical_body) continue;
      const body = parseJson<EntityVersionBody>(version.canonical_body);
      const key = `${version.entity_type}:${version.entity_id}`;
      const values = graphRows.get(key) ?? [];
      values.push({
        body,
        hash: version.version_hash,
        status: version.state,
        published: version.published !== 0,
      });
      graphRows.set(key, values);
      bodiesByHash.set(version.version_hash, body);
    }

    const allKeys = new Set<string>([
      ...stateRows.map((item) => `${item.entity_type}:${item.entity_id}`),
      ...queue.keys(),
      ...graphRows.keys(),
      ...local.keys(),
    ]);
    const state = new Map(stateRows.map((item) => [`${item.entity_type}:${item.entity_id}`, item]));
    const entities: EngineDurableEntity[] = Array.from(allKeys).sort().map((key) => {
      const rowState = state.get(key);
      const rowMetadata = metadata.get(key);
      const heads = rowState ? parseJson<string[]>(rowState.current_head_hashes) : [];
      const localState = local.get(key);
      const appliedBody = heads.map((hash) => bodiesByHash.get(hash)).find(Boolean);
      return {
        key: key as EngineDurableEntity['key'],
        domain: local.has(key) ? localState ?? null : appliedBody?.state ?? null,
        generation: rowState?.local_generation ?? queue.get(key)?.generation ?? 0,
        outbox: queue.get(key) ?? null,
        graph: graphRows.has(key) ? {
          versions: graphRows.get(key)!,
          fetchedDependencies: rowMetadata
            ? parseJson<{ hash: string; byteLength: number }[]>(
                rowMetadata.fetched_dependencies_json,
              )
            : [],
          recoveryDependencies: rowMetadata
            ? parseJson<{ hash: string; entityType: string; entityId: string }[]>(
                rowMetadata.recovery_dependencies_json,
              )
            : [],
        } : null,
        appliedHeads: heads,
        degradedReason: rowMetadata?.degraded_reason ?? null,
      };
    });

    const conflicts = this.database.getAllSync<{
      conflict_id: string;
      entity_type: EntityType;
      entity_id: string;
      head_hashes: string;
      resolution_type: string;
      recovered_entities: string;
      alternate_scalars: string;
    }>(`SELECT conflict.conflict_id, conflict.entity_type, conflict.entity_id,
               conflict.head_hashes, conflict.resolution_type,
               conflict.recovered_entities, conflict.alternate_scalars
        FROM sync_conflicts AS conflict
        WHERE EXISTS (
          SELECT 1 FROM sync_engine_entity_metadata AS metadata
          WHERE metadata.device_id = ? AND metadata.vault_id = ?
            AND metadata.entity_type = conflict.entity_type
            AND metadata.entity_id = conflict.entity_id
        )`, deviceId, vaultId)
      .map((item): ConflictRecord => ({
        conflictId: item.conflict_id,
        entityType: item.entity_type,
        entityId: item.entity_id,
        headHashes: parseJson<string[]>(item.head_hashes),
        resolutionType: item.resolution_type,
        recoveredEntityIds: parseJson<{ entityId: string }[]>(item.recovered_entities)
          .map(({ entityId }) => entityId),
        alternates: parseJson<ConflictRecord['alternates']>(item.alternate_scalars),
      }));
    const blobs = this.database.getAllSync<{ blob_hash: string; body: Uint8Array }>(
      `SELECT blob_hash, body FROM sync_engine_local_blobs
       WHERE device_id = ? AND vault_id = ?`,
      deviceId,
      vaultId,
    ).map((item): [string, Uint8Array] => [item.blob_hash, new Uint8Array(item.body)]);

    if (!row && entities.length === 0 && conflicts.length === 0 && blobs.length === 0) return null;
    return { checkpoint, entities, conflicts, blobs };
  }

  /**
   * The Phase-1 state/queue/conflict tables predate multi-vault scoping. A
   * device opening a different vault therefore discards the prior engine
   * replica and rebuilds from the normalized model plus the new remote vault.
   * Local journal/media tables are deliberately outside this teardown.
   */
  private teardownPreviousVault(deviceId: string, vaultId: string): void {
    const previous = this.database.getFirstSync<{ vault_id: string }>(
      `SELECT vault_id FROM sync_engine_checkpoints
       WHERE device_id = ? AND vault_id <> ? LIMIT 1`,
      deviceId,
      vaultId,
    );
    if (!previous) return;

    this.database.execSync('BEGIN IMMEDIATE');
    try {
      this.database.runSync('DELETE FROM sync_entity_state');
      this.database.runSync('DELETE FROM sync_change_queue');
      this.database.runSync('DELETE FROM sync_conflicts');
      this.database.runSync('DELETE FROM sync_versions');
      this.database.runSync('DELETE FROM sync_engine_entity_metadata');
      this.database.runSync('DELETE FROM sync_engine_local_domain');
      this.database.runSync('DELETE FROM sync_engine_local_blobs');
      this.database.runSync('DELETE FROM sync_engine_checkpoints');
      this.database.execSync('COMMIT');
    } catch (error) {
      this.database.execSync('ROLLBACK');
      throw error;
    }
    this.lastCheckpoint.clear();
  }

  save(deviceId: string, vaultId: string, delta: EngineDurableDelta): void {
    const encoded = JSON.stringify(delta.checkpoint);
    const checkpointKey = this.checkpointKey(deviceId, vaultId);
    const writesCheckpoint = this.lastCheckpoint.get(checkpointKey) !== encoded;
    this.database.execSync('BEGIN IMMEDIATE');
    try {
      if (delta.clearStructuredState) {
        this.database.runSync('DELETE FROM sync_versions WHERE vault_id = ?', vaultId);
        this.database.runSync(
          `DELETE FROM sync_conflicts WHERE EXISTS (
             SELECT 1 FROM sync_engine_entity_metadata AS metadata
             WHERE metadata.device_id = ? AND metadata.vault_id = ?
               AND metadata.entity_type = sync_conflicts.entity_type
               AND metadata.entity_id = sync_conflicts.entity_id
           )`,
          deviceId, vaultId,
        );
        this.database.runSync(
          `DELETE FROM sync_change_queue WHERE EXISTS (
             SELECT 1 FROM sync_engine_local_domain AS local
             WHERE local.device_id = ? AND local.vault_id = ?
               AND local.entity_type = sync_change_queue.entity_type
               AND local.entity_id = sync_change_queue.entity_id
           )`,
          deviceId, vaultId,
        );
        this.database.runSync(
          `DELETE FROM sync_entity_state WHERE EXISTS (
             SELECT 1 FROM sync_engine_entity_metadata AS metadata
             WHERE metadata.device_id = ? AND metadata.vault_id = ?
               AND metadata.entity_type = sync_entity_state.entity_type
               AND metadata.entity_id = sync_entity_state.entity_id
           ) OR EXISTS (
             SELECT 1 FROM sync_engine_local_domain AS local
             WHERE local.device_id = ? AND local.vault_id = ?
               AND local.entity_type = sync_entity_state.entity_type
               AND local.entity_id = sync_entity_state.entity_id
           )`,
          deviceId, vaultId, deviceId, vaultId,
        );
        this.database.runSync(
          'DELETE FROM sync_engine_entity_metadata WHERE device_id = ? AND vault_id = ?',
          deviceId,
          vaultId,
        );
        this.database.runSync(
          'DELETE FROM sync_engine_local_domain WHERE device_id = ? AND vault_id = ?',
          deviceId,
          vaultId,
        );
      }
      for (const entity of delta.entities) {
        const [type, id] = splitKey(entity.key);
        this.database.runSync(
          `INSERT INTO sync_entity_state(
             entity_type, entity_id, current_head_hashes, last_remote_head_hashes,
             tombstone, local_generation, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(entity_type, entity_id) DO UPDATE SET
             current_head_hashes=excluded.current_head_hashes,
             last_remote_head_hashes=excluded.last_remote_head_hashes,
             tombstone=CASE
               WHEN sync_entity_state.local_generation > excluded.local_generation
               THEN sync_entity_state.tombstone ELSE excluded.tombstone END,
             local_generation=MAX(sync_entity_state.local_generation, excluded.local_generation),
             updated_at=excluded.updated_at`,
          type, id, JSON.stringify(entity.appliedHeads), JSON.stringify(entity.appliedHeads),
          entity.domain === null ? 1 : 0, entity.generation, Date.now(),
        );
        if (entity.outbox) {
          this.database.runSync(
            `INSERT INTO sync_change_queue(
               change_id, entity_type, entity_id, action, base_head_hashes,
               generation, batch_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entity_type, entity_id) DO UPDATE SET
               action=excluded.action, base_head_hashes=excluded.base_head_hashes,
               generation=excluded.generation, batch_id=excluded.batch_id,
               updated_at=excluded.updated_at`,
            `engine:${deviceId}:${vaultId}:${entity.key}`,
            type, id, entity.outbox.action, JSON.stringify(entity.outbox.baseHeads),
            entity.outbox.generation, entity.outbox.batchId,
            entity.outbox.authoredAt ?? Date.now(), Date.now(),
          );
        } else {
          this.database.runSync(
            'DELETE FROM sync_change_queue WHERE entity_type = ? AND entity_id = ? AND generation <= ?',
            type, id, entity.generation,
          );
        }
        const needsLocalState = entity.outbox !== null || (
          entity.domain !== null && entity.appliedHeads.length === 0
        );
        if (needsLocalState) {
          this.database.runSync(
            `INSERT INTO sync_engine_local_domain(
               device_id, vault_id, entity_type, entity_id, generation, state_json
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(device_id, vault_id, entity_type, entity_id) DO UPDATE SET
               generation=excluded.generation, state_json=excluded.state_json`,
            deviceId, vaultId, type, id, entity.generation,
            entity.domain === null ? null : JSON.stringify(entity.domain),
          );
        } else {
          this.database.runSync(
            `DELETE FROM sync_engine_local_domain
             WHERE device_id = ? AND vault_id = ? AND entity_type = ? AND entity_id = ?`,
            deviceId, vaultId, type, id,
          );
        }
        if (entity.graph) {
          // The durable delta contains the graph's complete version set, and
          // every upsert below writes its exact applied bit. A preceding
          // vault/entity UPDATE is redundant and makes a large restore
          // quadratic when SQLite chooses the vault-only index.
          for (const version of entity.graph.versions) {
            const canonical = hashVersion(version.body).canonical;
            this.database.runSync(
              `INSERT INTO sync_versions(
                 version_hash, vault_id, entity_type, entity_id, parent_hashes, kind,
                 author_device_id, edit_sequence, state, applied, published,
                 canonical_body, body_path, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
               ON CONFLICT(version_hash) DO UPDATE SET
                 state=excluded.state, applied=excluded.applied,
                 published=excluded.published, canonical_body=excluded.canonical_body`,
              version.hash, vaultId, type, id, JSON.stringify(version.body.parents), version.body.kind,
              version.body.kind === 'edit' ? version.body.authorDeviceId : null,
              version.body.kind === 'edit' ? version.body.editSequence : null,
              version.status, entity.appliedHeads.includes(version.hash) ? 1 : 0,
              version.published ? 1 : 0, canonical, Date.now(),
            );
          }
          this.database.runSync(
            `INSERT INTO sync_engine_entity_metadata(
               device_id, vault_id, entity_type, entity_id,
               fetched_dependencies_json, recovery_dependencies_json, degraded_reason
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(device_id, vault_id, entity_type, entity_id) DO UPDATE SET
               fetched_dependencies_json=excluded.fetched_dependencies_json,
               recovery_dependencies_json=excluded.recovery_dependencies_json,
               degraded_reason=excluded.degraded_reason`,
            deviceId, vaultId, type, id,
            JSON.stringify(entity.graph.fetchedDependencies),
            JSON.stringify(entity.graph.recoveryDependencies), entity.degradedReason,
          );
        }
      }
      for (const conflict of delta.conflicts) {
        this.database.runSync(
          `INSERT INTO sync_conflicts(
             conflict_id, entity_type, entity_id, head_hashes, resolution_type,
             recovered_entities, alternate_scalars, acknowledged_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(conflict_id) DO UPDATE SET
             head_hashes=excluded.head_hashes, resolution_type=excluded.resolution_type,
             recovered_entities=excluded.recovered_entities,
             alternate_scalars=excluded.alternate_scalars`,
          conflict.conflictId, conflict.entityType, conflict.entityId,
          JSON.stringify(conflict.headHashes), conflict.resolutionType,
          JSON.stringify(conflict.recoveredEntityIds.map((entityId) => ({
            entityType: conflict.entityType, entityId,
          }))),
          JSON.stringify(conflict.alternates), Date.now(),
        );
      }
      for (const [hash, body] of delta.blobs) {
        this.database.runSync(
          `INSERT INTO sync_engine_local_blobs(device_id, vault_id, blob_hash, body)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(device_id, vault_id, blob_hash) DO NOTHING`,
          deviceId, vaultId, hash, body,
        );
      }
      if (writesCheckpoint) {
        this.database.runSync(
          `INSERT INTO sync_engine_checkpoints(device_id, vault_id, snapshot_json, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(device_id, vault_id) DO UPDATE SET
             snapshot_json = excluded.snapshot_json,
             updated_at = excluded.updated_at`,
          deviceId, vaultId, encoded, Date.now(),
        );
      }
      this.database.execSync('COMMIT');
    } catch (error) {
      this.database.execSync('ROLLBACK');
      throw error;
    }
    this.stats.saveCount++;
    if (writesCheckpoint) {
      this.lastCheckpoint.set(checkpointKey, encoded);
      this.stats.checkpointBytesWritten += encoded.length;
      this.stats.maxCheckpointBytes = Math.max(this.stats.maxCheckpointBytes, encoded.length);
    }
  }
}

export interface SQLiteSyncEngineOptions {
  onCheckpoint?: (step: DurableSyncStep) => void;
  /** Gate-only: production reconstructs media ByteSources from files/ledger. */
  persistInlineBlobs?: boolean;
  /** Production keeps remote Apply pending until the normalized transaction commits. */
  requiresMaterializationAck?: boolean;
}

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
          const delta = device.toDurableDelta();
          this.store.save(deviceId, vault.vaultId, {
            ...delta,
            blobs: this.options.persistInlineBlobs ? delta.blobs : [],
          });
          device.markDurable();
          this.options.onCheckpoint?.(step);
        },
      },
      'silent',
    );
    const durable = this.store.load(deviceId, vault.vaultId);
    if (durable) {
      this.core.restoreDurableState(
        durable.checkpoint,
        durable.entities,
        durable.conflicts,
        durable.blobs,
      );
    }
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
  get revocationKind() { return this.core.revocationKind; }
  get seedingCheckpoint() { return this.core.seedingCheckpoint; }
  get isSeeding() { return this.core.isSeeding; }
  get isSeedingComplete() { return this.core.isSeedingComplete; }
  get needsSeedPage() { return this.core.needsSeedPage; }
  get hasPendingPullWork() { return this.core.hasPendingPullWork; }

  initialize(): Promise<void> { return this.core.initialize(); }
  putBlob(bytes: Uint8Array): string { return this.core.putBlob(bytes); }
  registerBlobSource(hash: string, source: ByteSource): void { this.core.registerBlobSource(hash, source); }
  mutate(type: EntityType, id: string, state: DomainState | null, batchId: string | null = null): void {
    this.core.mutate(type, id, state, batchId);
  }
  adoptQueuedMutation(item: OutboxItem, state: DomainState | null): void {
    this.core.adoptQueuedMutation(item, state);
  }
  restoreLocalDomainState(type: EntityType, id: string, state: DomainState | null): void {
    this.core.restoreLocalDomainState(type, id, state);
  }
  acknowledgeMaterialized(keys: string[]): void { this.core.acknowledgeMaterialized(keys); }
  seedBatch(states: { type: EntityType; id: string; state: DomainState }[], final: boolean): void {
    this.core.seedBatch(states, final);
  }
  snapshot(): Record<string, DomainState> { return this.core.snapshot(); }
  async sync(hooks: SyncPassHooks = {}): Promise<SyncPassResult> {
    const result = await this.core.sync({
      beforeApply: hooks.beforeApply ? async () => hooks.beforeApply?.(this.core) : undefined,
      onPhase: hooks.onPhase,
    });
    if (!this.options.requiresMaterializationAck && result.appliedEntityKeys.length > 0) {
      this.core.acknowledgeMaterialized(result.appliedEntityKeys);
    }
    return result;
  }
  revoke(kind: RevocationKind, revocationId: string, timestamp: number): Promise<void> {
    return this.core.revoke(kind, revocationId, timestamp);
  }
}
