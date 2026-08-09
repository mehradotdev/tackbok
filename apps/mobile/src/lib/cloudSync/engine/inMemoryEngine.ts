import { canonicalBytes, sha256Bytes } from '../codec';
import { VersionGraph, type VersionGraphDurableState } from '../ancestry';
import { resolveHeads, type ResolutionResult } from '../conflicts';
import { createSystemVersion, deterministicId } from '../domain/version';
import {
  parseAndValidateRevocationMarker,
  validateConflictRecord,
} from '../domain/validation';
import { PROTOCOL_V1_CAPS } from '../protocol/validationCaps';
import type {
  DomainState,
  EntityType,
  EntityVersionBody,
  HashedVersion,
  TagState,
} from '../domain/types';
import {
  canApplyAtGeneration,
  coalesceOutbox,
  constructProvisional,
  settleOutbox,
  type OutboxItem,
  type ProvisionalCapture,
} from '../outbox';
import type { ByteSource, CloudProvider, RemoteObject, VaultRef } from '../providers';
import { SyncStateMachine } from './stateMachine';
import type { SyncState } from './stateMachine';

type EntityKey = `${EntityType}:${string}`;
const SEED_BATCH_SIZE = 50;

interface ResolvedEntity {
  key: EntityKey;
  version: HashedVersion;
  recoveries: HashedVersion[];
  capturedGeneration: number;
}

export interface SyncPassHooks {
  beforeApply?: (device: InMemorySyncDevice) => void | Promise<void>;
}

export type DurableSyncStep =
  | 'mutation'
  | 'seed-checkpoint'
  | 'pull-page'
  | 'provisional'
  | 'apply'
  | 'publish-blob'
  | 'publish-edit'
  | 'publish-recovery-init'
  | 'publish-resolution'
  | 'publish-join'
  | 'publish-revocation'
  | 'settle'
  | 'purge-batch'
  | 'revoked';

export interface EngineDurabilityHooks {
  checkpoint(device: InMemorySyncDevice, step: DurableSyncStep): void;
}

export interface EngineDurableCheckpoint {
  version: 2;
  state: SyncState;
  cursor: string | null;
  editSequence: number;
  logicalAuthoredAt: number;
  revokedKind: RevocationKind | null;
  seedAwaiting: EntityKey[];
  seedAwaitingCursor: string | null;
  seedCursor: string | null;
  seedComplete: boolean;
  purgeCursor: string | null;
  pendingCaptures: [EntityKey, { versionHash: string; capturedGeneration: number }][];
  pendingMaterializationKeys: EntityKey[];
  pendingRemoteMaterializationKeys: EntityKey[];
}

export interface EngineDurableEntity {
  key: EntityKey;
  domain: DomainState | null;
  generation: number;
  outbox: OutboxItem | null;
  graph: VersionGraphDurableState | null;
  appliedHeads: string[];
  degradedReason: string | null;
}

export interface EngineDurableDelta {
  checkpoint: EngineDurableCheckpoint;
  entities: EngineDurableEntity[];
  conflicts: NonNullable<ResolutionResult['conflict']>[];
  blobs: [string, Uint8Array][];
  clearStructuredState: boolean;
}

export interface SyncPassResult {
  pulled: number;
  pushed: number;
  applied: number;
  skippedByCas: number;
  revoked: boolean;
  changedEntityKeys: EntityKey[];
  appliedEntityKeys: EntityKey[];
  remoteApplied: number;
}

export type RevocationKind = 'journal-deleted' | 'backup-deleted';

function entityKey(type: EntityType, id: string): EntityKey {
  return `${type}:${id}`;
}

function splitEntityKey(key: EntityKey): [EntityType, string] {
  const separator = key.indexOf(':');
  return [key.slice(0, separator) as EntityType, key.slice(separator + 1)];
}

function versionKey(version: HashedVersion): string {
  return `entities/${version.body.entityType}/${version.body.entityId}/${version.hash}.json`;
}

function graphSort(key: EntityKey): number {
  const type = splitEntityKey(key)[0];
  return type === 'tag' ? 0 : type === 'prompt' ? 1 : type === 'profile' ? 2 : 3;
}

