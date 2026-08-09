import golden from '../phase0/fixtures/golden-v1.json';
import { canonicalBytes } from '../codec';
import { VersionGraph } from '../ancestry';
import { resolveHeads } from '../conflicts';
import { canDeleteRetainedMedia } from '../domain/mediaRetention';
import { createEditVersion, createSystemVersion } from '../domain/version';
import type {
  AssetDescriptor,
  EntryState,
  HashedVersion,
  ProfileState,
  TagState,
} from '../domain/types';
import {
  FakeCloudProvider,
  ProviderError,
  type ByteSource,
  type LogicalKey,
  type RemoteObjectRef,
  type VaultRef,
} from '../providers';
import { createPortableEntries, createPortablePrompts, createPortableTags } from '~/lib/backupExport/portable';
import { InMemorySyncDevice } from './inMemoryEngine';

jest.mock('~/lib/backupExport/utils', () => ({
  assetFileExists: () => true,
  createArchiveAssetPath: (_type: string, uri: string) => `media/${uri}`,
  resolveTagIdsToTitles: (value: string) => value.split(',').filter(Boolean),
}));

const blobHash = 'a'.repeat(64);
const asset = (id = 'asset'): AssetDescriptor => ({
  assetId: id,
  kind: 'photo',
  mimeType: 'image/jpeg',
  byteSize: 3,
  width: 1,
  height: 1,
  durationMs: null,
  blobHash,
});
const entry = (content: string, tags: string[] = [], assets: AssetDescriptor[] = []): EntryState => ({
  entityType: 'entry', title: content, content, mood: null, tagIds: tags, assets,
  createdAt: 1, updatedAt: 1, conflictOriginId: null,
});
const tag = (title: string): TagState => ({
  entityType: 'tag', title, createdAt: 1, updatedAt: 1, conflictOriginId: null,
});
const edit = (
  id: string,
  content: string,
  parents: string[] = [],
  overrides: Partial<EntryState> = {},
) => createEditVersion({
  vaultId: 'vault', entityType: 'entry', entityId: id, parents,
  state: entry(content, overrides.tagIds, overrides.assets),
  authorDeviceId: content, editSequence: 1, authoredAt: 1,
});

async function setup<T extends FakeCloudProvider>(provider: T) {
  await provider.connect();
  const { vault } = await provider.createVaultMarker(
    'vault',
    canonicalBytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId: 'vault' }),
  );
  return vault;
}

function ancestry(shape: 'linear' | 'symmetric' | 'asymmetric' | 'three' | 'criss') {
  const graph = new VersionGraph('vault', 'entry', 'e');
  const root = edit('e', 'root');
  graph.add(root.body, root.hash);
  const left = edit('e', 'left', [root.hash]);
  const right = edit('e', 'right', [root.hash]);
  graph.add(left.body, left.hash);
  if (shape === 'linear') {
    const tail = edit('e', 'tail', [left.hash]);
    graph.add(tail.body, tail.hash);
    expect(graph.heads()).toEqual([tail.hash]);
    expect(graph.descendsFrom(tail.hash, root.hash)).toBe(true);
    return;
  }
  graph.add(right.body, right.hash);
  if (shape === 'symmetric') {
    expect(graph.heads()).toEqual([left.hash, right.hash].sort());
    expect(graph.maximalCommonAncestors(graph.heads())).toEqual([root.hash]);
    return;
  }
  if (shape === 'asymmetric') {
    const left2 = edit('e', 'left2', [left.hash]);
    graph.add(left2.body, left2.hash);
    expect(graph.heads()).toEqual([left2.hash, right.hash].sort());
    expect(graph.maximalCommonAncestors(graph.heads())).toEqual([root.hash]);
    return;
  }
  if (shape === 'three') {
    const third = edit('e', 'third', [root.hash]);
    graph.add(third.body, third.hash);
    expect(graph.heads()).toHaveLength(3);
    expect(resolveHeads(graph).resolution.body.parents).toHaveLength(3);
    return;
  }
  const crossA = createSystemVersion({
    vaultId: 'vault', entityType: 'entry', entityId: 'e', kind: 'join',
    parents: [left.hash, right.hash], state: entry('cross-a'), derivedTimestamp: 1,
  });
  const crossB = createSystemVersion({
    vaultId: 'vault', entityType: 'entry', entityId: 'e', kind: 'join',
    parents: [left.hash, right.hash], state: entry('cross-b'), derivedTimestamp: 2,
  });
  graph.add(crossA.body, crossA.hash);
  graph.add(crossB.body, crossB.hash);
  expect(graph.maximalCommonAncestors([crossA.hash, crossB.hash])).toEqual(
    [left.hash, right.hash].sort(),
  );
  expect(resolveHeads(graph, [crossA.hash, crossB.hash]).recoveries).toHaveLength(1);
}

