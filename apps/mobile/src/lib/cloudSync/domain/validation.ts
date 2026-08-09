import { canonicalizeJsonV1 } from '../codec';
import type { CanonicalJsonValue } from '../protocol/canonicalJsonV1';
import { PROTOCOL_V1_CAPS } from '../protocol/validationCaps';
import {
  isSha256,
  type AssetDescriptor,
  type ConflictRecord,
  type DomainState,
  type EntityVersionBody,
} from './types';

export class VersionValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'too-large'
      | 'too-many-parents'
      | 'invalid-hash'
      | 'cross-vault'
      | 'identity-mismatch'
      | 'invalid-state',
  ) {
    super(message);
    this.name = 'VersionValidationError';
  }
}

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;

function invalid(message: string): never {
  throw new VersionValidationError(message, 'invalid-state');
}

function assertBytes(value: string, cap: number, label: string): void {
  if (typeof value !== 'string') invalid(`${label} must be a string`);
  if (utf8Bytes(value) > cap) {
    throw new VersionValidationError(`${label} exceeds its UTF-8 byte cap`, 'too-large');
  }
}

function assertExactKeys(value: object, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    invalid(`${label} contains unknown fields`);
  }
}

function metadataDepth(value: unknown): number {
  if (value === null || typeof value !== 'object') return 0;
  let maximum = 0;
  const stack: { value: object; depth: number }[] = [{ value, depth: 1 }];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current.value)) invalid('Cyclic metadata is not valid JSON');
    seen.add(current.value);
    maximum = Math.max(maximum, current.depth);
    if (maximum > PROTOCOL_V1_CAPS.maximumMetadataDepth) {
      throw new VersionValidationError('Metadata depth cap exceeded', 'too-large');
    }
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    for (const child of children) {
      if (child !== null && typeof child === 'object') {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
    seen.delete(current.value);
  }
  return maximum;
}

export function validateMetadataDepth(value: unknown): void {
  metadataDepth(value);
}

function validateAsset(asset: AssetDescriptor): void {
  assertExactKeys(
    asset,
    [
      'assetId',
      'kind',
      'mimeType',
      'byteSize',
      'width',
      'height',
      'durationMs',
      'blobHash',
    ],
    'Asset descriptor',
  );
  assertBytes(asset.assetId, PROTOCOL_V1_CAPS.entityIdUtf8Bytes, 'Asset id');
  if (asset.mimeType !== null) {
    assertBytes(asset.mimeType, PROTOCOL_V1_CAPS.mimeTypeUtf8Bytes, 'MIME type');
  }
  if (!isSha256(asset.blobHash)) {
    throw new VersionValidationError('Asset blob hash is invalid', 'invalid-hash');
  }
  if (
    asset.byteSize !== null &&
    (!Number.isSafeInteger(asset.byteSize) ||
      asset.byteSize < 0 ||
      asset.byteSize > PROTOCOL_V1_CAPS.maximumMediaBytes)
  ) {
    throw new VersionValidationError('Asset exceeds the media byte cap', 'too-large');
  }
}

function validateState(state: DomainState, bodyType: EntityVersionBody['entityType']): void {
  if (state.entityType !== bodyType) invalid('Domain state type does not match entity type');
  if (state.entityType === 'entry') {
    assertExactKeys(
      state,
      [
        'entityType',
        'title',
        'content',
        'mood',
        'tagIds',
        'assets',
        'createdAt',
        'updatedAt',
        'conflictOriginId',
      ],
      'Entry state',
    );
    if (state.title !== null) {
      assertBytes(state.title, PROTOCOL_V1_CAPS.titleUtf8Bytes, 'Entry title');
    }
    if (state.content !== null) {
      assertBytes(state.content, PROTOCOL_V1_CAPS.entryContentUtf8Bytes, 'Entry content');
    }
    if (state.tagIds.length > PROTOCOL_V1_CAPS.tagIdsPerEntry) {
      throw new VersionValidationError('Entry tag id cap exceeded', 'too-large');
    }
    for (const tagId of state.tagIds) {
      assertBytes(tagId, PROTOCOL_V1_CAPS.entityIdUtf8Bytes, 'Tag id');
    }
    if (state.assets.length > PROTOCOL_V1_CAPS.assetsPerEntity) {
      throw new VersionValidationError('Entry asset cap exceeded', 'too-large');
    }
    for (const asset of state.assets) validateAsset(asset);
    return;
  }
  if (state.entityType === 'tag') {
    assertExactKeys(
      state,
      ['entityType', 'title', 'createdAt', 'updatedAt', 'conflictOriginId'],
      'Tag state',
    );
    assertBytes(state.title, PROTOCOL_V1_CAPS.titleUtf8Bytes, 'Tag title');
    return;
  }
  if (state.entityType === 'prompt') {
    assertExactKeys(
      state,
      ['entityType', 'title', 'createdAt', 'updatedAt', 'conflictOriginId'],
      'Prompt state',
    );
    assertBytes(state.title, PROTOCOL_V1_CAPS.promptTextUtf8Bytes, 'Prompt text');
    return;
  }
  assertExactKeys(state, ['entityType', 'displayName', 'photo'], 'Profile state');
  if (state.displayName !== null) {
    assertBytes(
      state.displayName,
      PROTOCOL_V1_CAPS.displayNameUtf8Bytes,
      'Profile display name',
    );
  }
  if (state.photo) validateAsset(state.photo);
}