export class InMemorySyncDevice {
  stateMachine = new SyncStateMachine();
  readonly domain = new Map<EntityKey, DomainState>();
  readonly generations = new Map<EntityKey, number>();
  readonly outbox = new Map<EntityKey, OutboxItem>();
  readonly graphs = new Map<EntityKey, VersionGraph>();
  readonly conflicts = new Map<string, NonNullable<ResolutionResult['conflict']>>();
  readonly blobs = new Map<string, Uint8Array>();
  private readonly blobSources = new Map<string, ByteSource>();
  readonly appliedHeads = new Map<EntityKey, string[]>();
  readonly degradedEntities = new Map<EntityKey, string>();
  private cursor: string | undefined;
  /** A fetched page is retained until every object in it is consumed. */
  private pendingChangeObjects: RemoteObject[] = [];
  private pendingChangeCursor: string | undefined;
  private editSequence = 1;
  private logicalAuthoredAt = 0;
  private connected = false;
  private revokedKind: RevocationKind | null = null;
  private seedAwaiting = new Set<EntityKey>();
  private seedAwaitingCursor: string | null = null;
  private seedCursor: string | null = null;
  private seedComplete = false;
  /** Frozen-catalog compatibility only; production supplies one SQL page at a time. */
  private seedItems: { type: EntityType; id: string; state: DomainState }[] = [];
  private seedIndex = 0;
  private purgeCursor: string | null = null;
  private readonly pendingCaptures = new Map<
    EntityKey,
    { versionHash: string; capturedGeneration: number }
  >();
  private readonly durabilityDirtyKeys = new Set<EntityKey>();
  private readonly durabilityDirtyBlobs = new Set<string>();
  private clearStructuredState = false;
  private readonly passChangedKeys = new Set<EntityKey>();
  private readonly passRemoteKeys = new Set<EntityKey>();
  private readonly pendingMaterializationKeys = new Set<EntityKey>();
  private readonly pendingRemoteMaterializationKeys = new Set<EntityKey>();
  private durabilityBatchDepth = 0;

  constructor(
    readonly deviceId: string,
    readonly vault: VaultRef,
    readonly provider: CloudProvider,
    private readonly durability?: EngineDurabilityHooks,
    private readonly connectionMode: 'interactive' | 'silent' = 'interactive',
  ) {}

  get isRevoked(): boolean {
    return this.revokedKind !== null;
  }

  get seedingCheckpoint(): string | null {
    return this.seedCursor;
  }

  get isSeeding(): boolean {
    return !this.seedComplete || this.seedAwaiting.size > 0 || this.seedIndex < this.seedItems.length;
  }

  get isSeedingComplete(): boolean {
    return this.seedComplete;
  }

  get needsSeedPage(): boolean {
    return !this.seedComplete && this.seedAwaiting.size === 0;
  }

  async initialize(): Promise<void> {
    this.stateMachine.transition('connecting');
    if (this.connectionMode === 'silent') await this.provider.refreshConnection();
    else await this.provider.connect();
    this.connected = true;
    this.stateMachine.transition('initializing');
    this.stateMachine.transition('idle');
  }

  putBlob(bytes: Uint8Array): string {
    if (bytes.byteLength > PROTOCOL_V1_CAPS.maximumMediaBytes) {
      throw new Error('Blob exceeds the protocol media byte cap');
    }
    const hash = sha256Bytes(bytes);
    this.blobs.set(hash, bytes.slice());
    this.durabilityDirtyBlobs.add(hash);
    this.checkpoint('mutation');
    return hash;
  }

  /** Registers a restart-reconstructible production file source without buffering it. */
  registerBlobSource(hash: string, source: ByteSource): void {
    this.blobSources.set(hash, source);
  }

  mutate(
    type: EntityType,
    id: string,
    state: DomainState | null,
    batchId: string | null = null,
  ): void {
    if (this.revokedKind) throw new Error('Cannot mutate a revoked device vault');
    const key = entityKey(type, id);
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    if (state) this.domain.set(key, state);
    else this.domain.delete(key);
    const previous = this.outbox.get(key) ?? null;
    this.outbox.set(
      key,
      coalesceOutbox(previous, {
        entityType: type,
        entityId: id,
        action: state ? 'upsert' : 'delete',
        currentHeads: this.appliedHeads.get(key) ?? this.graphFor(key).heads(),
        generation,
        batchId,
        authoredAt: ++this.logicalAuthoredAt,
      }),
    );
    this.markEntityDirty(key);
    if (this.stateMachine.state === 'idle') this.stateMachine.transition('dirty');
    this.checkpoint('mutation');
  }

  /** Imports an already-transactional production outbox row without minting a new edit. */
  adoptQueuedMutation(item: OutboxItem, state: DomainState | null): void {
    const key = entityKey(item.entityType, item.entityId);
    this.generations.set(key, item.generation);
    if (state) this.domain.set(key, state);
    else this.domain.delete(key);
    this.outbox.set(key, item);
    this.markEntityDirty(key);
    if (this.stateMachine.state === 'idle') this.stateMachine.transition('dirty');
    this.checkpoint('mutation');
  }

  seed(states: { type: EntityType; id: string; state: DomainState }[]): void {
    // Compatibility for Phase 2's in-memory catalog. This list is deliberately
    // absent from the durable checkpoint. SQLite/production uses seedBatch()
    // with LIMITed normalized-table pages instead.
    this.seedItems = [...states].sort((left, right) =>
      entityKey(left.type, left.id).localeCompare(entityKey(right.type, right.id)),
    );
    this.seedIndex = 0;
    this.seedAwaiting.clear();
    this.seedAwaitingCursor = null;
    this.seedCursor = null;
    this.seedComplete = true;
    for (const item of this.seedItems) {
      const key = entityKey(item.type, item.id);
      if (!this.domain.has(key)) this.domain.set(key, item.state);
    }
    this.checkpoint('seed-checkpoint');
  }