function conflict(kind: 'set' | 'text' | 'scalar' | 'delete' | 'raced' | 'profile') {
  if (kind === 'profile') {
    const rootState: ProfileState = { entityType: 'profile', displayName: 'Base', photo: null };
    const make = (device: string, state: ProfileState, parents: string[] = []) =>
      createEditVersion({
        vaultId: 'vault', entityType: 'profile', entityId: 'profile', parents, state,
        authorDeviceId: device, editSequence: 1, authoredAt: 1,
      });
    const root = make('root', rootState);
    const left = make('left', { ...rootState, displayName: 'Ada' }, [root.hash]);
    const right = make('right', { ...rootState, photo: asset('photo') }, [root.hash]);
    const graph = new VersionGraph('vault', 'profile', 'profile');
    for (const value of [root, left, right]) graph.add(value.body, value.hash);
    const result = resolveHeads(graph, [left.hash, right.hash]);
    expect(result.resolution.body.state).toMatchObject({ displayName: 'Ada', photo: asset('photo') });
    expect(JSON.stringify(result.resolution.body)).not.toContain('email');
    return;
  }
  const root = edit('e', 'base', [], { tagIds: ['tag-a'], assets: [asset()] });
  const left = edit('e', kind === 'text' ? 'left' : 'base', [root.hash], {
    tagIds: ['tag-a', 'tag-b'], assets: [asset()],
  });
  const right = edit('e', kind === 'text' ? 'right' : 'base', [root.hash], {
    tagIds: ['tag-a', 'tag-c'], assets: [asset()],
  });
  const graph = new VersionGraph('vault', 'entry', 'e');
  for (const value of [root, left, right]) graph.add(value.body, value.hash);
  if (kind === 'delete') {
    const deletion = createEditVersion({
      vaultId: 'vault', entityType: 'entry', entityId: 'e', parents: [root.hash],
      state: null, deleted: true, authorDeviceId: 'delete', editSequence: 1, authoredAt: 2,
    });
    graph.add(deletion.body, deletion.hash);
    expect(resolveHeads(graph, [left.hash, deletion.hash]).resolution.body.deleted).toBe(false);
    return;
  }
  if (kind === 'scalar') {
    const moods = ['Calm', 'Joyful', 'Neutral'].map((mood) =>
      createEditVersion({
        vaultId: 'vault', entityType: 'entry', entityId: 'e', parents: [root.hash],
        state: { ...entry('base'), mood }, authorDeviceId: mood, editSequence: 1, authoredAt: 1,
      }),
    );
    const moodGraph = new VersionGraph('vault', 'entry', 'e');
    moodGraph.add(root.body, root.hash);
    moods.forEach((value) => moodGraph.add(value.body, value.hash));
    expect(resolveHeads(moodGraph, moods.map((value) => value.hash)).conflict?.alternates).toHaveLength(2);
    return;
  }
  const forward = resolveHeads(graph, [left.hash, right.hash]);
  if (kind === 'set') {
    expect(forward.resolution.body.state).toMatchObject({ tagIds: ['tag-a', 'tag-b', 'tag-c'] });
  } else if (kind === 'text') {
    expect(forward.recoveries).toHaveLength(1);
    const recovered = forward.recoveries[0].body.state;
    expect(recovered?.entityType === 'entry' && recovered.assets[0].assetId).not.toBe('asset');
    expect(recovered?.entityType === 'entry' && recovered.assets[0].blobHash).toBe(blobHash);
  } else {
    expect(resolveHeads(graph, [right.hash, left.hash]).resolution.hash).toBe(forward.resolution.hash);
  }
}

