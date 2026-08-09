import { VersionGraph } from '../ancestry';
import { createEditVersion } from '../domain/version';
import type { AssetDescriptor, EntryState } from '../domain/types';
import { resolveHeads } from '.';

const asset: AssetDescriptor = {
  assetId: 'asset',
  kind: 'photo',
  mimeType: 'image/jpeg',
  byteSize: 3,
  width: 1,
  height: 1,
  durationMs: null,
  blobHash: 'a'.repeat(64),
};

const state = (overrides: Partial<EntryState> = {}): EntryState => ({
  entityType: 'entry',
  title: 'base',
  content: 'base',
  mood: 'calm',
  tagIds: ['base-tag'],
  assets: [asset],
  createdAt: 1,
  updatedAt: 1,
  conflictOriginId: null,
  ...overrides,
});

function version(device: string, value: EntryState, parents: string[] = []) {
  return createEditVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'entry',
    parents,
    state: value,
    authorDeviceId: device,
    editSequence: 1,
    authoredAt: 1,
  });
}

test('N-head text conflicts are deterministic and preserve every authored text state', () => {
  const root = version('root', state());
  const a = version(
    'a',
    state({ title: 'A', content: 'A', mood: 'joy', tagIds: ['base-tag', 'a'] }),
    [root.hash],
  );
  const b = version(
    'b',
    state({ title: 'B', content: 'B', mood: 'sad', tagIds: ['base-tag', 'b'] }),
    [root.hash],
  );
  const c = version(
    'c',
    state({ title: 'C', content: 'C', mood: 'calm', tagIds: ['base-tag', 'c'] }),
    [root.hash],
  );
  const graph = new VersionGraph('vault', 'entry', 'entry');
  for (const item of [root, a, b, c]) graph.add(item.body, item.hash);
  const forward = resolveHeads(graph, [a.hash, b.hash, c.hash]);
  const reverse = resolveHeads(graph, [c.hash, b.hash, a.hash]);
  expect(reverse.resolution.hash).toBe(forward.resolution.hash);
  expect(reverse.recoveries.map((item) => item.hash)).toEqual(
    forward.recoveries.map((item) => item.hash),
  );
  expect(forward.recoveries).toHaveLength(2);
  expect(forward.conflict?.alternates.length).toBeGreaterThan(0);
  const liveTexts = [
    forward.resolution.body.state,
    ...forward.recoveries.map((item) => item.body.state),
  ].map((value) =>
    value?.entityType === 'entry' ? `${value.title}:${value.content}` : '',
  );
  expect(new Set(liveTexts)).toEqual(new Set(['A:A', 'B:B', 'C:C']));
  const resolvedState = forward.resolution.body.state;
  expect(resolvedState?.entityType).toBe('entry');
  if (resolvedState?.entityType === 'entry') {
    expect(resolvedState.tagIds).toEqual(['a', 'b', 'base-tag', 'c']);
  }
  for (const recovery of forward.recoveries) {
    const recoveredState = recovery.body.state;
    if (recoveredState?.entityType === 'entry') {
      expect(recoveredState.assets[0].assetId).not.toBe(asset.assetId);
      expect(recoveredState.assets[0].blobHash).toBe(asset.blobHash);
    }
  }
});

test('a concurrent edit survives a delete, while a causally later delete wins', () => {
  const root = version('root', state());
  const edited = version('edit', state({ content: 'survives' }), [root.hash]);
  const concurrentDelete = createEditVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'entry',
    parents: [root.hash],
    state: null,
    deleted: true,
    authorDeviceId: 'delete',
    editSequence: 1,
    authoredAt: 2,
  });
  const graph = new VersionGraph('vault', 'entry', 'entry');
  for (const item of [root, edited, concurrentDelete]) graph.add(item.body, item.hash);
  expect(resolveHeads(graph, [edited.hash, concurrentDelete.hash]).resolution.body.deleted).toBe(
    false,
  );

  const laterDelete = createEditVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'entry',
    parents: [edited.hash],
    state: null,
    deleted: true,
    authorDeviceId: 'delete',
    editSequence: 2,
    authoredAt: 3,
  });
  graph.add(laterDelete.body, laterDelete.hash);
  expect(resolveHeads(graph, [edited.hash, laterDelete.hash]).resolution.body.deleted).toBe(
    true,
  );
});