  seedBatch(
    states: { type: EntityType; id: string; state: DomainState }[],
    isFinalPage: boolean,
  ): void {
    if (this.seedAwaiting.size > 0) return;
    const batchId = deterministicId('tackbok-seed-batch-v1', this.vault.vaultId);
    this.durabilityBatchDepth++;
    try {
      for (const item of states) {
        const key = entityKey(item.type, item.id);
        this.seedAwaitingCursor = key;
        if (!this.outbox.has(key) && (this.appliedHeads.get(key)?.length ?? 0) === 0) {
          this.mutate(item.type, item.id, item.state, batchId);
        }
        if (this.outbox.has(key)) this.seedAwaiting.add(key);
      }
    } finally {
      this.durabilityBatchDepth--;
    }
    if (this.seedAwaiting.size === 0) this.advanceSeedCursor();
    if (isFinalPage) this.seedComplete = true;
    this.checkpoint('seed-checkpoint');
  }

  restoreLocalDomainState(type: EntityType, id: string, state: DomainState | null): void {
    const key = entityKey(type, id);
    if (state) this.domain.set(key, state);
    else this.domain.delete(key);
  }

  acknowledgeMaterialized(keys: string[]): void {
    keys.forEach((key) => {
      this.pendingMaterializationKeys.delete(key as EntityKey);
      this.pendingRemoteMaterializationKeys.delete(key as EntityKey);
    });
    this.checkpoint('settle');
  }