async function dirtyScenario(kind: 'upsert' | 'delete' | 'generation' | 'clean-race') {
  const provider = new FakeCloudProvider(20);
  const vault = await setup(provider);
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.mutate('entry', 'e', entry('base'));
  await a.sync();
  await b.sync();
  if (kind === 'clean-race') {
    a.mutate('entry', 'e', entry('remote'));
    await a.sync();
    const result = await b.sync({ beforeApply: (device) => device.mutate('entry', 'e', entry('local')) });
    expect(result.skippedByCas).toBe(1);
    expect(b.snapshot()['entry:e']).toMatchObject({ content: 'local' });
    return;
  }
  b.mutate(
    'entry',
    'e',
    kind === 'delete' ? null : entry(kind === 'generation' ? 'base' : 'local', ['local']),
  );
  a.mutate('entry', 'e', entry(kind === 'generation' ? 'base' : 'remote', ['remote']));
  await a.sync();
  if (kind === 'generation') {
    await b.sync({
      beforeApply: (device) =>
        device.mutate('entry', 'e', entry('base', ['local', 'newer'])),
    });
    expect(b.outbox.has('entry:e')).toBe(true);
    await b.sync();
    expect(b.outbox.has('entry:e')).toBe(false);
    expect(b.conflicts.size).toBe(0);
  } else {
    await b.sync();
    const state = b.snapshot()['entry:e'];
    expect(state?.entityType).toBe('entry');
    if (kind === 'upsert') expect(state).toMatchObject({ tagIds: ['local', 'remote'] });
    else expect(state).toMatchObject({ content: 'remote' });
  }
}

class CrashProvider extends FakeCloudProvider {
  private category: 'blob' | 'edit' | 'recovery-init' | 'resolution' | null = null;
  arm(category: NonNullable<CrashProvider['category']>): void { this.category = category; }
  override async putImmutable(
    vault: VaultRef,
    key: LogicalKey,
    source: ByteSource,
  ): Promise<RemoteObjectRef> {
    const result = await super.putImmutable(vault, key, source);
    if (!this.category) return result;
    let observed: CrashProvider['category'] = key.startsWith('blobs/') ? 'blob' : null;
    if (!observed && source instanceof Uint8Array) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(source)) as { kind?: CrashProvider['category'] };
        observed = parsed.kind ?? null;
      } catch {}
    }
    if (observed === this.category) {
      this.category = null;
      throw new ProviderError('transient', 'scheduled crash after durable write');
    }
    return result;
  }
}

async function publishCrash(category: 'blob' | 'edit' | 'recovery-init' | 'resolution') {
  const provider = new CrashProvider(50);
  const vault = await setup(provider);
  const remote = new InMemorySyncDevice('remote', vault, provider);
  const local = new InMemorySyncDevice('local', vault, provider);
  remote.mutate('entry', 'e', entry('base'));
  await remote.sync();
  await local.sync();
  remote.mutate('entry', 'e', entry('remote'));
  await remote.sync();
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = local.putBlob(bytes);
  local.mutate('entry', 'e', entry('local', [], [{ ...asset(), blobHash: hash }]));
  provider.arm(category);
  await expect(local.sync()).rejects.toMatchObject({ category: 'transient' });
  await expect(local.sync()).resolves.toBeDefined();
  const objects = provider.physicalObjects(vault);
  const keys = new Set(objects.map((object) => object.key));
  for (const object of objects.filter((value) => value.key.startsWith('entities/'))) {
    const version = JSON.parse(new TextDecoder().decode(object.body)) as HashedVersion['body'];
    if (version.kind !== 'resolution' && version.kind !== 'join') continue;
    for (const parent of version.parents) {
      expect(keys.has(`entities/${version.entityType}/${version.entityId}/${parent}.json`)).toBe(true);
    }
    for (const recovery of version.recoveries) {
      expect(keys.has(`entities/${recovery.entityType}/${recovery.entityId}/${recovery.versionHash}.json`)).toBe(true);
    }
  }
}

async function revocation(kind: 'journal-deleted' | 'backup-deleted') {
  const provider = new FakeCloudProvider(2);
  const vault = await setup(provider);
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.mutate('entry', 'e', entry('local'));
  await a.sync();
  await b.sync();
  await a.revoke(kind, 'r', 1);
  await b.sync();
  expect(b.isRevoked).toBe(true);
  expect(Object.keys(b.snapshot()).length > 0).toBe(kind === 'backup-deleted');
  expect(provider.physicalObjects(vault).every((item) => item.key.startsWith('revocations/'))).toBe(true);
}

