import { canonicalizeJsonV1 } from '../codec';
import type { CanonicalJsonValue } from '../phase0/canonicalJsonV1';
import { PROTOCOL_V1_CAPS } from '../phase0/validationCaps';
import { isSha256, type EntityVersionBody } from './types';

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

export function validateVersionBody(
  body: EntityVersionBody,
  expected: { vaultId: string; entityType?: string; entityId?: string },
): void {
  const canonical = canonicalizeJsonV1(body as unknown as CanonicalJsonValue);
  if (
    new TextEncoder().encode(canonical).byteLength >
    PROTOCOL_V1_CAPS.entityVersionJsonBytes
  ) {
    throw new VersionValidationError('Version exceeds the JSON byte cap', 'too-large');
  }
  if (body.parents.length > PROTOCOL_V1_CAPS.parentCount) {
    throw new VersionValidationError('Version exceeds the parent cap', 'too-many-parents');
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
  if (body.deleted === (body.state !== null)) {
    throw new VersionValidationError(
      'Exactly one of tombstone or domain state is required',
      'invalid-state',
    );
  }
}
