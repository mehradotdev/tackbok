import { PROTOCOL_V1_CAPS } from '../protocol/validationCaps';
import { hashVersion } from '../domain/version';
import { validateVersionBody } from '../domain/validation';
import type { EntityVersionBody, HashedVersion } from '../domain/types';

export function assertAncestryDepthWithinCap(depth: number): void {
  if (depth > PROTOCOL_V1_CAPS.ancestryDepth) {
    throw new Error('Version ancestry depth cap exceeded');
  }
}

export interface MissingDependency {
  hash: string;
  kind: 'parent' | 'recovery';
}

export interface VersionGraphDurableState {
  versions: {
    body: EntityVersionBody;
    hash: string;
    status: HashedVersion['status'];
    published: boolean;
  }[];
  fetchedDependencies: { hash: string; byteLength: number }[];
  recoveryDependencies: {
    hash: string;
    entityType: string;
    entityId: string;
  }[];
}

export class VersionGraph {
  private readonly versions = new Map<string, HashedVersion>();
  private readonly fetchedDependencyHashes = new Set<string>();
  private fetchedDependencyBytes = 0;
  private readonly fetchedDependencySizes = new Map<string, number>();
  private readonly recoveryDependencies = new Map<
    string,
    { entityType: string; entityId: string }
  >();

  constructor(
    readonly vaultId: string,
    readonly entityType?: string,
    readonly entityId?: string,
  ) {}

  get size(): number {
    return this.versions.size;
  }

  get(hash: string): HashedVersion | undefined {
    return this.versions.get(hash);
  }

  values(): HashedVersion[] {
    return Array.from(this.versions.values());
  }