async function concurrentRevocations() {
  const provider = new FakeCloudProvider(20);
  const vault = await setup(provider);
  const devices = ['a', 'b', 'c'].map((id) => new InMemorySyncDevice(id, vault, provider));
  devices.forEach((device) => device.mutate('entry', 'e', entry(device.deviceId)));
  await devices[0].sync();
  for (const kind of ['backup-deleted', 'journal-deleted'] as const) {
    await provider.putImmutable(vault, `revocations/${kind}.json`, canonicalBytes({
      formatVersion: 1, vaultId: 'vault', kind, revocationId: kind, timestamp: 1,
    }));
  }
  provider.setRevocationView('a', ['backup-deleted', 'journal-deleted']);
  provider.setRevocationView('b', ['journal-deleted']);
  provider.setRevocationView('c', ['backup-deleted']);
  for (const device of devices) await device.sync();
  expect(devices.map((device) => Object.keys(device.snapshot()).length > 0)).toEqual([false, false, true]);
  expect(devices.every((device) => device.isRevoked)).toBe(true);
  const snapshots = devices.map((device) => device.snapshot());
  for (const device of devices) {
    await expect(device.sync()).resolves.toMatchObject({ revoked: true, pushed: 0 });
  }
  expect(devices.map((device) => device.snapshot())).toEqual(snapshots);
  expect(provider.physicalObjects(vault).every((object) =>
    object.key.startsWith('revocations/'),
  )).toBe(true);
}

async function seeding(ahead: boolean) {
  const provider = new FakeCloudProvider(200);
  const vault = await setup(provider);
  const device = new InMemorySyncDevice('seed', vault, provider);
  device.seed(Array.from({ length: 120 }, (_, index) => ({
    type: 'entry' as const,
    id: `entry-${index.toString().padStart(3, '0')}`,
    state: entry(`seed-${index}`),
  })));
  await device.sync();
  const id = ahead ? 'entry-090' : 'entry-010';
  device.mutate('entry', id, entry('raced-edit'));
  for (let pass = 0; pass < 5; pass++) await device.sync();
  expect(device.seedingCheckpoint).toBe('entry:entry-119');
  expect(device.snapshot()[`entry:${id}`]).toMatchObject({ content: 'raced-edit' });
  const versions = provider.physicalObjects(vault).filter((object) =>
    object.key.startsWith(`entities/entry/${id}/`),
  );
  expect(versions.length).toBe(ahead ? 1 : 2);
}

function zipRoundTrip() {
  const portableTags = createPortableTags([
    { tag_id: 'tag-id', title: 'Tag', created_at: 1, updated_at: 2, conflict_origin_id: null },
  ] as never);
  const portablePrompts = createPortablePrompts([
    { prompt_id: 'prompt-id', title: 'Prompt', created_at: 1, updated_at: 2, conflict_origin_id: null },
  ] as never);
  const { portableEntries } = createPortableEntries(
    [{ note_id: 'entry-id', text_title: null, text_content: 'Body', mood: null, assets: null, tags: 'tag-id', created_at: 1, updated_at: 2 }] as never,
    new Map([['tag-id', 'Tag']]),
    new Map([['entry-id', [{ asset_id: 'asset-id', owner_type: 'entry', owner_id: 'entry-id', kind: 'photo', local_uri: 'photos/a.jpg', download_state: 'n/a', mime_type: 'image/jpeg', byte_size: 1, width: 1, height: 1, duration_ms: null, blob_hash: blobHash, remote_file_id: null, pending_local_delete_at: null, created_at: 1, updated_at: 2 }]]]) as never,
    new Map([['entry-id', ['tag-id']]]),
  );
  const decoded = JSON.parse(JSON.stringify({ portableTags, portablePrompts, portableEntries }));
  expect(decoded.portableTags[0].tagId).toBe('tag-id');
  expect(decoded.portablePrompts[0].promptId).toBe('prompt-id');
  expect(decoded.portableEntries[0]).toMatchObject({ noteId: 'entry-id', tagIds: ['tag-id'] });
  expect(decoded.portableEntries[0].assets[0].assetId).toBe('asset-id');
}

