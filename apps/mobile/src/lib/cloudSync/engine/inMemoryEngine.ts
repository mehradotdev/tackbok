import { canonicalBytes, sha256Bytes } from '../codec';
import { VersionGraph } from '../ancestry';
import { resolveHeads, type ResolutionResult } from '../conflicts';
import { createSystemVersion, deterministicId } from '../domain/version';
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
import type { CloudProvider, RemoteObject, VaultRef } from '../providers';
import { SyncStateMachine } from './stateMachine';

type EntityKey = `${EntityType}:${string}`;

interface ResolvedEntity {
  key: EntityKey;
  version: HashedVersion;
  recoveries: HashedVersion[];
  capturedGeneration: number;
}

export interface SyncPassHooks {
  beforeApply?: (device: InMemorySyncDevice) => void | Promise<void>;
}

export interface SyncPassResult {
  pulled: number;
  pushed: number;
  applied: number;
  skippedByCas: number;
  revoked: boolean;
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
  readonly stateMachine = new SyncStateMachine();
  readonly domain = new Map<EntityKey, DomainState>();
  readonly generations = new Map<EntityKey, number>();
  readonly outbox = new Map<EntityKey, OutboxItem>();
  readonly graphs = new Map<EntityKey, VersionGraph>();
  readonly conflicts = new Map<string, NonNullable<ResolutionResult['conflict']>>();
  readonly blobs = new Map<string, Uint8Array>();
  readonly appliedHeads = new Map<EntityKey, string[]>();
  private cursor: string | undefined;
  private editSequence = 1;
  private connected = false;
  private revokedKind: RevocationKind | null = null;

  constructor(
    readonly deviceId: string,
    readonly vault: VaultRef,
    readonly provider: CloudProvider,
  ) {}

  get isRevoked(): boolean {
    return this.revokedKind !== null;
  }

  async initialize(): Promise<void> {
    this.stateMachine.transition('connecting');
    await this.provider.connect();
    this.connected = true;
    this.stateMachine.transition('initializing');
    this.stateMachine.transition('idle');
  }

