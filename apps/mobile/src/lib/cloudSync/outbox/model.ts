import type { EntityType, HashedVersion } from '../domain/types';
import { createEditVersion } from '../domain/version';

export interface OutboxItem {
  entityType: EntityType;
  entityId: string;
  action: 'upsert' | 'delete';
  baseHeads: string[];
  generation: number;
  batchId: string | null;
  /** Captured at the local mutation, not later during a retrying sync pass. */
  authoredAt?: number;
}

export interface ProvisionalCapture {
  item: OutboxItem;
  version: HashedVersion;
  capturedGeneration: number;
}

export function coalesceOutbox(
  previous: OutboxItem | null,
  mutation: Omit<OutboxItem, 'baseHeads'> & { currentHeads: string[] },
): OutboxItem {
  return {
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    action: mutation.action,
    baseHeads: previous?.baseHeads ?? [...mutation.currentHeads].sort(),
    generation: mutation.generation,
    batchId: mutation.batchId,
  };
}

export function constructProvisional(input: {
  vaultId: string;
  deviceId: string;
  editSequence: number;
  authoredAt: number;
  item: OutboxItem;
  state: Parameters<typeof createEditVersion>[0]['state'];
}): ProvisionalCapture {
  return {
    item: input.item,
    capturedGeneration: input.item.generation,
    version: createEditVersion({
      vaultId: input.vaultId,
      entityType: input.item.entityType,
      entityId: input.item.entityId,
      parents: input.item.baseHeads,
      state: input.item.action === 'delete' ? null : input.state,
      deleted: input.item.action === 'delete',
      authorDeviceId: input.deviceId,
      editSequence: input.editSequence,
      batchId: input.item.batchId,
      authoredAt: input.item.authoredAt ?? input.authoredAt,
    }),
  };
}

export function settleOutbox(input: {
  current: OutboxItem | null;
  capture: ProvisionalCapture;
  provisionalPublished: boolean;
}): OutboxItem | null {
  if (!input.current) return null;
  if (input.current.generation === input.capture.capturedGeneration) return null;
  if (!input.provisionalPublished) return input.current;
  return {
    ...input.current,
    // The next local edit observed the prior provisional state, not a concurrent
    // resolution that happened later in the pass.
    baseHeads: [input.capture.version.hash],
  };
}

export function canApplyAtGeneration(
  capturedGeneration: number,
  currentGeneration: number,
): boolean {
  return capturedGeneration === currentGeneration;
}