export function validateVersionBody(
  body: EntityVersionBody,
  expected: { vaultId: string; entityType?: string; entityId?: string },
): void {
  if (!body || typeof body !== 'object') invalid('Entity version must be an object');
  if (!['entry', 'tag', 'prompt', 'profile'].includes(body.entityType)) {
    invalid('Unknown entity type');
  }
  if (!['edit', 'resolution', 'recovery-init', 'join'].includes(body.kind)) {
    invalid('Unknown version kind');
  }
  assertExactKeys(
    body,
    body.kind === 'edit'
      ? [
          'formatVersion',
          'vaultId',
          'entityType',
          'entityId',
          'kind',
          'parents',
          'state',
          'deleted',
          'recoveries',
          'derivedTimestamp',
          'authorDeviceId',
          'editSequence',
          'batchId',
          'authoredAt',
        ]
      : [
          'formatVersion',
          'vaultId',
          'entityType',
          'entityId',
          'kind',
          'parents',
          'state',
          'deleted',
          'recoveries',
          'derivedTimestamp',
        ],
    'Entity version',
  );
  if (!Array.isArray(body.parents) || !Array.isArray(body.recoveries)) {
    invalid('Parents and recoveries must be arrays');
  }
  if (body.formatVersion !== 1) invalid('Unsupported entity version format');
  if (body.parents.length > PROTOCOL_V1_CAPS.parentCount) {
    throw new VersionValidationError('Version exceeds the parent cap', 'too-many-parents');
  }
  if (body.recoveries.length > PROTOCOL_V1_CAPS.recoveryDependencyCount) {
    throw new VersionValidationError('Recovery dependency cap exceeded', 'too-large');
  }
  assertBytes(body.entityId, PROTOCOL_V1_CAPS.entityIdUtf8Bytes, 'Entity id');
  if (body.kind === 'edit') {
    assertBytes(body.authorDeviceId, PROTOCOL_V1_CAPS.deviceIdUtf8Bytes, 'Device id');
    if (body.batchId !== null) {
      assertBytes(body.batchId, PROTOCOL_V1_CAPS.batchIdUtf8Bytes, 'Batch id');
    }
  }
  if (body.vaultId !== expected.vaultId) {
    throw new VersionValidationError('Version belongs to another vault', 'cross-vault');
  }
  if (
    (expected.entityType && body.entityType !== expected.entityType) ||
    (expected.entityId && body.entityId !== expected.entityId)
  ) {
    throw new VersionValidationError('Entity identity does not match its key', 'identity-mismatch');
  }
  if (body.parents.some((hash) => !isSha256(hash))) {
    throw new VersionValidationError('Parent hash is invalid', 'invalid-hash');
  }
  for (const recovery of body.recoveries) {
    assertExactKeys(
      recovery,
      ['entityType', 'entityId', 'versionHash'],
      'Recovery dependency',
    );
    assertBytes(recovery.entityId, PROTOCOL_V1_CAPS.entityIdUtf8Bytes, 'Recovery entity id');
    if (!isSha256(recovery.versionHash)) {
      throw new VersionValidationError('Recovery hash is invalid', 'invalid-hash');
    }
  }
  if (body.deleted === (body.state !== null)) {
    invalid('Exactly one of tombstone or domain state is required');
  }
  if (body.state) validateState(body.state, body.entityType);
  metadataDepth(body);

  let canonical: string;
  try {
    canonical = canonicalizeJsonV1(body as unknown as CanonicalJsonValue);
  } catch {
    invalid('Entity version is not canonical JSON');
  }
  if (utf8Bytes(canonical) > PROTOCOL_V1_CAPS.entityVersionJsonBytes) {
    throw new VersionValidationError('Version exceeds the JSON byte cap', 'too-large');
  }
}

export function validateConflictRecord(record: ConflictRecord): void {
  const bytes = utf8Bytes(
    canonicalizeJsonV1(record.alternates as unknown as CanonicalJsonValue),
  );
  if (bytes > PROTOCOL_V1_CAPS.scalarAlternateJsonBytes) {
    throw new VersionValidationError('Scalar alternates exceed their JSON byte cap', 'too-large');
  }
  metadataDepth(record.alternates);
}

export function parseAndValidateRevocationMarker(
  bytes: Uint8Array,
  expectedVaultId: string,
): { kind: 'journal-deleted' | 'backup-deleted' } {
  if (bytes.byteLength > PROTOCOL_V1_CAPS.revocationJsonBytes) {
    throw new VersionValidationError('Revocation marker exceeds its JSON byte cap', 'too-large');
  }
  const marker = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  assertExactKeys(
    marker,
    ['formatVersion', 'vaultId', 'kind', 'revocationId', 'timestamp'],
    'Revocation marker',
  );
  if (
    marker.formatVersion !== 1 ||
    marker.vaultId !== expectedVaultId ||
    (marker.kind !== 'journal-deleted' && marker.kind !== 'backup-deleted')
  ) {
    invalid('Invalid revocation marker');
  }
  metadataDepth(marker);
  return { kind: marker.kind };
}

export function validateVaultMarkerBytes(bytes: Uint8Array): void {
  if (bytes.byteLength > PROTOCOL_V1_CAPS.vaultJsonBytes) {
    throw new VersionValidationError('Vault marker exceeds its JSON byte cap', 'too-large');
  }
  const marker = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  assertExactKeys(marker, ['magic', 'formatVersion', 'vaultId'], 'Vault marker');
  if (
    marker.magic !== 'tackbok-vault' ||
    marker.formatVersion !== 1 ||
    typeof marker.vaultId !== 'string'
  ) {
    invalid('Invalid vault marker');
  }
  metadataDepth(marker);
}
