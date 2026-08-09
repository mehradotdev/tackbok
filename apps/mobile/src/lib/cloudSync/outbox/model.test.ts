import type { EntryState } from '../domain/types';
import { coalesceOutbox, constructProvisional, settleOutbox, type OutboxItem } from '.';

const state: EntryState = {
  entityType: 'entry',
  title: null,
  content: 'one',
  mood: null,
  tagIds: [],
  assets: [],
  createdAt: 1,
  updatedAt: 1,
  conflictOriginId: null,
};

test('settle never clears a newer generation and rebases it on the published provisional', () => {
  const first: OutboxItem = {
    entityType: 'entry',
    entityId: 'entry',
    action: 'upsert',
    baseHeads: [],
    generation: 1,
    batchId: null,
  };
  const capture = constructProvisional({
    vaultId: 'vault',
    deviceId: 'device',
    editSequence: 1,
    authoredAt: 1,
    item: first,
    state,
  });
  const newer = { ...first, generation: 2 };
  expect(
    settleOutbox({ current: newer, capture, provisionalPublished: false }),
  ).toEqual(newer);
  expect(
    settleOutbox({ current: newer, capture, provisionalPublished: true })?.baseHeads,
  ).toEqual([capture.version.hash]);
  expect(settleOutbox({ current: first, capture, provisionalPublished: true })).toBeNull();
});

test('coalescing preserves the first logical authored time', () => {
  const first = coalesceOutbox(null, {
    entityType: 'entry',
    entityId: 'entry',
    action: 'upsert',
    currentHeads: [],
    generation: 1,
    batchId: null,
    authoredAt: 100,
  });
  const second = coalesceOutbox(first, {
    entityType: 'entry',
    entityId: 'entry',
    action: 'upsert',
    currentHeads: ['f'.repeat(64)],
    generation: 2,
    batchId: null,
    authoredAt: 200,
  });

  expect(first.authoredAt).toBe(100);
  expect(second.authoredAt).toBe(100);
  expect(second.baseHeads).toEqual([]);
});