  /**
   * Accounts for unique remote objects before JSON parsing/staging. This is
   * deliberately on the change-feed path: fetchMissing is not the only way an
   * entity's dependency graph arrives.
   */
  recordFetchedDependency(hash: string, byteLength: number): void {
    if (this.fetchedDependencyHashes.has(hash)) return;
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new Error('Invalid fetched dependency byte length');
    }
    if (
      this.fetchedDependencyHashes.size >=
      PROTOCOL_V1_CAPS.dependencyObjectsPerEntity
    ) {
      throw new Error('Dependency fetch object cap exceeded');
    }
    if (
      byteLength >
      PROTOCOL_V1_CAPS.dependencyBytesPerEntity - this.fetchedDependencyBytes
    ) {
      throw new Error('Dependency fetch byte cap exceeded');
    }
    this.fetchedDependencyHashes.add(hash);
    this.fetchedDependencySizes.set(hash, byteLength);
    this.fetchedDependencyBytes += byteLength;
  }

  toDurableState(): VersionGraphDurableState {
    return {
      versions: this.values().map((version) => ({
        body: version.body,
        hash: version.hash,
        status: version.status,
        published: version.published,
      })),
      fetchedDependencies: Array.from(this.fetchedDependencySizes, ([hash, byteLength]) => ({
        hash,
        byteLength,
      })),
      recoveryDependencies: Array.from(
        this.recoveryDependencies,
        ([hash, identity]) => ({ hash, ...identity }),
      ),
    };
  }

  restoreDurableState(state: VersionGraphDurableState): void {
    for (const dependency of state.fetchedDependencies) {
      this.recordFetchedDependency(dependency.hash, dependency.byteLength);
    }
    for (const dependency of state.recoveryDependencies) {
      this.recoveryDependencies.set(dependency.hash, {
        entityType: dependency.entityType,
        entityId: dependency.entityId,
      });
    }
    const pending = [...state.versions];
    while (pending.length > 0) {
      const nextIndex = pending.findIndex((candidate) =>
        candidate.body.parents.every(
          (parent) => this.versions.has(parent) || !state.versions.some((item) => item.hash === parent),
        ),
      );
      const [next] = pending.splice(nextIndex < 0 ? 0 : nextIndex, 1);
      const restored = this.add(next.body, next.hash);
      restored.status = next.status;
      restored.published = next.published;
    }
    this.refreshCompleteness();
  }

  add(body: EntityVersionBody, expectedHash?: string): HashedVersion {
    validateVersionBody(body, {
      vaultId: this.vaultId,
      entityType: this.entityType,
      entityId: this.entityId,
    });
    const version = hashVersion(body);
    if (expectedHash && expectedHash !== version.hash) {
      throw new Error(`Version filename/hash mismatch: ${expectedHash}`);
    }
    const existing = this.versions.get(version.hash);
    if (existing) return existing;
    if (this.versions.size >= PROTOCOL_V1_CAPS.dependencyObjectsPerEntity) {
      throw new Error('Entity dependency object cap exceeded');
    }
    version.status = this.missingDependenciesFor(version).length > 0 ? 'incomplete' : 'complete';
    this.versions.set(version.hash, version);
    this.assertAcyclic(version.hash);
    this.refreshCompleteness();
    this.assertDepth(version.hash);
    return version;
  }

  missingDependencies(hash: string): MissingDependency[] {
    const version = this.versions.get(hash);
    return version ? this.missingDependenciesFor(version) : [];
  }

  incomplete(): HashedVersion[] {
    return this.values().filter((version) => version.status === 'incomplete');
  }

  satisfyRecoveryDependency(
    hash: string,
    identity: { entityType: string; entityId: string },
  ): void {
    this.recoveryDependencies.set(hash, identity);
    this.refreshCompleteness();
  }

  heads(): string[] {
    const complete = this.values().filter((version) => version.status === 'complete');
    const referenced = new Set<string>();
    for (const version of complete) {
      for (const parent of version.body.parents) {
        if (this.versions.get(parent)?.status === 'complete') referenced.add(parent);
      }
    }
    return complete
      .map((version) => version.hash)
      .filter((hash) => !referenced.has(hash))
      .sort();
  }

  descendsFrom(descendantHash: string, ancestorHash: string): boolean {
    if (descendantHash === ancestorHash) return true;
    const seen = new Set<string>();
    const stack = [descendantHash];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const version = this.versions.get(current);
      if (!version || version.status !== 'complete') continue;
      for (const parent of version.body.parents) {
        if (parent === ancestorHash) return true;
        stack.push(parent);
      }
    }
    return false;
  }

  maximalCommonAncestors(headHashes: string[]): string[] {
    const uniqueHeads = Array.from(new Set(headHashes)).sort();
    if (uniqueHeads.length === 0) return [];
    const intersections = uniqueHeads.map((head) => this.ancestorSet(head));
    const common = Array.from(intersections[0]).filter((hash) =>
      intersections.every((set) => set.has(hash)),
    );
    return common
      .filter(
        (candidate) =>
          !common.some(
            (other) => other !== candidate && this.descendsFrom(other, candidate),
          ),
      )
      .sort();
  }

  async fetchMissing(
    fetcher: (dependency: MissingDependency) => Promise<EntityVersionBody | null>,
  ): Promise<void> {
    let fetched = 0;
    let fetchedBytes = 0;
    while (true) {
      const missing = this.incomplete().flatMap((version) =>
        this.missingDependencies(version.hash),
      );
      const unique = Array.from(
        new Map(missing.map((dependency) => [dependency.hash, dependency])).values(),
      );
      if (unique.length === 0) return;
      let progress = false;
      for (const dependency of unique) {
        if (fetched >= PROTOCOL_V1_CAPS.dependencyObjectsPerEntity) {
          throw new Error('Dependency fetch object cap exceeded');
        }
        const body = await fetcher(dependency);
        if (!body) continue;
        fetched++;
        fetchedBytes += new TextEncoder().encode(JSON.stringify(body)).byteLength;
        if (fetchedBytes > PROTOCOL_V1_CAPS.dependencyBytesPerEntity) {
          throw new Error('Dependency fetch byte cap exceeded');
        }
        this.add(body, dependency.hash);
        progress = true;
      }
      if (!progress) return;
    }
  }

  private missingDependenciesFor(version: HashedVersion): MissingDependency[] {
    const missing: MissingDependency[] = [];
    for (const parent of version.body.parents) {
      if (!this.versions.has(parent)) missing.push({ hash: parent, kind: 'parent' });
    }
    for (const recovery of version.body.recoveries) {
      const dependency = this.versions.get(recovery.versionHash);
      const external = this.recoveryDependencies.get(recovery.versionHash);
      if (!dependency && !external) {
        missing.push({ hash: recovery.versionHash, kind: 'recovery' });
      } else if (
        dependency &&
        (dependency.body.entityType !== recovery.entityType ||
          dependency.body.entityId !== recovery.entityId)
      ) {
        throw new Error('Recovery dependency identity mismatch');
      } else if (
        external &&
        (external.entityType !== recovery.entityType ||
          external.entityId !== recovery.entityId)
      ) {
        throw new Error('Recovery dependency identity mismatch');
      }
    }
    return missing;
  }

  private refreshCompleteness(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const version of this.versions.values()) {
        const complete =
          this.missingDependenciesFor(version).length === 0 &&
          version.body.parents.every(
            (parent) => this.versions.get(parent)?.status === 'complete',
          ) &&
          version.body.recoveries.every(
            (recovery) =>
              this.versions.get(recovery.versionHash)?.status === 'complete' ||
              this.recoveryDependencies.has(recovery.versionHash),
          );
        const next = complete ? 'complete' : 'incomplete';
        if (version.status !== next) {
          version.status = next;
          changed = true;
        }
      }
    }
  }

  private ancestorSet(hash: string): Set<string> {
    const result = new Set<string>();
    const stack = [hash];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (result.has(current)) continue;
      const version = this.versions.get(current);
      if (!version || version.status !== 'complete') continue;
      result.add(current);
      stack.push(...version.body.parents);
    }
    return result;
  }

  private assertAcyclic(start: string): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (hash: string): void => {
      if (visiting.has(hash)) throw new Error('Cyclic version ancestry');
      if (visited.has(hash)) return;
      visiting.add(hash);
      const version = this.versions.get(hash);
      for (const parent of version?.body.parents ?? []) {
        if (this.versions.has(parent)) visit(parent);
      }
      visiting.delete(hash);
      visited.add(hash);
    };
    visit(start);
  }

  private assertDepth(start: string): void {
    const stack: { hash: string; depth: number }[] = [{ hash: start, depth: 1 }];
    while (stack.length > 0) {
      const { hash, depth } = stack.pop()!;
      assertAncestryDepthWithinCap(depth);
      const version = this.versions.get(hash);
      for (const parent of version?.body.parents ?? []) {
        if (this.versions.has(parent)) stack.push({ hash: parent, depth: depth + 1 });
      }
    }
  }
}
