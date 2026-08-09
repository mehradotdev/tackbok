import { hashCanonical, sha256Text } from '../codec';
import {
  normalizeDomainState,
  type DomainState,
  type EditVersionBody,
  type EntityType,
  type EntityVersionBody,
  type HashedVersion,
  type RecoveryRef,
  type SystemVersionBody,
  type VersionKind,
} from './types';

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function sortedRecoveries(recoveries: RecoveryRef[]): RecoveryRef[] {
  return [...recoveries].sort(
    (left, right) =>
      left.entityType.localeCompare(right.entityType) ||
      left.entityId.localeCompare(right.entityId) ||
      left.versionHash.localeCompare(right.versionHash),
  );
}

export function createEditVersion(input: {
  vaultId: string;
  entityType: EntityType;
  entityId: string;
  parents: string[];
  state: DomainState | null;
  deleted?: boolean;
  authorDeviceId: string;
  editSequence: number;
  batchId?: string | null;
  authoredAt: number;
}): HashedVersion {
  const body: EditVersionBody = {
    formatVersion: 1,
    vaultId: input.vaultId,
    entityType: input.entityType,
    entityId: input.entityId,
    kind: 'edit',
    parents: sortedUnique(input.parents),
    state: input.state ? normalizeDomainState(input.state) : null,
    deleted: input.deleted ?? false,
    recoveries: [],
    derivedTimestamp: null,
    authorDeviceId: input.authorDeviceId,
    editSequence: input.editSequence,
    batchId: input.batchId ?? null,
    authoredAt: input.authoredAt,
  };
  return hashVersion(body, 'provisional');
}

export function createSystemVersion(input: {
  vaultId: string;
  entityType: EntityType;
  entityId: string;
  kind: Exclude<VersionKind, 'edit'>;
  parents: string[];
  state: DomainState | null;
  deleted?: boolean;
  recoveries?: RecoveryRef[];
  derivedTimestamp?: number | null;
}): HashedVersion {
  const body: SystemVersionBody = {
    formatVersion: 1,
    vaultId: input.vaultId,
    entityType: input.entityType,
    entityId: input.entityId,
    kind: input.kind,
    parents: sortedUnique(input.parents),
    state: input.state ? normalizeDomainState(input.state) : null,
    deleted: input.deleted ?? false,
    recoveries: sortedRecoveries(input.recoveries ?? []),
    derivedTimestamp: input.derivedTimestamp ?? null,
  };
  return hashVersion(body, 'complete');
}

export function hashVersion(
  body: EntityVersionBody,
  status: HashedVersion['status'] = 'complete',
): HashedVersion {
  const { canonical, hash } = hashCanonical(body);
  return { hash, canonical, body, status, published: false };
}

export function deterministicId(namespace: string, ...parts: string[]): string {
  return sha256Text([namespace, ...parts].join('\u0000'));
}
