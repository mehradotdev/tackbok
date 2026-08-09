import { createEditVersion, createSystemVersion } from '../domain/version';
import type { EntryState } from '../domain/types';
import { VersionGraph } from '.';

const state = (content: string): EntryState => ({
  entityType: 'entry',
  title: null,
  content,
  mood: null,
  tagIds: [],
  assets: [],
  createdAt: 1,
  updatedAt: 1,
  conflictOriginId: null,
});

function edit(content: string, parents: string[] = []) {
  return createEditVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'entry',
    parents,
    state: state(content),
    authorDeviceId: content,
    editSequence: 1,
    authoredAt: 1,
  });
}

test('out-of-order versions remain incomplete until ancestry arrives', () => {
  const root = edit('root');
  const child = edit('child', [root.hash]);
  const graph = new VersionGraph('vault', 'entry', 'entry');
  expect(graph.add(child.body, child.hash).status).toBe('incomplete');
  expect(graph.heads()).toEqual([]);
  graph.add(root.body, root.hash);
  expect(graph.get(child.hash)?.status).toBe('complete');
  expect(graph.heads()).toEqual([child.hash]);
  expect(graph.descendsFrom(child.hash, root.hash)).toBe(true);
});

test('maximal common ancestors preserve ambiguous criss-cross bases', () => {
  const root = edit('root');
  const left = edit('left', [root.hash]);
  const right = edit('right', [root.hash]);
  const crossA = createSystemVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'entry',
    kind: 'join',
    parents: [left.hash, right.hash],
    state: state('cross-a'),
  });
  const crossB = createSystemVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'entry',
    kind: 'join',
    parents: [right.hash, left.hash],
    state: state('cross-b'),
    derivedTimestamp: 2,
  });
  const graph = new VersionGraph('vault', 'entry', 'entry');
  for (const version of [root, left, right, crossA, crossB]) {
    graph.add(version.body, version.hash);
  }
  expect(graph.maximalCommonAncestors([crossA.hash, crossB.hash])).toEqual(
    [left.hash, right.hash].sort(),
  );
});

test('recovery declarations block a resolution until the exact dependency exists', () => {
  const root = edit('root');
  const recovery = createSystemVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'recovered',
    kind: 'recovery-init',
    parents: [],
    state: state('recovered'),
  });
  const resolution = createSystemVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'entry',
    kind: 'resolution',
    parents: [root.hash],
    state: state('root'),
    recoveries: [
      {
        entityType: 'entry',
        entityId: 'recovered',
        versionHash: recovery.hash,
      },
    ],
  });
  const graph = new VersionGraph('vault', 'entry', 'entry');
  graph.add(root.body, root.hash);
  graph.add(resolution.body, resolution.hash);
  expect(graph.get(resolution.hash)?.status).toBe('incomplete');
  graph.satisfyRecoveryDependency(recovery.hash, {
    entityType: 'entry',
    entityId: 'recovered',
  });
  expect(graph.get(resolution.hash)?.status).toBe('complete');
});
