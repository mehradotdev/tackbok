import { canonicalHashV2, canonicalizeV2 } from './canonical';
import { SnapshotV2ValidationError } from './caps';
import { sha256TextV2 } from './sha256';
import type {
  ConflictFieldV2,
  EntityTypeV2,
  SnapshotConflictV2,
  SnapshotDomainV2,
  SnapshotEntryTagV2,
  SnapshotEntryV2,
  SnapshotMediaV2,
  SnapshotProfileV2,
  SnapshotPromptV2,
  SnapshotTagV2,
  SnapshotTombstoneV2,
} from './types';
import { calculateMediaReferencesV2 } from './validation';

type MergeEntity = SnapshotEntryV2 | SnapshotTagV2 | SnapshotPromptV2;
type EntityCollection = 'entries' | 'tags' | 'prompts';

export class SnapshotV2MergeError extends SnapshotV2ValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'SnapshotV2MergeError';
  }
}

const equal = (left: unknown, right: unknown) =>
  canonicalizeV2(left) === canonicalizeV2(right);

function keyComparator<T>(key: (value: T) => string) {
  return (left: T, right: T) => {
    const a = key(left), b = key(right);
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

function mapBy<T>(values: T[], key: (value: T) => string): Map<string, T> {
  return new Map(values.map((value) => [key(value), value]));
}

function conflictId(
  entityType: EntityTypeV2,
  entityId: string,
  field: ConflictFieldV2,
  baseValueHash: string | null,
  candidateHashes: (string | null)[],
): string {
  const candidates = [...new Set(candidateHashes.filter((value): value is string => value !== null))].sort();
  return sha256TextV2(canonicalizeV2([entityType, entityId, field, baseValueHash, candidates]));
}

function makeConflict(
  entityType: EntityTypeV2,
  entityId: string,
  field: ConflictFieldV2,
  baseValue: unknown,
  localValue: unknown,
  remoteValue: unknown,
  primaryValue: unknown,
  alternateValue: string | null | undefined,
  recoveredEntityIds: string[] = [],
  baseMissing = false,
): SnapshotConflictV2 {
  const baseValueHash = baseMissing ? null : canonicalHashV2(baseValue);
  const localValueHash = canonicalHashV2(localValue);
  const remoteValueHash = canonicalHashV2(remoteValue);
  const primaryValueHash = canonicalHashV2(primaryValue);
  const alternateHash = primaryValueHash === localValueHash ? remoteValueHash : localValueHash;
  return {
    conflictId: conflictId(entityType, entityId, field, baseValueHash, [localValueHash, remoteValueHash]),
    entityType,
    entityId,
    field,
    baseValueHash,
    localValueHash,
    remoteValueHash,
    primaryValueHash,
    alternates: alternateValue === undefined ? [] : [{ valueHash: alternateHash, value: alternateValue }],
    recoveredEntityIds: [...recoveredEntityIds].sort(),
  };
}

function scalarMerge<T>(
  base: T | undefined,
  local: T,
  remote: T,
): { value: T; conflicted: boolean; primary: 'local' | 'remote' } {
  if (equal(local, remote)) return { value: local, conflicted: false, primary: 'local' };
  if (base !== undefined) {
    if (equal(local, base)) return { value: remote, conflicted: false, primary: 'remote' };
    if (equal(remote, base)) return { value: local, conflicted: false, primary: 'local' };
  }
  const localHash = canonicalHashV2(local);
  const remoteHash = canonicalHashV2(remote);
  return localHash <= remoteHash
    ? { value: local, conflicted: true, primary: 'local' }
    : { value: remote, conflicted: true, primary: 'remote' };
}

function assertImmutable(name: string, base: unknown, local: unknown, remote: unknown): void {
  if (!equal(local, remote) || (base !== undefined && !equal(base, local))) {
    throw new SnapshotV2MergeError('invalid-immutable-mutation', `${name} changed under a stable ID`);
  }
}

function mergeEntry(
  base: SnapshotEntryV2 | undefined,
  local: SnapshotEntryV2,
  remote: SnapshotEntryV2,
  conflicts: SnapshotConflictV2[],
): SnapshotEntryV2[] {
  assertImmutable('entry.createdAt', base?.createdAt, local.createdAt, remote.createdAt);
  assertImmutable('entry.conflictOriginId', base?.conflictOriginId, local.conflictOriginId, remote.conflictOriginId);
  const title = scalarMerge(base?.title, local.title, remote.title);
  const content = scalarMerge(base?.content, local.content, remote.content);
  const mood = scalarMerge(base?.mood, local.mood, remote.mood);
  const updatedAt = Math.max(base?.updatedAt ?? 0, local.updatedAt, remote.updatedAt);
  const textConflict = title.conflicted || content.conflicted;
  let primaryTextBranch: 'local' | 'remote' | null = null;
  let recoveredId: string | null = null;
  if (textConflict) {
    const localPairHash = canonicalHashV2([local.title, local.content]);
    const remotePairHash = canonicalHashV2([remote.title, remote.content]);
    primaryTextBranch = localPairHash <= remotePairHash ? 'local' : 'remote';
    const baseStateHash = base ? canonicalHashV2(base) : null;
    const branchHashes = [canonicalHashV2(local), canonicalHashV2(remote)].sort();
    recoveredId = `recovered-${sha256TextV2(canonicalizeV2([
      local.entryId, baseStateHash, branchHashes[0], branchHashes[1],
    ])).slice(0, 32)}`;
  }
  const primaryBranch = primaryTextBranch === 'remote' ? remote : local;
  const losingBranch = primaryTextBranch === 'remote' ? local : remote;
  const primary: SnapshotEntryV2 = {
    entryId: local.entryId,
    title: title.conflicted ? primaryBranch.title : title.value,
    content: content.conflicted ? primaryBranch.content : content.value,
    mood: mood.value,
    createdAt: local.createdAt,
    updatedAt,
    conflictOriginId: local.conflictOriginId,
  };
  if (title.conflicted) {
    conflicts.push(makeConflict('entry', local.entryId, 'title', base?.title,
      local.title, remote.title, primary.title, undefined, [recoveredId!], base === undefined));
  }
  if (content.conflicted) {
    conflicts.push(makeConflict('entry', local.entryId, 'content', base?.content,
      local.content, remote.content, primary.content, undefined, [recoveredId!], base === undefined));
  }
  if (mood.conflicted) {
    conflicts.push(makeConflict('entry', local.entryId, 'mood', base?.mood,
      local.mood, remote.mood, mood.value, mood.primary === 'local' ? remote.mood : local.mood, [], base === undefined));
  }
  if (!textConflict) return [primary];
  return [primary, {
    entryId: recoveredId!,
    title: title.conflicted ? losingBranch.title : title.value,
    content: content.conflicted ? losingBranch.content : content.value,
    mood: mood.value,
    createdAt: local.createdAt,
    updatedAt,
    conflictOriginId: local.entryId,
  }];
}

function mergeNamedEntity<T extends SnapshotTagV2 | SnapshotPromptV2>(
  type: 'tag' | 'prompt',
  base: T | undefined,
  local: T,
  remote: T,
  conflicts: SnapshotConflictV2[],
): T {
  const idKey = type === 'tag' ? 'tagId' : 'promptId';
  const entityId = local[idKey as keyof T] as string;
  assertImmutable(`${type}.createdAt`, base?.createdAt, local.createdAt, remote.createdAt);
  assertImmutable(`${type}.conflictOriginId`, base?.conflictOriginId, local.conflictOriginId, remote.conflictOriginId);
  const title = scalarMerge(base?.title, local.title, remote.title);
  if (title.conflicted) {
    conflicts.push(makeConflict(type, entityId, 'title', base?.title, local.title, remote.title,
      title.value, title.primary === 'local' ? remote.title : local.title, [], base === undefined));
  }
  return {
    ...local,
    title: title.value,
    updatedAt: Math.max(base?.updatedAt ?? 0, local.updatedAt, remote.updatedAt),
  };
}

function tombstoneMap(domain: SnapshotDomainV2 | null): Map<string, SnapshotTombstoneV2> {
  return mapBy(domain?.tombstones ?? [], (value) => `${value.entityType}\0${value.entityId}`);
}

function chooseTombstone(
  local: SnapshotTombstoneV2,
  remote: SnapshotTombstoneV2,
  conflicts: SnapshotConflictV2[],
): SnapshotTombstoneV2 {
  if (equal(local, remote)) return local;
  const compatible = (local.baseStateHash === remote.baseStateHash || local.baseStateHash === null || remote.baseStateHash === null) &&
    (local.deletedStateHash === remote.deletedStateHash || local.deletedStateHash === null || remote.deletedStateHash === null);
  if (compatible) {
    const preferred = local.deletionSequence > remote.deletionSequence ? local :
      remote.deletionSequence > local.deletionSequence ? remote :
      canonicalizeV2(local) <= canonicalizeV2(remote) ? local : remote;
    return {
      ...preferred,
      baseStateHash: local.baseStateHash ?? remote.baseStateHash,
      deletedStateHash: local.deletedStateHash ?? remote.deletedStateHash,
      deletionSequence: Math.max(local.deletionSequence, remote.deletionSequence),
    };
  }
  const localHash = canonicalHashV2(local), remoteHash = canonicalHashV2(remote);
  const primary = localHash <= remoteHash ? local : remote;
  conflicts.push(makeConflict(local.entityType, local.entityId, 'deleteEdit', null,
    local, remote, primary, null, [], true));
  return primary;
}

interface CollectionMergeResult<T> {
  live: T[];
  tombstones: SnapshotTombstoneV2[];
  recoveries: Map<string, string[]>;
}

function mergeEntityCollection<T extends MergeEntity>(
  collection: EntityCollection,
  type: Exclude<EntityTypeV2, 'profile'>,
  baseDomain: SnapshotDomainV2 | null,
  localDomain: SnapshotDomainV2,
  remoteDomain: SnapshotDomainV2,
  conflicts: SnapshotConflictV2[],
): CollectionMergeResult<T> {
  const idKey = type === 'entry' ? 'entryId' : type === 'tag' ? 'tagId' : 'promptId';
  const getId = (value: T) => value[idKey as keyof T] as string;
  const base = mapBy((baseDomain?.[collection] ?? []) as T[], getId);
  const local = mapBy(localDomain[collection] as T[], getId);
  const remote = mapBy(remoteDomain[collection] as T[], getId);
  const baseTombs = tombstoneMap(baseDomain);
  const localTombs = tombstoneMap(localDomain);
  const remoteTombs = tombstoneMap(remoteDomain);
  const ids = [...new Set([...base.keys(), ...local.keys(), ...remote.keys(),
    ...[...localTombs.values()].filter((v) => v.entityType === type).map((v) => v.entityId),
    ...[...remoteTombs.values()].filter((v) => v.entityType === type).map((v) => v.entityId)])].sort();
  const live: T[] = [];
  const tombstones: SnapshotTombstoneV2[] = [];
  const recoveries = new Map<string, string[]>();
  for (const entityId of ids) {
    const key = `${type}\0${entityId}`;
    const b = base.get(entityId), l = local.get(entityId), r = remote.get(entityId);
    const lt = localTombs.get(key), rt = remoteTombs.get(key);
    if (l && r) {
      if (type === 'entry') {
        const merged = mergeEntry(b as SnapshotEntryV2 | undefined, l as SnapshotEntryV2, r as SnapshotEntryV2, conflicts);
        live.push(...merged as T[]);
        if (merged.length > 1) recoveries.set(entityId, merged.slice(1).map((entry) => entry.entryId));
      } else {
        live.push(mergeNamedEntity(type, b as SnapshotTagV2 | SnapshotPromptV2 | undefined,
          l as SnapshotTagV2 | SnapshotPromptV2, r as SnapshotTagV2 | SnapshotPromptV2, conflicts) as T);
      }
      continue;
    }
    if (lt && rt) {
      tombstones.push(chooseTombstone(lt, rt, conflicts));
      continue;
    }
    const liveValue = l ?? r;
    const deleteValue = lt ?? rt;
    if (liveValue && deleteValue) {
      const liveChanged = !b || !equal(liveValue, b);
      if (!liveChanged && b) {
        tombstones.push(deleteValue);
      } else {
        live.push(liveValue);
        conflicts.push(makeConflict(type, entityId, 'deleteEdit', b ?? null,
          l ?? lt ?? null, r ?? rt ?? null, liveValue, null, [], !b));
      }
      continue;
    }
    if (liveValue) {
      live.push(liveValue);
      continue;
    }
    if (deleteValue) {
      tombstones.push(deleteValue);
      continue;
    }
    const inheritedTomb = baseTombs.get(key);
    if (inheritedTomb) tombstones.push(inheritedTomb);
  }
  const uniqueLive = new Map<string, T>();
  for (const record of live) {
    const recordId = getId(record);
    const existing = uniqueLive.get(recordId);
    if (existing && !equal(existing, record)) {
      throw new SnapshotV2MergeError('derived-id-collision', `Derived entity ID ${recordId} collides`);
    }
    uniqueLive.set(recordId, record);
  }
  const normalizedLive = [...uniqueLive.values()].sort(keyComparator(getId));
  return { live: normalizedLive, tombstones, recoveries };
}

function mergeRelationSet(
  base: SnapshotEntryTagV2[], local: SnapshotEntryTagV2[], remote: SnapshotEntryTagV2[],
): SnapshotEntryTagV2[] {
  const key = (value: SnapshotEntryTagV2) => `${value.entryId}\0${value.tagId}`;
  const b = mapBy(base, key), l = mapBy(local, key), r = mapBy(remote, key);
  const result: SnapshotEntryTagV2[] = [];
  for (const id of [...new Set([...b.keys(), ...l.keys(), ...r.keys()])].sort()) {
    const bv = b.get(id), lv = l.get(id), rv = r.get(id);
    const present = lv && rv ? true : !lv && !rv ? false :
      Boolean(lv) === Boolean(bv) ? Boolean(rv) :
      Boolean(rv) === Boolean(bv) ? Boolean(lv) : Boolean(lv || rv);
    if (present) {
      const candidates = [lv, rv, bv].filter((value): value is SnapshotEntryTagV2 => Boolean(value));
      result.push({ ...candidates[0], createdAt: Math.min(...candidates.map((value) => value.createdAt)) });
    }
  }
  return result.sort(keyComparator(key));
}

function mergeProfile(
  base: SnapshotProfileV2 | undefined,
  local: SnapshotProfileV2,
  remote: SnapshotProfileV2,
  conflicts: SnapshotConflictV2[],
): SnapshotProfileV2 {
  const displayName = scalarMerge(base?.displayName, local.displayName, remote.displayName);
  const photo = scalarMerge(base?.photoAssetId, local.photoAssetId, remote.photoAssetId);
  if (displayName.conflicted) conflicts.push(makeConflict('profile', 'profile', 'displayName', base?.displayName,
    local.displayName, remote.displayName, displayName.value,
    displayName.primary === 'local' ? remote.displayName : local.displayName, [], !base));
  if (photo.conflicted) conflicts.push(makeConflict('profile', 'profile', 'photoAssetId', base?.photoAssetId,
    local.photoAssetId, remote.photoAssetId, photo.value,
    photo.primary === 'local' ? remote.photoAssetId : local.photoAssetId, [], !base));
  return { profileId: 'profile', displayName: displayName.value, photoAssetId: photo.value,
    updatedAt: Math.max(base?.updatedAt ?? 0, local.updatedAt, remote.updatedAt) };
}

const MEDIA_IMMUTABLE = ['assetId', 'ownerType', 'ownerId', 'kind', 'blobHash', 'byteSize', 'createdAt'] as const;
const MEDIA_OBSERVED = ['mimeType', 'width', 'height', 'durationMs'] as const;

function mergeMedia(
  baseDomain: SnapshotDomainV2 | null,
  localDomain: SnapshotDomainV2,
  remoteDomain: SnapshotDomainV2,
  conflicts: SnapshotConflictV2[],
): SnapshotMediaV2[] {
  const base = mapBy(baseDomain?.media ?? [], (value) => value.assetId);
  const local = mapBy(localDomain.media, (value) => value.assetId);
  const remote = mapBy(remoteDomain.media, (value) => value.assetId);
  const result: SnapshotMediaV2[] = [];
  for (const assetId of [...new Set([...base.keys(), ...local.keys(), ...remote.keys()])].sort()) {
    const b = base.get(assetId), l = local.get(assetId), r = remote.get(assetId);
    if (l && r) {
      if (!b && !equal(l, r)) {
        throw new SnapshotV2MergeError('asset-id-collision', `New asset ID ${assetId} has different descriptors`);
      }
      for (const field of MEDIA_IMMUTABLE) assertImmutable(`media.${field}`, b?.[field], l[field], r[field]);
      const merged = { ...l };
      let observedConflict = false;
      for (const field of MEDIA_OBSERVED) {
        const value = scalarMerge(b?.[field], l[field], r[field]);
        merged[field] = value.value as never;
        observedConflict ||= value.conflicted;
      }
      merged.updatedAt = Math.max(b?.updatedAt ?? 0, l.updatedAt, r.updatedAt);
      result.push(merged);
      if (observedConflict) {
        conflicts.push(makeConflict(merged.ownerType === 'entry' ? 'entry' : 'profile', merged.ownerId,
          'assetReference', b ?? null, l, r, merged, null, [], !b));
      }
      continue;
    }
    const live = l ?? r;
    if (!live) continue;
    if (!b) { result.push(live); continue; }
    const unchanged = equal(live, b);
    if (unchanged) continue;
    for (const field of MEDIA_IMMUTABLE) {
      if (!equal(live[field], b[field])) throw new SnapshotV2MergeError('invalid-immutable-mutation', `media.${field} changed`);
    }
    result.push(live);
    conflicts.push(makeConflict(live.ownerType === 'entry' ? 'entry' : 'profile', live.ownerId,
      'assetReference', b, l ?? null, r ?? null, live, null));
  }
  return result.sort(keyComparator((value) => value.assetId));
}

function mergeConflictSet(
  base: SnapshotConflictV2[], local: SnapshotConflictV2[], remote: SnapshotConflictV2[],
): SnapshotConflictV2[] {
  const key = (value: SnapshotConflictV2) => value.conflictId;
  const b = mapBy(base, key), l = mapBy(local, key), r = mapBy(remote, key);
  const result: SnapshotConflictV2[] = [];
  for (const id of [...new Set([...b.keys(), ...l.keys(), ...r.keys()])].sort()) {
    const bv = b.get(id), lv = l.get(id), rv = r.get(id);
    if (lv && rv) {
      if (!equal(lv, rv)) throw new SnapshotV2MergeError('conflict-id-collision', `Conflict ${id} differs`);
      result.push(lv);
    } else if (lv && !bv) result.push(lv);
    else if (rv && !bv) result.push(rv);
    else if (lv && bv && !rv) {
      // Remote resolution removes only when local did not alter the record.
      if (!equal(lv, bv)) result.push(lv);
    } else if (rv && bv && !lv) {
      if (!equal(rv, bv)) result.push(rv);
    }
  }
  return result;
}

export function mergeSnapshotDomainsV2(
  base: SnapshotDomainV2 | null,
  local: SnapshotDomainV2,
  remote: SnapshotDomainV2,
): SnapshotDomainV2 {
  const newConflicts: SnapshotConflictV2[] = [];
  const entries = mergeEntityCollection<SnapshotEntryV2>('entries', 'entry', base, local, remote, newConflicts);
  const tags = mergeEntityCollection<SnapshotTagV2>('tags', 'tag', base, local, remote, newConflicts);
  const prompts = mergeEntityCollection<SnapshotPromptV2>('prompts', 'prompt', base, local, remote, newConflicts);
  const profile = mergeProfile(base?.profile, local.profile, remote.profile, newConflicts);
  let entryTags = mergeRelationSet(base?.entryTags ?? [], local.entryTags, remote.entryTags);

  // A recovery is a complete authored entry and inherits the primary's merged tags.
  for (const [primaryId, recoveredIds] of entries.recoveries) {
    const relations = entryTags.filter((value) => value.entryId === primaryId);
    for (const recoveredId of recoveredIds) {
      entryTags.push(...relations.map((value) => ({ ...value, entryId: recoveredId })));
    }
  }
  const uniqueRelations = new Map<string, SnapshotEntryTagV2>();
  for (const relation of entryTags) {
    const relationKey = `${relation.entryId}\0${relation.tagId}`;
    const existing = uniqueRelations.get(relationKey);
    uniqueRelations.set(relationKey, existing
      ? { ...existing, createdAt: Math.min(existing.createdAt, relation.createdAt) }
      : relation);
  }
  entryTags = [...uniqueRelations.values()];

  // A new relation on the branch opposing a tag deletion defeats that deletion.
  const baseRelations = mapBy(base?.entryTags ?? [], (v) => `${v.entryId}\0${v.tagId}`);
  const localTagTombs = tombstoneMap(local);
  const remoteTagTombs = tombstoneMap(remote);
  for (const relation of entryTags) {
    const relationKey = `${relation.entryId}\0${relation.tagId}`;
    const localTomb = localTagTombs.get(`tag\0${relation.tagId}`);
    const remoteTomb = remoteTagTombs.get(`tag\0${relation.tagId}`);
    const addedOppositeDelete = !baseRelations.has(relationKey) &&
      ((localTomb && remote.entryTags.some((v) => `${v.entryId}\0${v.tagId}` === relationKey)) ||
       (remoteTomb && local.entryTags.some((v) => `${v.entryId}\0${v.tagId}` === relationKey)));
    if (!addedOppositeDelete) continue;
    const tomb = localTomb ?? remoteTomb!;
    let liveTag = local.tags.find((value) => value.tagId === relation.tagId) ??
      remote.tags.find((value) => value.tagId === relation.tagId) ??
      base?.tags.find((value) => value.tagId === relation.tagId);
    if (!liveTag) throw new SnapshotV2MergeError('missing-referenced-tag', 'Referenced deleted tag has no recoverable value');
    if (!tags.live.some((value) => value.tagId === relation.tagId)) tags.live.push(liveTag);
    const index = tags.tombstones.findIndex((value) => value.entityId === relation.tagId);
    if (index >= 0) tags.tombstones.splice(index, 1);
    const localCandidate = localTomb ? tomb : relation;
    const remoteCandidate = remoteTomb ? tomb : relation;
    newConflicts.push(makeConflict('tag', relation.tagId, 'referencedDelete', null,
      localCandidate, remoteCandidate, relation, null));
  }
  entryTags = entryTags.filter((value) =>
    entries.live.some((entry) => entry.entryId === value.entryId) &&
    tags.live.some((tag) => tag.tagId === value.tagId));
  entryTags.sort(keyComparator((value) => `${value.entryId}\0${value.tagId}`));
  tags.live.sort(keyComparator((value) => value.tagId));

  let media = mergeMedia(base, local, remote, newConflicts);
  const carriedConflicts = mergeConflictSet(base?.conflicts ?? [], local.conflicts, remote.conflicts);
  const conflictMap = new Map<string, SnapshotConflictV2>();
  for (const conflict of [...carriedConflicts, ...newConflicts]) {
    const existing = conflictMap.get(conflict.conflictId);
    if (!existing || canonicalizeV2(conflict) < canonicalizeV2(existing)) {
      conflictMap.set(conflict.conflictId, conflict);
    }
  }
  const liveRecoveryOrigins = new Map<string, string | null>();
  for (const entry of entries.live) liveRecoveryOrigins.set(`entry\0${entry.entryId}`, entry.conflictOriginId);
  for (const tag of tags.live) liveRecoveryOrigins.set(`tag\0${tag.tagId}`, tag.conflictOriginId);
  for (const prompt of prompts.live) liveRecoveryOrigins.set(`prompt\0${prompt.promptId}`, prompt.conflictOriginId);
  const conflicts = [...conflictMap.values()].map((conflict) => ({
    ...conflict,
    recoveredEntityIds: conflict.recoveredEntityIds.filter((recoveredId) =>
      liveRecoveryOrigins.get(`${conflict.entityType}\0${recoveredId}`) === conflict.entityId),
  })).sort(keyComparator((value) => value.conflictId));
  const tombstones = [...entries.tombstones, ...tags.tombstones, ...prompts.tombstones]
    .sort(keyComparator((value) => `${value.entityType}\0${value.entityId}`));
  const result: SnapshotDomainV2 = {
    entries: entries.live,
    tags: tags.live,
    entryTags,
    prompts: prompts.live,
    profile,
    media,
    tombstones,
    conflicts,
  };
  const referenced = calculateMediaReferencesV2(result);
  const liveEntryIds = new Set(result.entries.map((entry) => entry.entryId));
  media = media.filter((asset) =>
    (asset.ownerType === 'entry' && liveEntryIds.has(asset.ownerId)) ||
    (asset.ownerType === 'profile' && referenced.has(asset.assetId)));
  result.conflicts = result.conflicts.filter((conflict) =>
    conflict.field !== 'assetReference' ||
    conflict.entityType !== 'entry' ||
    liveEntryIds.has(conflict.entityId));
  result.media = media;
  return result;
}