  snapshot(): Record<string, DomainState> {
    return Object.fromEntries(
      Array.from(this.domain.entries()).sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  async sync(hooks: SyncPassHooks = {}): Promise<SyncPassResult> {
    this.provider.setClientContext?.(this.deviceId);
    this.passRemoteKeys.clear();
    const result: SyncPassResult = {
      pulled: 0,
      pushed: 0,
      applied: 0,
      skippedByCas: 0,
      revoked: false,
      changedEntityKeys: [],
      appliedEntityKeys: [],
      remoteApplied: 0,
    };
    // A terminal marker is sticky. Retrying a pass must not reconnect to or
    // repopulate a vault that this device has already observed as dead.
    if (this.revokedKind) {
      result.revoked = true;
      return result;
    }
    if (!this.connected) {
      if (this.stateMachine.state === 'disabled') {
        await this.initialize();
      } else {
        // A durable restart restores the state machine before the provider
        // session. Reattach silently, then recover the interrupted active
        // state below; do not attempt an impossible idle/pushing -> connecting
        // transition or show interactive consent in background work.
        await this.provider.refreshConnection();
        this.connected = true;
      }
    }
    this.stateMachine.recoverAfterCrash(this.outbox.size > 0);
    const revocation = await this.observeRevocation();
    if (revocation) {
      await this.applyRevocation(revocation);
      result.revoked = true;
      return result;
    }

    if (this.stateMachine.state === 'idle') this.stateMachine.transition('pulling');
    else if (this.stateMachine.state === 'dirty') this.stateMachine.transition('pulling');
    else if (this.stateMachine.state === 'deferred_offline') {
      this.stateMachine.transition('pulling');
    }

    result.pulled = await this.pullAllChanges();
    this.stateMachine.transition('resolving');
    this.pumpSeedBatch();

    const captures = new Map<EntityKey, ProvisionalCapture>();
    const deferredKeys = new Set<EntityKey>();
    const outboxLimit = this.seedAwaiting.size > 0
      ? SEED_BATCH_SIZE
      : PROTOCOL_V1_CAPS.entitiesPerPass;
    for (const [key, item] of Array.from(this.outbox.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    ).slice(0, outboxLimit)) {
      const state = this.domain.get(key) ?? null;
      if (state && !(await this.assetsPublishable(state))) {
        deferredKeys.add(key);
        continue;
      }
      const pending = this.pendingCaptures.get(key);
      const pendingVersion = pending ? this.graphFor(key).get(pending.versionHash) : undefined;
      const capture = pending && pendingVersion
        ? { item, version: pendingVersion, capturedGeneration: pending.capturedGeneration }
        : constructProvisional({
            vaultId: this.vault.vaultId,
            deviceId: this.deviceId,
            editSequence: this.editSequence++,
            authoredAt: item.authoredAt ?? ++this.logicalAuthoredAt,
            item,
            state,
          });
      if (!pendingVersion) {
        this.graphFor(key).add(capture.version.body, capture.version.hash);
        this.pendingCaptures.set(key, {
          versionHash: capture.version.hash,
          capturedGeneration: capture.capturedGeneration,
        });
        this.markEntityDirty(key);
      }
      captures.set(key, capture);
    }
    if (captures.size > 0) this.checkpoint('provisional');

    const resolved: ResolvedEntity[] = [];
    const allKeys = Array.from(this.graphs.keys()).sort(
      (left, right) => graphSort(left) - graphSort(right) || left.localeCompare(right),
    );
    for (const key of allKeys) {
      // Pull and stage remote ancestry, but never resolve/apply over a local
      // mutation whose media is not publishable yet.
      if (deferredKeys.has(key)) continue;
      const graph = this.graphFor(key);
      const heads = graph.heads();
      if (heads.length === 0) continue;
      const capture = captures.get(key);
      const applied = this.appliedHeads.get(key) ?? [];
      // A quiet pass must not re-apply and re-persist every known entity. A
      // pending local capture still proceeds even if its graph was restored
      // after Apply, because its immutable publish may not have completed.
      if (
        !capture &&
        heads.length === applied.length &&
        heads.every((hash, index) => hash === applied[index])
      ) continue;
      const capturedGeneration = capture?.capturedGeneration ?? this.generations.get(key) ?? 0;
      if (heads.length === 1) {
        resolved.push({
          key,
          version: graph.get(heads[0])!,
          recoveries: [],
          capturedGeneration,
        });
        continue;
      }
      const resolution = resolveHeads(graph, heads);
      for (const recovery of resolution.recoveries) {
        const recoveryKey = entityKey(recovery.body.entityType, recovery.body.entityId);
        this.graphFor(recoveryKey).add(recovery.body, recovery.hash);
        this.markEntityDirty(recoveryKey);
        graph.satisfyRecoveryDependency(recovery.hash, {
          entityType: recovery.body.entityType,
          entityId: recovery.body.entityId,
        });
      }
      graph.add(resolution.resolution.body, resolution.resolution.hash);
      this.markEntityDirty(key);
      if (resolution.conflict) {
        validateConflictRecord(resolution.conflict);
        this.conflicts.set(resolution.conflict.conflictId, resolution.conflict);
      }
      resolved.push({
        key,
        version: resolution.resolution,
        recoveries: resolution.recoveries,
        capturedGeneration,
      });
    }

    await hooks.beforeApply?.(this);
    const appliedResolved: ResolvedEntity[] = [];
    for (const item of resolved) {
      const currentGeneration = this.generations.get(item.key) ?? 0;
      if (!canApplyAtGeneration(item.capturedGeneration, currentGeneration)) {
        result.skippedByCas++;
        continue;
      }
      this.applyVersion(item.key, item.version);
      for (const recovery of item.recoveries) {
        this.applyVersion(
          entityKey(recovery.body.entityType, recovery.body.entityId),
          recovery,
        );
      }
      result.applied++;
      if (this.passRemoteKeys.has(item.key)) this.pendingRemoteMaterializationKeys.add(item.key);
      appliedResolved.push(item);
    }
    if (appliedResolved.length > 0) this.checkpoint('apply');

    this.recoverTombstonedTagReferences(appliedResolved);
    this.stateMachine.transition('pushing');
    for (const item of resolved) {
      const capture = captures.get(item.key);
      if (capture && !capture.version.published) {
        await this.publishBlobs(capture.version.body.state);
        await this.publishVersionAncestry(capture.version);
        await this.publishVersion(capture.version);
        capture.version.published = true;
        this.markEntityDirty(item.key);
        this.checkpoint('publish-edit');
        result.pushed++;
      }
      for (const recovery of item.recoveries) {
        if (recovery.published) continue;
        await this.publishBlobs(recovery.body.state);
        await this.publishVersion(recovery);
        recovery.published = true;
        this.markEntityDirty(entityKey(recovery.body.entityType, recovery.body.entityId));
        this.checkpoint('publish-recovery-init');
        result.pushed++;
      }
      if (
        !item.version.published &&
        (item.version.body.kind !== 'edit' || !capture)
      ) {
        await this.publishBlobs(item.version.body.state);
        await this.publishVersionAncestry(item.version);
        await this.publishVersion(item.version);
        item.version.published = true;
        this.markEntityDirty(item.key);
        this.checkpoint(
          item.version.body.kind === 'resolution' ? 'publish-resolution' : 'publish-join',
        );
        result.pushed++;
      }
    }

    for (const [key, capture] of captures) {
      const current = this.outbox.get(key) ?? null;
      const settled = settleOutbox({
        current,
        capture,
        provisionalPublished: capture.version.published,
      });
      if (settled) this.outbox.set(key, settled);
      else this.outbox.delete(key);
      this.pendingCaptures.delete(key);
      this.markEntityDirty(key);
    }
    // External/production pages can advance immediately once their outbox
    // batch settles. The frozen in-memory catalog preserves its original
    // next-pass cursor timing through pumpSeedBatch().
    if (this.seedItems.length === 0) this.advanceSeedCursorIfSettled();
    this.stateMachine.transition('verifying');
    this.stateMachine.transition(this.outbox.size > 0 ? 'dirty' : 'idle');
    this.checkpoint('settle');
    result.changedEntityKeys = Array.from(this.passChangedKeys).sort();
    result.appliedEntityKeys = Array.from(this.pendingMaterializationKeys).sort();
    result.remoteApplied = this.pendingRemoteMaterializationKeys.size;
    this.passChangedKeys.clear();
    return result;
  }

  toDurableDelta(): EngineDurableDelta {
    const entities = Array.from(this.durabilityDirtyKeys).sort().map((key) => ({
      key,
      domain: this.domain.get(key) ?? null,
      generation: this.generations.get(key) ?? 0,
      outbox: this.outbox.get(key) ?? null,
      graph: this.graphs.get(key)?.toDurableState() ?? null,
      appliedHeads: this.appliedHeads.get(key) ?? [],
      degradedReason: this.degradedEntities.get(key) ?? null,
    }));
    const dirty = new Set(entities.map(({ key }) => key));
    return {
      checkpoint: {
        version: 2,
        state: this.stateMachine.state,
        cursor: this.cursor ?? null,
        editSequence: this.editSequence,
        logicalAuthoredAt: this.logicalAuthoredAt,
        revokedKind: this.revokedKind,
        seedAwaiting: Array.from(this.seedAwaiting),
        seedAwaitingCursor: this.seedAwaitingCursor,
        seedCursor: this.seedCursor,
        seedComplete: this.seedComplete,
        purgeCursor: this.purgeCursor,
        pendingCaptures: Array.from(this.pendingCaptures.entries()),
        pendingMaterializationKeys: Array.from(this.pendingMaterializationKeys),
        pendingRemoteMaterializationKeys: Array.from(this.pendingRemoteMaterializationKeys),
      },
      entities,
      conflicts: Array.from(this.conflicts.values()).filter((conflict) =>
        dirty.has(entityKey(conflict.entityType, conflict.entityId)),
      ),
      blobs: Array.from(this.durabilityDirtyBlobs, (hash) => [hash, this.blobs.get(hash)!]),
      clearStructuredState: this.clearStructuredState,
    };
  }

  markDurable(): void {
    this.durabilityDirtyKeys.clear();
    this.durabilityDirtyBlobs.clear();
    this.clearStructuredState = false;
  }

  restoreDurableState(
    checkpoint: EngineDurableCheckpoint,
    entities: EngineDurableEntity[],
    conflicts: NonNullable<ResolutionResult['conflict']>[],
    blobs: [string, Uint8Array][],
  ): void {
    if (checkpoint.version !== 2) throw new Error('Unsupported durable engine checkpoint');
    this.stateMachine = new SyncStateMachine(checkpoint.state);
    this.domain.clear();
    this.generations.clear();
    this.outbox.clear();
    this.graphs.clear();
    this.appliedHeads.clear();
    this.degradedEntities.clear();
    for (const entity of entities) {
      const [type, id] = splitEntityKey(entity.key);
      if (entity.domain) this.domain.set(entity.key, entity.domain);
      this.generations.set(entity.key, entity.generation);
      if (entity.outbox) this.outbox.set(entity.key, entity.outbox);
      if (entity.graph) {
        const graph = new VersionGraph(this.vault.vaultId, type, id);
        graph.restoreDurableState(entity.graph);
        this.graphs.set(entity.key, graph);
      }
      if (entity.appliedHeads.length > 0) this.appliedHeads.set(entity.key, entity.appliedHeads);
      if (entity.degradedReason) this.degradedEntities.set(entity.key, entity.degradedReason);
    }
    this.conflicts.clear();
    conflicts.forEach((conflict) => this.conflicts.set(conflict.conflictId, conflict));
    this.blobs.clear();
    blobs.forEach(([hash, body]) => this.blobs.set(hash, body));
    this.cursor = checkpoint.cursor ?? undefined;
    // A page cursor advances only after its complete page is persisted. An
    // interrupted page is deliberately fetched again instead of checkpointing
    // up to 100 MiB of untrusted remote bodies.
    this.pendingChangeObjects = [];
    this.pendingChangeCursor = undefined;
    this.editSequence = checkpoint.editSequence;
    this.logicalAuthoredAt = checkpoint.logicalAuthoredAt;
    this.connected = false;
    this.revokedKind = checkpoint.revokedKind;
    this.seedAwaiting = new Set(checkpoint.seedAwaiting);
    this.seedAwaitingCursor = checkpoint.seedAwaitingCursor;
    this.seedCursor = checkpoint.seedCursor;
    this.seedComplete = checkpoint.seedComplete;
    this.purgeCursor = checkpoint.purgeCursor;
    this.pendingCaptures.clear();
    checkpoint.pendingCaptures.forEach(([key, value]) => this.pendingCaptures.set(key, value));
    this.pendingMaterializationKeys.clear();
    checkpoint.pendingMaterializationKeys.forEach((key) => this.pendingMaterializationKeys.add(key));
    this.pendingRemoteMaterializationKeys.clear();
    checkpoint.pendingRemoteMaterializationKeys.forEach((key) =>
      this.pendingRemoteMaterializationKeys.add(key),
    );
    this.satisfyKnownRecoveries();
    this.markDurable();
  }

  async revoke(kind: RevocationKind, revocationId: string, timestamp: number): Promise<void> {
    this.provider.setClientContext?.(this.deviceId);
    const body = {
      formatVersion: 1,
      vaultId: this.vault.vaultId,
      kind,
      revocationId,
      timestamp,
    };
    const bytes = canonicalBytes(body);
    const hash = sha256Bytes(bytes);
    await this.provider.putImmutable(
      this.vault,
      `revocations/${hash}.json`,
      bytes,
    );
    this.checkpoint('publish-revocation');
    await this.purgeResidue();
    await this.applyRevocation(kind);
  }

  private graphFor(key: EntityKey): VersionGraph {
    const existing = this.graphs.get(key);
    if (existing) return existing;
    const [type, id] = splitEntityKey(key);
    const graph = new VersionGraph(this.vault.vaultId, type, id);
    this.graphs.set(key, graph);
    return graph;
  }

  private advanceSeedCursorIfSettled(): void {
    if (this.seedAwaiting.size > 0) {
      if (Array.from(this.seedAwaiting).some((key) => this.outbox.has(key))) return;
      this.advanceSeedCursor();
      this.checkpoint('seed-checkpoint');
    }
  }

  private pumpSeedBatch(): void {
    this.advanceSeedCursorIfSettled();
    if (this.seedAwaiting.size > 0 || this.seedIndex >= this.seedItems.length) return;

    const batchId = deterministicId('tackbok-seed-batch-v1', this.vault.vaultId);
    let scanned = 0;
    this.durabilityBatchDepth++;
    try {
      while (this.seedIndex < this.seedItems.length && scanned < SEED_BATCH_SIZE) {
        const item = this.seedItems[this.seedIndex++];
        const key = entityKey(item.type, item.id);
        scanned++;
        this.seedAwaitingCursor = key;
        if (this.outbox.has(key)) {
          this.seedAwaiting.add(key);
          continue;
        }
        const alreadyPublished =
          (this.appliedHeads.get(key)?.length ?? 0) > 0 || this.graphFor(key).heads().length > 0;
        if (alreadyPublished) continue;
        this.mutate(item.type, item.id, this.domain.get(key) ?? item.state, batchId);
        this.seedAwaiting.add(key);
      }
    } finally {
      this.durabilityBatchDepth--;
    }
    if (this.seedAwaiting.size === 0) this.advanceSeedCursor();
    this.checkpoint('seed-checkpoint');
  }

  private advanceSeedCursor(): void {
    this.seedCursor = this.seedAwaitingCursor;
    this.seedAwaiting.clear();
    this.seedAwaitingCursor = null;
  }

  private async pullAllChanges(): Promise<number> {
    let pulled = 0;
    let cursor = this.cursor;
    const entities = new Set<EntityKey>();
    while (true) {
      if (this.pendingChangeObjects.length === 0) {
        const page = await this.provider.getChanges(this.vault, cursor);
        const next = page.cursor ?? cursor;
        if (page.objects.length === 0 || next === cursor) {
          this.cursor = next;
          this.satisfyKnownRecoveries();
          return pulled;
        }
        this.pendingChangeObjects = [...page.objects];
        this.pendingChangeCursor = next;
      }
      while (this.pendingChangeObjects.length > 0) {
        const object = this.pendingChangeObjects[0];
        if (!object.key.startsWith('entities/')) {
          this.pendingChangeObjects.shift();
          continue;
        }
        const segments = object.key.split('/');
        const key = segments.length === 4
          ? entityKey(segments[1] as EntityType, segments[2])
          : null;
        if (
          key &&
          !entities.has(key) &&
          entities.size >= PROTOCOL_V1_CAPS.entitiesPerPass
        ) {
          this.satisfyKnownRecoveries();
          return pulled;
        }
        this.pendingChangeObjects.shift();
        if (key) entities.add(key);
        if (key) this.passRemoteKeys.add(key);
        try {
          this.stageRemoteObject(object);
          if (key) {
            this.degradedEntities.delete(key);
            this.markEntityDirty(key);
          }
        } catch (error) {
          if (key) {
            this.degradedEntities.set(
              key,
              error instanceof Error ? error.message : 'invalid remote object',
            );
            this.markEntityDirty(key);
          }
        }
        pulled++;
      }

      // Only advance the provider cursor after the entire fetched page has
      // been consumed. This prevents a reversed page plus the entity cap from
      // skipping the low-sequence tail permanently.
      cursor = this.pendingChangeCursor ?? cursor;
      this.cursor = cursor;
      this.pendingChangeCursor = undefined;
      this.checkpoint('pull-page');
    }
  }

  private stageRemoteObject(object: RemoteObject): void {
    const segments = object.key.split('/');
    if (segments.length !== 4) return;
    const [, rawType, id, filename] = segments;
    const hash = filename.replace(/\.json$/, '');
    if (!['entry', 'tag', 'prompt', 'profile'].includes(rawType)) {
      throw new Error('Unknown remote entity type');
    }
    const key = entityKey(rawType as EntityType, id);
    const graph = this.graphFor(key);
    graph.recordFetchedDependency(hash, object.body.byteLength);
    const body = JSON.parse(new TextDecoder().decode(object.body)) as EntityVersionBody;
    const version = graph.add(body, hash);
    version.published = true;
    this.markEntityDirty(key);
  }

  private satisfyKnownRecoveries(): void {
    const known = new Map<string, { entityType: EntityType; entityId: string }>();
    for (const graph of this.graphs.values()) {
      for (const version of graph.values()) {
        known.set(version.hash, {
          entityType: version.body.entityType,
          entityId: version.body.entityId,
        });
      }
    }
    for (const graph of this.graphs.values()) {
      for (const version of graph.incomplete()) {
        for (const recovery of version.body.recoveries) {
          const identity = known.get(recovery.versionHash);
          if (identity) graph.satisfyRecoveryDependency(recovery.versionHash, identity);
        }
      }
    }
  }

  private applyVersion(key: EntityKey, version: HashedVersion): void {
    if (version.body.deleted || !version.body.state) this.domain.delete(key);
    else this.domain.set(key, version.body.state);
    this.appliedHeads.set(key, [version.hash]);
    this.pendingMaterializationKeys.add(key);
    this.markEntityDirty(key);
  }

  private async publishVersion(version: HashedVersion): Promise<void> {
    await this.provider.putImmutable(
      this.vault,
      versionKey(version),
      new TextEncoder().encode(version.canonical),
    );
  }

  private async publishVersionAncestry(
    version: HashedVersion,
    visited = new Set<string>(),
  ): Promise<void> {
    if (visited.has(version.hash)) return;
    visited.add(version.hash);
    const key = entityKey(version.body.entityType, version.body.entityId);
    const graph = this.graphFor(key);
    for (const parentHash of version.body.parents) {
      const parent = graph.get(parentHash);
      if (!parent) throw new Error(`Cannot publish version with missing parent ${parentHash}`);
      await this.publishVersionAncestry(parent, visited);
      if (!parent.published) {
        await this.publishBlobs(parent.body.state);
        await this.publishVersion(parent);
        parent.published = true;
        this.markEntityDirty(key);
        this.checkpoint(
          parent.body.kind === 'edit'
            ? 'publish-edit'
            : parent.body.kind === 'recovery-init'
              ? 'publish-recovery-init'
              : parent.body.kind === 'resolution'
                ? 'publish-resolution'
                : 'publish-join',
        );
      }
    }
    for (const recoveryRef of version.body.recoveries) {
      const recovery = this.graphs
        .get(entityKey(recoveryRef.entityType, recoveryRef.entityId))
        ?.get(recoveryRef.versionHash);
      if (!recovery) {
        throw new Error(
          `Cannot publish resolution with missing recovery ${recoveryRef.versionHash}`,
        );
      }
      await this.publishVersionAncestry(recovery, visited);
      if (!recovery.published) {
        await this.publishBlobs(recovery.body.state);
        await this.publishVersion(recovery);
        recovery.published = true;
        this.markEntityDirty(entityKey(recovery.body.entityType, recovery.body.entityId));
        this.checkpoint('publish-recovery-init');
      }
    }
  }

  private async assetsPublishable(state: DomainState): Promise<boolean> {
    const assets =
      state.entityType === 'entry'
        ? state.assets
        : state.entityType === 'profile' && state.photo
          ? [state.photo]
          : [];
    for (const asset of assets) {
      if (!/^[a-f0-9]{64}$/.test(asset.blobHash)) return false;
      if (this.blobs.has(asset.blobHash) || this.blobSources.has(asset.blobHash)) continue;
      const key = `blobs/${asset.blobHash.slice(0, 2)}/${asset.blobHash}`;
      if (!(await this.provider.read(this.vault, key))) return false;
    }
    return true;
  }

  private async publishBlobs(state: DomainState | null): Promise<void> {
    if (!state) return;
    const assets =
      state.entityType === 'entry'
        ? state.assets
        : state.entityType === 'profile' && state.photo
          ? [state.photo]
          : [];
    for (const asset of assets) {
      const body = this.blobSources.get(asset.blobHash) ?? this.blobs.get(asset.blobHash);
      if (!body) continue;
      await this.provider.putImmutable(
        this.vault,
        `blobs/${asset.blobHash.slice(0, 2)}/${asset.blobHash}`,
        body,
      );
      this.checkpoint('publish-blob');
    }
  }

  private async observeRevocation(): Promise<RevocationKind | null> {
    const observed: RevocationKind[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.provider.list(this.vault, 'revocations/', cursor);
      for (const object of page.objects) {
        try {
          const marker = parseAndValidateRevocationMarker(
            object.body,
            this.vault.vaultId,
          );
          observed.push(marker.kind);
        } catch {
          // Invalid markers are ignored and surfaced by adapter diagnostics.
        }
      }
      cursor = page.cursor ?? undefined;
    } while (cursor);
    if (observed.includes('journal-deleted')) return 'journal-deleted';
    return observed.includes('backup-deleted') ? 'backup-deleted' : null;
  }

  private async applyRevocation(kind: RevocationKind): Promise<void> {
    this.revokedKind = kind;
    const existingKeys = new Set<EntityKey>([
      ...this.domain.keys(), ...this.generations.keys(), ...this.outbox.keys(),
      ...this.graphs.keys(), ...this.appliedHeads.keys(),
    ]);
    if (kind === 'journal-deleted') {
      this.domain.clear();
      this.generations.clear();
      this.graphs.clear();
      this.appliedHeads.clear();
      this.clearStructuredState = true;
    }
    this.outbox.clear();
    this.pendingCaptures.clear();
    existingKeys.forEach((key) => this.markEntityDirty(key));
    await this.purgeResidue();
    await this.provider.disconnect();
    this.connected = false;
    if (this.stateMachine.state !== 'revoked') this.stateMachine.transition('revoked');
    this.checkpoint('revoked');
  }

  private async purgeResidue(): Promise<void> {
    let cursor = this.purgeCursor ?? undefined;
    do {
      const page = await this.provider.deleteVaultResidue(this.vault, cursor);
      cursor = page.cursor ?? undefined;
      this.purgeCursor = cursor ?? null;
      this.checkpoint('purge-batch');
      if (page.complete) {
        this.purgeCursor = null;
        break;
      }
    } while (true);
  }

  private checkpoint(step: DurableSyncStep): void {
    if (this.durabilityBatchDepth > 0) return;
    this.durability?.checkpoint(this, step);
  }

  private markEntityDirty(key: EntityKey): void {
    this.durabilityDirtyKeys.add(key);
    this.passChangedKeys.add(key);
  }

  private recoverTombstonedTagReferences(resolved: ResolvedEntity[]): void {
    for (const item of resolved) {
      const currentGeneration = this.generations.get(item.key) ?? 0;
      if (!canApplyAtGeneration(item.capturedGeneration, currentGeneration)) continue;
      if (item.version.body.state?.entityType !== 'entry') continue;
      const entry = item.version.body.state;
      const rewritten = [...entry.tagIds];
      let changed = false;
      for (let index = 0; index < rewritten.length; index++) {
        const tagId = rewritten[index];
        if (this.domain.has(entityKey('tag', tagId))) continue;
        const tagKey = entityKey('tag', tagId);
        const tagGraph = this.graphs.get(tagKey);
        const tombstone = (this.appliedHeads.get(tagKey) ?? [])
          .map((hash) => tagGraph?.get(hash))
          .filter(
            (version): version is HashedVersion =>
              !!version && version.status === 'complete' && version.body.deleted,
          )
          .sort((left, right) => left.hash.localeCompare(right.hash))[0];
        if (!tagGraph || !tombstone) continue;
        const liveAncestors = tagGraph
          .values()
          .filter(
            (version) =>
              version.status === 'complete' &&
              !version.body.deleted &&
              version.body.state?.entityType === 'tag' &&
              tagGraph.descendsFrom(tombstone.hash, version.hash),
          );
        const prior = liveAncestors
          .filter(
            (candidate) =>
              !liveAncestors.some(
                (other) =>
                  other.hash !== candidate.hash &&
                  tagGraph.descendsFrom(other.hash, candidate.hash),
              ),
          )
          .sort((left, right) => left.hash.localeCompare(right.hash))[0];
        if (!prior || prior.body.state?.entityType !== 'tag') continue;
        const recoveredId = deterministicId(
          'tackbok-recovered-tombstoned-tag-v1',
          this.vault.vaultId,
          tagId,
          tombstone.hash,
        );
        const recoveredState: TagState = {
          ...prior.body.state,
          conflictOriginId: tagId,
        };
        const recovery = createSystemVersion({
          vaultId: this.vault.vaultId,
          entityType: 'tag',
          entityId: recoveredId,
          kind: 'recovery-init',
          parents: [],
          state: recoveredState,
          derivedTimestamp: item.version.body.derivedTimestamp,
        });
        this.graphFor(entityKey('tag', recoveredId)).add(recovery.body, recovery.hash);
        this.applyVersion(entityKey('tag', recoveredId), recovery);
        item.recoveries.unshift(recovery);
        rewritten[index] = recoveredId;
        changed = true;
      }
      if (changed) {
        const rewrittenEntry: DomainState = { ...entry, tagIds: rewritten.sort() };
        const rewrittenVersion = createSystemVersion({
          vaultId: this.vault.vaultId,
          entityType: item.version.body.entityType,
          entityId: item.version.body.entityId,
          kind: 'join',
          parents: [item.version.hash],
          state: rewrittenEntry,
          recoveries: item.recoveries.map((recovery) => ({
            entityType: recovery.body.entityType,
            entityId: recovery.body.entityId,
            versionHash: recovery.hash,
          })),
          derivedTimestamp: item.version.body.derivedTimestamp,
        });
        const graph = this.graphFor(item.key);
        for (const recovery of item.recoveries) {
          graph.satisfyRecoveryDependency(recovery.hash, {
            entityType: recovery.body.entityType,
            entityId: recovery.body.entityId,
          });
        }
        graph.add(rewrittenVersion.body, rewrittenVersion.hash);
        item.version = rewrittenVersion;
        this.applyVersion(item.key, rewrittenVersion);
      }
    }
  }
}