  putBlob(bytes: Uint8Array): string {
    const hash = sha256Bytes(bytes);
    this.blobs.set(hash, bytes.slice());
    return hash;
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
      }),
    );
    if (this.stateMachine.state === 'idle') this.stateMachine.transition('dirty');
  }

  seed(states: { type: EntityType; id: string; state: DomainState }[]): void {
    const batchId = deterministicId('tackbok-seed-batch-v1', this.vault.vaultId);
    for (const item of states) this.mutate(item.type, item.id, item.state, batchId);
  }

  snapshot(): Record<string, DomainState> {
    return Object.fromEntries(
      Array.from(this.domain.entries()).sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  async sync(hooks: SyncPassHooks = {}): Promise<SyncPassResult> {
    if (!this.connected) await this.initialize();
    this.stateMachine.recoverAfterCrash(this.outbox.size > 0);
    const result: SyncPassResult = {
      pulled: 0,
      pushed: 0,
      applied: 0,
      skippedByCas: 0,
      revoked: false,
    };
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

    const captures = new Map<EntityKey, ProvisionalCapture>();
    for (const [key, item] of Array.from(this.outbox.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const state = this.domain.get(key) ?? null;
      if (state && !(await this.assetsPublishable(state))) continue;
      const capture = constructProvisional({
        vaultId: this.vault.vaultId,
        deviceId: this.deviceId,
        editSequence: this.editSequence++,
        authoredAt: Date.now(),
        item,
        state,
      });
      this.graphFor(key).add(capture.version.body, capture.version.hash);
      captures.set(key, capture);
    }

    const resolved: ResolvedEntity[] = [];
    const allKeys = Array.from(this.graphs.keys()).sort(
      (left, right) => graphSort(left) - graphSort(right) || left.localeCompare(right),
    );
    for (const key of allKeys) {
      const graph = this.graphFor(key);
      const heads = graph.heads();
      if (heads.length === 0) continue;
      const capture = captures.get(key);
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
        graph.satisfyRecoveryDependency(recovery.hash, {
          entityType: recovery.body.entityType,
          entityId: recovery.body.entityId,
        });
      }
      graph.add(resolution.resolution.body, resolution.resolution.hash);
      if (resolution.conflict) {
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
    }

    this.recoverTombstonedTagReferences(resolved);
    this.stateMachine.transition('pushing');
    for (const item of resolved) {
      const capture = captures.get(item.key);
      if (capture) {
        await this.publishBlobs(capture.version.body.state);
        await this.publishVersionAncestry(capture.version);
        await this.publishVersion(capture.version);
        capture.version.published = true;
        result.pushed++;
      }
      for (const recovery of item.recoveries) {
        await this.publishBlobs(recovery.body.state);
        await this.publishVersion(recovery);
        recovery.published = true;
        result.pushed++;
      }
      if (item.version.body.kind !== 'edit' || !capture) {
        await this.publishBlobs(item.version.body.state);
        await this.publishVersionAncestry(item.version);
        await this.publishVersion(item.version);
        item.version.published = true;
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
    }
    this.stateMachine.transition('verifying');
    this.stateMachine.transition(this.outbox.size > 0 ? 'dirty' : 'idle');
    return result;
  }

  async revoke(kind: RevocationKind, revocationId: string, timestamp: number): Promise<void> {
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

  private async pullAllChanges(): Promise<number> {
    let pulled = 0;
    let cursor = this.cursor;
    while (true) {
      const page = await this.provider.getChanges(this.vault, cursor);
      for (const object of page.objects) {
        if (!object.key.startsWith('entities/')) continue;
        this.stageRemoteObject(object);
        pulled++;
      }
      const next = page.cursor ?? cursor;
      if (page.objects.length === 0 || next === cursor) {
        this.cursor = next;
        break;
      }
      cursor = next;
    }
    this.cursor = cursor;
    this.satisfyKnownRecoveries();
    return pulled;
  }

  private stageRemoteObject(object: RemoteObject): void {
    const segments = object.key.split('/');
    if (segments.length !== 4) return;
    const [, rawType, id, filename] = segments;
    const hash = filename.replace(/\.json$/, '');
    const body = JSON.parse(new TextDecoder().decode(object.body)) as EntityVersionBody;
    const key = entityKey(rawType as EntityType, id);
    const version = this.graphFor(key).add(body, hash);
    version.published = true;
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
      if (this.blobs.has(asset.blobHash)) continue;
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
      const body = this.blobs.get(asset.blobHash);
      if (!body) continue;
      await this.provider.putImmutable(
        this.vault,
        `blobs/${asset.blobHash.slice(0, 2)}/${asset.blobHash}`,
        body,
      );
    }
  }

  private async observeRevocation(): Promise<RevocationKind | null> {
    const observed: RevocationKind[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.provider.list(this.vault, 'revocations/', cursor);
      for (const object of page.objects) {
        try {
          const marker = JSON.parse(new TextDecoder().decode(object.body)) as {
            vaultId: string;
            kind: RevocationKind;
          };
          if (
            marker.vaultId === this.vault.vaultId &&
            (marker.kind === 'journal-deleted' || marker.kind === 'backup-deleted')
          ) {
            observed.push(marker.kind);
          }
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
    if (kind === 'journal-deleted') {
      this.domain.clear();
      this.generations.clear();
      this.graphs.clear();
      this.appliedHeads.clear();
    }
    this.outbox.clear();
    await this.purgeResidue();
    await this.provider.disconnect();
    this.connected = false;
    if (this.stateMachine.state !== 'revoked') this.stateMachine.transition('revoked');
  }

  private async purgeResidue(): Promise<void> {
    let cursor: string | undefined;
    do {
      const page = await this.provider.deleteVaultResidue(this.vault, cursor);
      cursor = page.cursor ?? undefined;
      if (page.complete) break;
    } while (true);
  }

  private recoverTombstonedTagReferences(resolved: ResolvedEntity[]): void {
    for (const item of resolved) {
      if (item.version.body.state?.entityType !== 'entry') continue;
      const entry = item.version.body.state;
      const rewritten = [...entry.tagIds];
      let changed = false;
      for (let index = 0; index < rewritten.length; index++) {
        const tagId = rewritten[index];
        if (this.domain.has(entityKey('tag', tagId))) continue;
        const tagGraph = this.graphs.get(entityKey('tag', tagId));
        const prior = tagGraph
          ?.values()
          .filter(
            (version) => !version.body.deleted && version.body.state?.entityType === 'tag',
          )
          .sort((left, right) => left.hash.localeCompare(right.hash))[0];
        if (!prior || prior.body.state?.entityType !== 'tag') continue;
        const recoveredId = deterministicId(
          'tackbok-recovered-tombstoned-tag-v1',
          tagId,
          item.version.hash,
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
