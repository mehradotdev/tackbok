import { canonicalizeJsonV1 } from '../codec';
import type { CanonicalJsonValue } from '../phase0/canonicalJsonV1';
import { VersionGraph } from '../ancestry';
import { createSystemVersion, deterministicId } from '../domain/version';
import {
  normalizeDomainState,
  type AssetDescriptor,
  type ConflictAlternate,
  type ConflictRecord,
  type DomainState,
  type EntryState,
  type HashedVersion,
  type ProfileState,
} from '../domain/types';

interface Candidate {
  representativeHash: string;
  headHashes: string[];
  state: DomainState | null;
  deleted: boolean;
}

export interface ResolutionResult {
  resolution: HashedVersion;
  recoveries: HashedVersion[];
  conflict: ConflictRecord | null;
}

function groupCandidates(graph: VersionGraph, heads: string[]): Candidate[] {
  const groups = new Map<string, Candidate>();
  for (const hash of [...heads].sort()) {
    const version = graph.get(hash);
    if (!version || version.status !== 'complete') {
      throw new Error(`Cannot resolve incomplete head ${hash}`);
    }
    const key = canonicalizeJsonV1({
      deleted: version.body.deleted,
      state: version.body.state,
    } as unknown as CanonicalJsonValue);
    const group = groups.get(key);
    if (group) {
      group.headHashes.push(hash);
      group.representativeHash = [group.representativeHash, hash].sort()[0];
    } else {
      groups.set(key, {
        representativeHash: hash,
        headHashes: [hash],
        state: version.body.state,
        deleted: version.body.deleted,
      });
    }
  }
  return Array.from(groups.values()).sort((left, right) =>
    left.representativeHash.localeCompare(right.representativeHash),
  );
}