async function validation(id: string) {
  const root = edit('e', 'root');
  const graph = new VersionGraph('vault', 'entry', 'e');
  if (id === 'child-before-parent-delivery' || id === 'missing-parent') {
    const child = edit('e', 'child', [root.hash]);
    graph.add(child.body, child.hash);
    expect(graph.get(child.hash)?.status).toBe('incomplete');
    if (id === 'child-before-parent-delivery') {
      graph.add(root.body, root.hash);
      expect(graph.get(child.hash)?.status).toBe('complete');
    } else {
      expect(graph.heads()).toEqual([]);
    }
    return;
  }
  if (id === 'corrupt-parent') {
    expect(() => graph.add(root.body, 'b'.repeat(64))).toThrow('filename/hash mismatch');
    return;
  }
  if (id === 'cross-entity-parent') {
    const other = edit('other', 'other');
    expect(() => graph.add(other.body, other.hash)).toThrow('identity');
    return;
  }
  if (id === 'missing-recovery-dependency') {
    graph.add(root.body, root.hash);
    const resolution = createSystemVersion({
      vaultId: 'vault', entityType: 'entry', entityId: 'e', kind: 'resolution',
      parents: [root.hash], state: entry('root'), recoveries: [{ entityType: 'entry', entityId: 'r', versionHash: 'c'.repeat(64) }],
    });
    graph.add(resolution.body, resolution.hash);
    expect(graph.get(resolution.hash)?.status).toBe('incomplete');
    return;
  }
  if (id === 'ancestry-cycle-rejection') {
    // A self-consistent content-addressed cycle cannot be constructed: each
    // filename would have to be known before hashing its body. Both aliases are
    // therefore rejected at hash verification before materialization.
    expect(() => graph.add({ ...root.body, parents: ['d'.repeat(64)] }, 'd'.repeat(64))).toThrow();
    expect(graph.heads()).toEqual([]);
    return;
  }
  const provider = new FakeCloudProvider(20);
  const vault = await setup(provider);
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.seed([{ type: 'tag', id: 't', state: tag('Kind') }, { type: 'entry', id: 'e', state: entry('base', ['t']) }]);
  for (let pass = 0; pass < 3; pass++) { await a.sync(); await b.sync(); }
  a.mutate('tag', 't', null);
  await a.sync();
  b.mutate('entry', 'e', entry('edit', ['t']));
  for (let pass = 0; pass < 4; pass++) { await b.sync(); await a.sync(); }
  const state = a.snapshot()['entry:e'];
  expect(state?.entityType === 'entry' && state.tagIds[0]).not.toBe('t');
}

const runners: Record<string, () => void | Promise<void>> = {
  'tiny-vault': () => {
    const graph = new VersionGraph('vault', 'entry', 'e');
    const one = edit('e', 'one');
    graph.add(one.body, one.hash);
    expect(graph.heads()).toEqual([one.hash]);
  },
  'linear-history': () => ancestry('linear'),
  'symmetric-fork': () => ancestry('symmetric'),
  'asymmetric-fork': () => ancestry('asymmetric'),
  'three-head-fork': () => ancestry('three'),
  'criss-cross-multiple-merge-base': () => ancestry('criss'),
  'set-merge-fork': () => conflict('set'),
  'text-conflict-recovered-copy': () => conflict('text'),
  'scalar-conflict-stored-alternates': () => conflict('scalar'),
  'delete-edit-fork': () => conflict('delete'),
  'raced-double-resolution': () => conflict('raced'),
  'dirty-local-vs-pulled-remote': () => dirtyScenario('upsert'),
  'dirty-local-delete-vs-remote-edit': () => dirtyScenario('delete'),
  'generation-n-plus-one-during-sync': () => dirtyScenario('generation'),
  'clean-then-local-edit-before-apply': () => dirtyScenario('clean-race'),
  'publish-crash-blob': () => publishCrash('blob'),
  'publish-crash-provisional': () => publishCrash('edit'),
  'publish-crash-recovery-init': () => publishCrash('recovery-init'),
  'publish-crash-resolution': () => publishCrash('resolution'),
  'vault-revocation-journal-deleted': () => revocation('journal-deleted'),
  'vault-revocation-backup-deleted': () => revocation('backup-deleted'),
  'concurrent-destructive-actions': concurrentRevocations,
  'initial-seeding-raced-edit': () => seeding(false),
  'initial-seeding-ahead-of-cursor-edit': () => seeding(true),
  'profile-name-photo-conflict': () => conflict('profile'),
  'blob-multiple-obligations': () => {
    expect(canDeleteRetainedMedia({ referenceCount: 0, obligations: [{ completedAt: 1 }, { completedAt: null }] })).toBe(false);
  },
  'zip-v1-stable-identity-roundtrip': zipRoundTrip,
  'child-before-parent-delivery': () => validation('child-before-parent-delivery'),
  'missing-parent': () => validation('missing-parent'),
  'corrupt-parent': () => validation('corrupt-parent'),
  'cross-entity-parent': () => validation('cross-entity-parent'),
  'missing-recovery-dependency': () => validation('missing-recovery-dependency'),
  'ancestry-cycle-rejection': () => validation('ancestry-cycle-rejection'),
  'tombstoned-tag-concurrent-reference': () => validation('tombstoned-tag-concurrent-reference'),
};

test.each(golden.scenarios.map((scenario) => scenario.id))(
  'frozen golden scenario: %s',
  async (id) => {
    const runner = runners[id];
    expect(runner).toBeDefined();
    await runner();
  },
);

test('every frozen scenario has exactly one executable runner', () => {
  expect(Object.keys(runners).sort()).toEqual(
    golden.scenarios.map((scenario) => scenario.id).sort(),
  );
});
