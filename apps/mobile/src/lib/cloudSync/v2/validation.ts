import { SNAPSHOT_V2_CAPS, invalid } from './caps';
import { canonicalHashV2 } from './canonical';
import type {
  JournalSnapshotPayloadV2,
  SnapshotDomainV2,
} from './types';

type RecordValue = Record<string, unknown>;
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[\x20-\x7e]+$/;
const MOODS = new Set(['AMAZING', 'HAPPY', 'OKAY', 'SAD', 'AWFUL']);
const ENTITY_TYPES = new Set(['entry', 'tag', 'prompt', 'profile']);
const CONFLICT_FIELDS = new Set([
  'title', 'content', 'mood', 'displayName', 'photoAssetId', 'tagMembership',
  'assetReference', 'deleteEdit', 'referencedDelete',
]);
const utf8Length = (value: string) => new TextEncoder().encode(value).length;

function object(value: unknown, keys: readonly string[], path: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid('invalid-shape', `${path} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid('closed-shape', `${path} has missing or unknown keys`);
  }
  return value as RecordValue;
}

function array(value: unknown, cap: number, path: string): unknown[] {
  if (!Array.isArray(value)) invalid('invalid-shape', `${path} must be an array`);
  if (value.length > cap) invalid('collection-cap', `${path} exceeds its item cap`);
  return value;
}

function string(value: unknown, path: string, maxBytes?: number): string {
  if (typeof value !== 'string') invalid('invalid-shape', `${path} must be a string`);
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        invalid('invalid-unicode', `${path} contains an unpaired surrogate`);
      }
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      invalid('invalid-unicode', `${path} contains an unpaired surrogate`);
    }
  }
  if (maxBytes !== undefined && utf8Length(value) > maxBytes) {
    invalid('string-cap', `${path} exceeds its UTF-8 byte cap`);
  }
  return value;
}

function nullableString(value: unknown, path: string, maxBytes?: number): string | null {
  return value === null ? null : string(value, path, maxBytes);
}

function id(value: unknown, path: string): string {
  const result = string(value, path, SNAPSHOT_V2_CAPS.idBytes);
  if (!ID.test(result)) invalid('invalid-id', `${path} must be non-empty printable ASCII`);
  return result;
}

function hash(value: unknown, path: string): string {
  const result = string(value, path);
  if (!HASH.test(result)) invalid('invalid-hash', `${path} must be lowercase SHA-256`);
  return result;
}

function nullableHash(value: unknown, path: string): string | null {
  return value === null ? null : hash(value, path);
}

function integer(value: unknown, path: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 ||
      Object.is(value, -0) || value > max) {
    invalid('invalid-number', `${path} must be a non-negative safe integer <= ${max}`);
  }
  return value;
}

function nullableInteger(value: unknown, path: string, max: number): number | null {
  return value === null ? null : integer(value, path, max);
}

function timestamp(value: unknown, path: string): number {
  return integer(value, path, SNAPSHOT_V2_CAPS.timestamp);
}

function literal<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) invalid('invalid-literal', `${path} must be ${expected}`);
  return expected;
}

function enumValue(value: unknown, allowed: Set<string>, path: string): string {
  const result = string(value, path);
  if (!allowed.has(result)) invalid('invalid-enum', `${path} has an unsupported value`);
  return result;
}

function nullableEnum(value: unknown, allowed: Set<string>, path: string): string | null {
  return value === null ? null : enumValue(value, allowed, path);
}

/** Shape/scalar validation deliberately runs before canonical-byte and hash checks. */
export function validateSnapshotV2Shape(value: unknown): JournalSnapshotPayloadV2 {
  const root = object(value, [
    'format', 'formatVersion', 'vaultId', 'parentSnapshotIds', 'observedDeviceHeads',
    'authorDeviceId', 'deviceSequence', 'createdAt', 'entries', 'tags', 'entryTags',
    'prompts', 'profile', 'media', 'tombstones', 'conflicts',
  ], '$');
  literal(root.format, 'tackbok-snapshot', '$.format');
  literal(root.formatVersion, 2, '$.formatVersion');
  id(root.vaultId, '$.vaultId');
  id(root.authorDeviceId, '$.authorDeviceId');
  integer(root.deviceSequence, '$.deviceSequence');
  timestamp(root.createdAt, '$.createdAt');

  array(root.parentSnapshotIds, SNAPSHOT_V2_CAPS.parentSnapshotIds, '$.parentSnapshotIds')
    .forEach((item, index) => hash(item, `$.parentSnapshotIds[${index}]`));
  array(root.observedDeviceHeads, SNAPSHOT_V2_CAPS.observedDeviceHeads, '$.observedDeviceHeads')
    .forEach((item, index) => {
      const path = `$.observedDeviceHeads[${index}]`;
      const head = object(item, ['deviceId', 'deviceSequence', 'snapshotId'], path);
      id(head.deviceId, `${path}.deviceId`);
      integer(head.deviceSequence, `${path}.deviceSequence`);
      hash(head.snapshotId, `${path}.snapshotId`);
    });
  array(root.entries, SNAPSHOT_V2_CAPS.entries, '$.entries').forEach((item, index) => {
    const path = `$.entries[${index}]`;
    const entry = object(item, ['entryId', 'title', 'content', 'mood', 'createdAt', 'updatedAt', 'conflictOriginId'], path);
    id(entry.entryId, `${path}.entryId`);
    nullableString(entry.title, `${path}.title`, SNAPSHOT_V2_CAPS.entryTitleBytes);
    nullableString(entry.content, `${path}.content`, SNAPSHOT_V2_CAPS.entryBodyBytes);
    nullableEnum(entry.mood, MOODS, `${path}.mood`);
    timestamp(entry.createdAt, `${path}.createdAt`);
    timestamp(entry.updatedAt, `${path}.updatedAt`);
    if (entry.conflictOriginId !== null) id(entry.conflictOriginId, `${path}.conflictOriginId`);
  });
  array(root.tags, SNAPSHOT_V2_CAPS.tags, '$.tags').forEach((item, index) => {
    const path = `$.tags[${index}]`;
    const tag = object(item, ['tagId', 'title', 'createdAt', 'updatedAt', 'conflictOriginId'], path);
    id(tag.tagId, `${path}.tagId`);
    string(tag.title, `${path}.title`, SNAPSHOT_V2_CAPS.shortTitleBytes);
    timestamp(tag.createdAt, `${path}.createdAt`);
    timestamp(tag.updatedAt, `${path}.updatedAt`);
    if (tag.conflictOriginId !== null) id(tag.conflictOriginId, `${path}.conflictOriginId`);
  });
  array(root.entryTags, SNAPSHOT_V2_CAPS.entryTags, '$.entryTags').forEach((item, index) => {
    const path = `$.entryTags[${index}]`;
    const relation = object(item, ['entryId', 'tagId', 'createdAt'], path);
    id(relation.entryId, `${path}.entryId`);
    id(relation.tagId, `${path}.tagId`);
    timestamp(relation.createdAt, `${path}.createdAt`);
  });
  array(root.prompts, SNAPSHOT_V2_CAPS.prompts, '$.prompts').forEach((item, index) => {
    const path = `$.prompts[${index}]`;
    const prompt = object(item, ['promptId', 'title', 'createdAt', 'updatedAt', 'conflictOriginId'], path);
    id(prompt.promptId, `${path}.promptId`);
    string(prompt.title, `${path}.title`, SNAPSHOT_V2_CAPS.shortTitleBytes);
    timestamp(prompt.createdAt, `${path}.createdAt`);
    timestamp(prompt.updatedAt, `${path}.updatedAt`);
    if (prompt.conflictOriginId !== null) id(prompt.conflictOriginId, `${path}.conflictOriginId`);
  });
  const profile = object(root.profile, ['profileId', 'displayName', 'photoAssetId', 'updatedAt'], '$.profile');
  literal(profile.profileId, 'profile', '$.profile.profileId');
  nullableString(profile.displayName, '$.profile.displayName', SNAPSHOT_V2_CAPS.profileNameBytes);
  if (profile.photoAssetId !== null) id(profile.photoAssetId, '$.profile.photoAssetId');
  timestamp(profile.updatedAt, '$.profile.updatedAt');

  array(root.media, SNAPSHOT_V2_CAPS.media, '$.media').forEach((item, index) => {
    const path = `$.media[${index}]`;
    const media = object(item, [
      'assetId', 'ownerType', 'ownerId', 'kind', 'blobHash', 'mimeType', 'byteSize',
      'width', 'height', 'durationMs', 'createdAt', 'updatedAt',
    ], path);
    id(media.assetId, `${path}.assetId`);
    enumValue(media.ownerType, new Set(['entry', 'profile']), `${path}.ownerType`);
    id(media.ownerId, `${path}.ownerId`);
    enumValue(media.kind, new Set(['photo', 'voice', 'profile-photo']), `${path}.kind`);
    hash(media.blobHash, `${path}.blobHash`);
    if (media.mimeType !== null) {
      const mime = string(media.mimeType, `${path}.mimeType`, SNAPSHOT_V2_CAPS.mimeTypeBytes);
      if (!ID.test(mime)) invalid('invalid-mime', `${path}.mimeType must be non-empty printable ASCII`);
    }
    integer(media.byteSize, `${path}.byteSize`, SNAPSHOT_V2_CAPS.mediaByteSize);
    nullableInteger(media.width, `${path}.width`, SNAPSHOT_V2_CAPS.imageDimension);
    nullableInteger(media.height, `${path}.height`, SNAPSHOT_V2_CAPS.imageDimension);
    nullableInteger(media.durationMs, `${path}.durationMs`, SNAPSHOT_V2_CAPS.audioDurationMs);
    timestamp(media.createdAt, `${path}.createdAt`);
    timestamp(media.updatedAt, `${path}.updatedAt`);
  });
  array(root.tombstones, SNAPSHOT_V2_CAPS.tombstones, '$.tombstones').forEach((item, index) => {
    const path = `$.tombstones[${index}]`;
    const tomb = object(item, ['entityType', 'entityId', 'baseStateHash', 'deletedStateHash', 'deletedByDeviceId', 'deletionSequence'], path);
    enumValue(tomb.entityType, ENTITY_TYPES, `${path}.entityType`);
    id(tomb.entityId, `${path}.entityId`);
    nullableHash(tomb.baseStateHash, `${path}.baseStateHash`);
    nullableHash(tomb.deletedStateHash, `${path}.deletedStateHash`);
    id(tomb.deletedByDeviceId, `${path}.deletedByDeviceId`);
    integer(tomb.deletionSequence, `${path}.deletionSequence`);
  });
  array(root.conflicts, SNAPSHOT_V2_CAPS.conflicts, '$.conflicts').forEach((item, index) => {
    const path = `$.conflicts[${index}]`;
    const conflict = object(item, [
      'conflictId', 'entityType', 'entityId', 'field', 'baseValueHash',
      'localValueHash', 'remoteValueHash', 'primaryValueHash', 'alternates',
      'recoveredEntityIds',
    ], path);
    hash(conflict.conflictId, `${path}.conflictId`);
    enumValue(conflict.entityType, ENTITY_TYPES, `${path}.entityType`);
    id(conflict.entityId, `${path}.entityId`);
    enumValue(conflict.field, CONFLICT_FIELDS, `${path}.field`);
    nullableHash(conflict.baseValueHash, `${path}.baseValueHash`);
    nullableHash(conflict.localValueHash, `${path}.localValueHash`);
    nullableHash(conflict.remoteValueHash, `${path}.remoteValueHash`);
    nullableHash(conflict.primaryValueHash, `${path}.primaryValueHash`);
    array(conflict.alternates, SNAPSHOT_V2_CAPS.alternatesPerConflict, `${path}.alternates`)
      .forEach((item, alternateIndex) => {
        const altPath = `${path}.alternates[${alternateIndex}]`;
        const alternate = object(item, ['valueHash', 'value'], altPath);
        hash(alternate.valueHash, `${altPath}.valueHash`);
        nullableString(alternate.value, `${altPath}.value`, SNAPSHOT_V2_CAPS.entryBodyBytes);
      });
    array(conflict.recoveredEntityIds, SNAPSHOT_V2_CAPS.entries, `${path}.recoveredEntityIds`)
      .forEach((item, recoveredIndex) => id(item, `${path}.recoveredEntityIds[${recoveredIndex}]`));
  });
  return value as JournalSnapshotPayloadV2;
}

function assertSortedUnique<T>(
  values: T[],
  key: (value: T) => string,
  path: string,
): void {
  let previous: string | null = null;
  for (const value of values) {
    const current = key(value);
    if (previous !== null && current <= previous) {
      invalid('non-canonical-order', `${path} is not strictly sorted and unique`);
    }
    previous = current;
  }
}

function liveKeys(domain: SnapshotDomainV2): Set<string> {
  const result = new Set<string>(['profile\0profile']);
  domain.entries.forEach((value) => result.add(`entry\0${value.entryId}`));
  domain.tags.forEach((value) => result.add(`tag\0${value.tagId}`));
  domain.prompts.forEach((value) => result.add(`prompt\0${value.promptId}`));
  return result;
}

export function validateSnapshotV2Collections(
  payload: JournalSnapshotPayloadV2,
  snapshotId: string,
): void {
  assertSortedUnique(payload.parentSnapshotIds, (value) => value, '$.parentSnapshotIds');
  if (payload.parentSnapshotIds.includes(snapshotId)) {
    invalid('self-parent', 'Snapshot cannot list itself as a parent');
  }
  assertSortedUnique(payload.observedDeviceHeads, (value) => value.deviceId, '$.observedDeviceHeads');
  assertSortedUnique(payload.entries, (value) => value.entryId, '$.entries');
  assertSortedUnique(payload.tags, (value) => value.tagId, '$.tags');
  assertSortedUnique(payload.entryTags, (value) => `${value.entryId}\0${value.tagId}`, '$.entryTags');
  assertSortedUnique(payload.prompts, (value) => value.promptId, '$.prompts');
  assertSortedUnique(payload.media, (value) => value.assetId, '$.media');
  assertSortedUnique(payload.tombstones, (value) => `${value.entityType}\0${value.entityId}`, '$.tombstones');
  assertSortedUnique(payload.conflicts, (value) => value.conflictId, '$.conflicts');
  for (const conflict of payload.conflicts) {
    assertSortedUnique(conflict.alternates, (value) => value.valueHash, `conflict ${conflict.conflictId} alternates`);
    assertSortedUnique(conflict.recoveredEntityIds, (value) => value, `conflict ${conflict.conflictId} recoveries`);
  }

  const entries = new Map(payload.entries.map((value) => [value.entryId, value]));
  const tags = new Map(payload.tags.map((value) => [value.tagId, value]));
  const prompts = new Map(payload.prompts.map((value) => [value.promptId, value]));
  const media = new Map(payload.media.map((value) => [value.assetId, value]));
  const live = liveKeys(payload);
  const tomb = new Set(payload.tombstones.map((value) => `${value.entityType}\0${value.entityId}`));
  for (const key of live) if (tomb.has(key)) invalid('live-tombstone-overlap', `Live entity also has tombstone: ${key}`);
  for (const relation of payload.entryTags) {
    if (!entries.has(relation.entryId) || !tags.has(relation.tagId)) {
      invalid('dangling-reference', 'Entry-tag relation references a missing entity');
    }
  }
  if (payload.profile.photoAssetId !== null) {
    const photo = media.get(payload.profile.photoAssetId);
    if (!photo || photo.ownerType !== 'profile' || photo.ownerId !== 'profile' || photo.kind !== 'profile-photo') {
      invalid('dangling-reference', 'Profile photo reference is invalid');
    }
  }
  for (const asset of payload.media) {
    const validEntry = asset.ownerType === 'entry' && entries.has(asset.ownerId) && asset.kind !== 'profile-photo';
    const validProfile = asset.ownerType === 'profile' && asset.ownerId === 'profile' && asset.kind === 'profile-photo';
    if (!validEntry && !validProfile) invalid('dangling-reference', `Invalid media owner for ${asset.assetId}`);
  }
  const byType = { entry: entries, tag: tags, prompt: prompts };
  for (const [type, records] of Object.entries(byType)) {
    for (const record of records.values()) {
      const origin = record.conflictOriginId;
      if (origin === null) continue;
      const primary = records.get(origin);
      if (!primary || primary.conflictOriginId !== null) {
        invalid('invalid-conflict-origin', `${type} recovery has a missing or recovered origin`);
      }
    }
  }
  for (const conflict of payload.conflicts) {
    const key = `${conflict.entityType}\0${conflict.entityId}`;
    if (!live.has(key) && !tomb.has(key)) invalid('dangling-conflict', `Conflict ${conflict.conflictId} has no entity`);
    for (const recoveredId of conflict.recoveredEntityIds) {
      const collection = conflict.entityType === 'entry' ? entries :
        conflict.entityType === 'tag' ? tags : conflict.entityType === 'prompt' ? prompts : null;
      const recovered = collection?.get(recoveredId);
      if (!recovered || recovered.conflictOriginId !== conflict.entityId) {
        invalid('dangling-conflict', `Conflict ${conflict.conflictId} has an invalid recovered entity`);
      }
    }
    const candidates = [conflict.localValueHash, conflict.remoteValueHash]
      .filter((value): value is string => value !== null);
    const expectedConflictId = canonicalHashV2([
      conflict.entityType,
      conflict.entityId,
      conflict.field,
      conflict.baseValueHash,
      [...new Set(candidates)].sort(),
    ]);
    if (conflict.conflictId !== expectedConflictId) {
      invalid('invalid-conflict-id', `Conflict ${conflict.conflictId} has a non-derived ID`);
    }
    if (conflict.entityType === 'profile' && conflict.entityId !== 'profile') {
      invalid('invalid-conflict', 'A profile conflict must use entity ID profile');
    }
  }
  for (const head of payload.observedDeviceHeads) {
    if (head.deviceId === payload.authorDeviceId && head.deviceSequence > payload.deviceSequence) {
      invalid('invalid-device-head', 'Author observation is ahead of its publication sequence');
    }
  }

  let authoredBytes = 0;
  const add = (value: string | null) => { if (value !== null) authoredBytes += utf8Length(value); };
  payload.entries.forEach((entry) => { add(entry.title); add(entry.content); });
  payload.tags.forEach((tag) => add(tag.title));
  payload.prompts.forEach((prompt) => add(prompt.title));
  add(payload.profile.displayName);
  payload.conflicts.forEach((conflict) => conflict.alternates.forEach((alternate) => add(alternate.value)));
  if (authoredBytes > SNAPSHOT_V2_CAPS.authoredTextBytes) {
    invalid('authored-text-cap', 'Total authored text cap exceeded');
  }
}

export function normalizeSnapshotV2(payload: JournalSnapshotPayloadV2): JournalSnapshotPayloadV2 {
  const clone: JournalSnapshotPayloadV2 = {
    ...payload,
    parentSnapshotIds: [...payload.parentSnapshotIds],
    observedDeviceHeads: payload.observedDeviceHeads.map((value) => ({ ...value })),
    entries: payload.entries.map((value) => ({ ...value })),
    tags: payload.tags.map((value) => ({ ...value })),
    entryTags: payload.entryTags.map((value) => ({ ...value })),
    prompts: payload.prompts.map((value) => ({ ...value })),
    profile: { ...payload.profile },
    media: payload.media.map((value) => ({ ...value })),
    tombstones: payload.tombstones.map((value) => ({ ...value })),
    conflicts: payload.conflicts.map((value) => ({
      ...value,
      alternates: value.alternates.map((alternate) => ({ ...alternate })),
      recoveredEntityIds: [...value.recoveredEntityIds],
    })),
  };
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  clone.parentSnapshotIds.sort();
  clone.observedDeviceHeads.sort((a, b) => compare(a.deviceId, b.deviceId));
  clone.entries.sort((a, b) => compare(a.entryId, b.entryId));
  clone.tags.sort((a, b) => compare(a.tagId, b.tagId));
  clone.entryTags.sort((a, b) => compare(`${a.entryId}\0${a.tagId}`, `${b.entryId}\0${b.tagId}`));
  clone.prompts.sort((a, b) => compare(a.promptId, b.promptId));
  clone.media.sort((a, b) => compare(a.assetId, b.assetId));
  clone.tombstones.sort((a, b) => compare(`${a.entityType}\0${a.entityId}`, `${b.entityType}\0${b.entityId}`));
  clone.conflicts.sort((a, b) => compare(a.conflictId, b.conflictId));
  clone.conflicts.forEach((conflict) => {
    conflict.alternates.sort((a, b) => compare(a.valueHash, b.valueHash));
    conflict.recoveredEntityIds.sort();
  });
  return clone;
}

export function calculateMediaReferencesV2(domain: SnapshotDomainV2): Set<string> {
  const references = new Set<string>();
  for (const asset of domain.media) if (asset.ownerType === 'entry') references.add(asset.assetId);
  if (domain.profile.photoAssetId) references.add(domain.profile.photoAssetId);
  for (const conflict of domain.conflicts) {
    if (conflict.field !== 'photoAssetId') continue;
    for (const alternate of conflict.alternates) if (alternate.value) references.add(alternate.value);
  }
  return references;
}