function latestDeterministicTimestamp(graph: VersionGraph, heads: string[]): number | null {
  const values = heads
    .map((hash) => graph.get(hash)?.body)
    .map((body) =>
      body?.kind === 'edit' ? body.authoredAt : body?.derivedTimestamp ?? null,
    )
    .filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function same(value: unknown, other: unknown): boolean {
  return (
    canonicalizeJsonV1(value as CanonicalJsonValue) ===
    canonicalizeJsonV1(other as CanonicalJsonValue)
  );
}

function mergeStableSet<T>(
  base: T[] | null,
  candidates: T[][],
  id: (value: T) => string,
): T[] {
  const values = new Map<string, T>();
  for (const candidate of candidates) {
    for (const value of candidate) values.set(id(value), value);
  }
  if (!base) return Array.from(values.values()).sort((a, b) => id(a).localeCompare(id(b)));

  const baseIds = new Set(base.map(id));
  for (const value of base) values.set(id(value), value);
  for (const baseId of baseIds) {
    // With one unambiguous common base, any branch missing a base item observed
    // and causally removed it. Additions absent from the base use union semantics.
    if (candidates.some((candidate) => !candidate.some((value) => id(value) === baseId))) {
      values.delete(baseId);
    }
  }
  return Array.from(values.values()).sort((a, b) => id(a).localeCompare(id(b)));
}

function scalarChoice<T>(
  field: string,
  base: T | undefined,
  candidates: Candidate[],
  read: (state: DomainState) => T,
): { value: T; alternates: ConflictAlternate[] } {
  const live = candidates.filter((candidate) => candidate.state !== null);
  const changed =
    base === undefined
      ? live
      : live.filter((candidate) => !same(read(candidate.state!), base));
  const selected = changed.length === 1 ? changed[0] : live[0];
  const value = read(selected.state!);
  if (changed.length <= 1) return { value, alternates: [] };
  return {
    value,
    alternates: live
      .filter((candidate) => candidate.representativeHash !== selected.representativeHash)
      .map((candidate) => ({
        representativeHash: candidate.representativeHash,
        values: { [field]: read(candidate.state!) as never },
      })),
  };
}

function recoveredAsset(
  recoveredEntryId: string,
  asset: AssetDescriptor,
): AssetDescriptor {
  return {
    ...asset,
    assetId: deterministicId(
      'tackbok-recovered-asset-v1',
      recoveredEntryId,
      asset.assetId,
    ),
  };
}

function resolveEntries(
  vaultId: string,
  entityId: string,
  heads: string[],
  candidates: Candidate[],
  base: EntryState | null,
  derivedTimestamp: number | null,
): Omit<ResolutionResult, 'resolution'> & { state: EntryState; recoveryRefs: ResolutionResult['resolution']['body']['recoveries'] } {
  const live = candidates.filter(
    (candidate): candidate is Candidate & { state: EntryState } =>
      candidate.state?.entityType === 'entry',
  );
  const primary = live[0];
  const authoredTextCandidates = base
    ? live.filter(
        (candidate) =>
          candidate.state.title !== base.title || candidate.state.content !== base.content,
      )
    : live;
  // If any branch authored text, the primary must also be authored. Candidate
  // hash order is only a deterministic tie-breaker within that authored set;
  // it must never promote an unchanged merge-base branch over real edits.
  const textPrimary = authoredTextCandidates[0] ?? primary;
  const mood = scalarChoice('mood', base?.mood, live, (state) =>
    state.entityType === 'entry' ? state.mood : null,
  );
  const state: EntryState = normalizeDomainState({
    ...textPrimary.state,
    mood: mood.value,
    tagIds: mergeStableSet(
      base?.tagIds ?? null,
      live.map((candidate) => candidate.state.tagIds),
      (value) => value,
    ),
    assets: mergeStableSet(
      base?.assets ?? null,
      live.map((candidate) => candidate.state.assets),
      (value) => value.assetId,
    ),
  }) as EntryState;

  const recoveries: HashedVersion[] = [];
  const recoveredEntityIds: string[] = [];
  if (authoredTextCandidates.length >= 2) {
    // Preserve only genuinely authored alternatives. A branch that retained
    // the merge-base text is not a user-authored recovered copy.
    for (const candidate of authoredTextCandidates) {
      if (candidate.representativeHash === textPrimary.representativeHash) continue;
      if (
        candidate.state.title === textPrimary.state.title &&
        candidate.state.content === textPrimary.state.content
      ) {
        continue;
      }
      const recoveredId = deterministicId(
        'tackbok-recovered-entry-v1',
        entityId,
        ...[...heads].sort(),
        candidate.representativeHash,
      );
      recoveredEntityIds.push(recoveredId);
      recoveries.push(
        createSystemVersion({
          vaultId,
          entityType: 'entry',
          entityId: recoveredId,
          kind: 'recovery-init',
          parents: [],
          state: {
            ...candidate.state,
            assets: candidate.state.assets.map((asset) => recoveredAsset(recoveredId, asset)),
            conflictOriginId: entityId,
          },
          derivedTimestamp,
        }),
      );
    }
  }
  const recoveryRefs = recoveries.map((version) => ({
    entityType: version.body.entityType,
    entityId: version.body.entityId,
    versionHash: version.hash,
  }));
  const conflict =
    recoveries.length > 0 || mood.alternates.length > 0
      ? {
          conflictId: deterministicId(
            'tackbok-conflict-v1',
            entityId,
            ...[...heads].sort(),
          ),
          entityType: 'entry' as const,
          entityId,
          headHashes: [...heads].sort(),
          resolutionType: recoveries.length > 0 ? 'recovered-text' : 'scalar-alternate',
          alternates: mood.alternates,
          recoveredEntityIds,
        }
      : null;
  return { state, recoveries, recoveryRefs, conflict };
}

export function resolveHeads(
  graph: VersionGraph,
  headHashes: string[] = graph.heads(),
): ResolutionResult {
  const heads = Array.from(new Set(headHashes)).sort();
  if (heads.length < 2) throw new Error('Conflict resolution requires at least two heads');
  const candidates = groupCandidates(graph, heads);
  const first = graph.get(heads[0])!.body;
  const derivedTimestamp = latestDeterministicTimestamp(graph, heads);

  if (candidates.length === 1) {
    return {
      resolution: createSystemVersion({
        vaultId: first.vaultId,
        entityType: first.entityType,
        entityId: first.entityId,
        kind: 'join',
        parents: heads,
        state: candidates[0].state,
        deleted: candidates[0].deleted,
        derivedTimestamp,
      }),
      recoveries: [],
      conflict: null,
    };
  }

  const liveCandidates = candidates.filter((candidate) => !candidate.deleted);
  const deleteCandidates = candidates.filter((candidate) => candidate.deleted);
  if (deleteCandidates.length > 0 && liveCandidates.length > 0) {
    const deleteDominates = deleteCandidates.some((candidate) =>
      liveCandidates.every((live) =>
        live.headHashes.every((liveHead) =>
          candidate.headHashes.some((deleteHead) => graph.descendsFrom(deleteHead, liveHead)),
        ),
      ),
    );
    if (deleteDominates) {
      return {
        resolution: createSystemVersion({
          vaultId: first.vaultId,
          entityType: first.entityType,
          entityId: first.entityId,
          kind: 'resolution',
          parents: heads,
          state: null,
          deleted: true,
          derivedTimestamp,
        }),
        recoveries: [],
        conflict: null,
      };
    }
    candidates.splice(0, candidates.length, ...liveCandidates);
  }

  const bases = graph.maximalCommonAncestors(heads);
  const baseState =
    bases.length === 1 && !graph.get(bases[0])!.body.deleted
      ? graph.get(bases[0])!.body.state
      : null;
  const primary = candidates[0];

  if (first.entityType === 'entry') {
    const entryResult = resolveEntries(
      first.vaultId,
      first.entityId,
      heads,
      candidates,
      baseState?.entityType === 'entry' ? baseState : null,
      derivedTimestamp,
    );
    return {
      resolution: createSystemVersion({
        vaultId: first.vaultId,
        entityType: 'entry',
        entityId: first.entityId,
        kind: 'resolution',
        parents: heads,
        state: entryResult.state,
        recoveries: entryResult.recoveryRefs,
        derivedTimestamp,
      }),
      recoveries: entryResult.recoveries,
      conflict: entryResult.conflict,
    };
  }

  if (first.entityType === 'profile') {
    const live = candidates.filter(
      (candidate): candidate is Candidate & { state: ProfileState } =>
        candidate.state?.entityType === 'profile',
    );
    const base = baseState?.entityType === 'profile' ? baseState : undefined;
    const name = scalarChoice('displayName', base?.displayName, live, (state) =>
      state.entityType === 'profile' ? state.displayName : null,
    );
    const photo = scalarChoice('photo', base?.photo, live, (state) =>
      state.entityType === 'profile' ? state.photo : null,
    );
    const state: ProfileState = {
      entityType: 'profile',
      displayName: name.value,
      photo: photo.value,
    };
    const alternates = [...name.alternates, ...photo.alternates];
    return {
      resolution: createSystemVersion({
        vaultId: first.vaultId,
        entityType: 'profile',
        entityId: first.entityId,
        kind: 'resolution',
        parents: heads,
        state,
        derivedTimestamp,
      }),
      recoveries: [],
      conflict:
        alternates.length > 0
          ? {
              conflictId: deterministicId(
                'tackbok-conflict-v1',
                first.entityId,
                ...heads,
              ),
              entityType: 'profile',
              entityId: first.entityId,
              headHashes: heads,
              resolutionType: 'scalar-alternate',
              alternates,
              recoveredEntityIds: [],
            }
          : null,
    };
  }

  const renameCandidates = candidates.filter(
    (candidate) =>
      candidate.state?.entityType === first.entityType &&
      (first.entityType === 'tag' || first.entityType === 'prompt'),
  );
  const baseTitle =
    baseState?.entityType === 'tag' || baseState?.entityType === 'prompt'
      ? baseState.title
      : null;
  const authoredRenames = baseTitle === null
    ? renameCandidates
    : renameCandidates.filter(
        (candidate) =>
          (candidate.state?.entityType === 'tag' ||
            candidate.state?.entityType === 'prompt') &&
          candidate.state.title !== baseTitle,
      );
  const renamePrimary = authoredRenames[0] ?? renameCandidates[0] ?? primary;
  const recoveries: HashedVersion[] = [];
  for (const candidate of authoredRenames) {
    if (candidate.representativeHash === renamePrimary.representativeHash) continue;
    if (
      candidate.state?.entityType !== 'tag' &&
      candidate.state?.entityType !== 'prompt'
    ) {
      continue;
    }
    if (
      (renamePrimary.state?.entityType === 'tag' ||
        renamePrimary.state?.entityType === 'prompt') &&
      candidate.state.title === renamePrimary.state.title
    ) {
      continue;
    }
    const recoveredId = deterministicId(
      `tackbok-recovered-${first.entityType}-v1`,
      first.entityId,
      ...heads,
      candidate.representativeHash,
    );
    recoveries.push(
      createSystemVersion({
        vaultId: first.vaultId,
        entityType: first.entityType,
        entityId: recoveredId,
        kind: 'recovery-init',
        parents: [],
        state: { ...candidate.state, conflictOriginId: first.entityId },
        derivedTimestamp,
      }),
    );
  }
  return {
    resolution: createSystemVersion({
      vaultId: first.vaultId,
      entityType: first.entityType,
      entityId: first.entityId,
      kind: 'resolution',
      parents: heads,
      state: renamePrimary.state,
      recoveries: recoveries.map((version) => ({
        entityType: version.body.entityType,
        entityId: version.body.entityId,
        versionHash: version.hash,
      })),
      derivedTimestamp,
    }),
    recoveries,
    conflict:
      recoveries.length > 0
        ? {
            conflictId: deterministicId('tackbok-conflict-v1', first.entityId, ...heads),
            entityType: first.entityType,
            entityId: first.entityId,
            headHashes: heads,
            resolutionType: 'recovered-rename',
            alternates: [],
            recoveredEntityIds: recoveries.map((version) => version.body.entityId),
          }
        : null,
  };
}
