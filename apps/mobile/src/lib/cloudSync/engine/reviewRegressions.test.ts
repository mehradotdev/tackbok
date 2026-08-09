import { canonicalBytes } from '../codec';
import { VersionGraph } from '../ancestry';
import { createEditVersion } from '../domain/version';
import type { EntryState, TagState } from '../domain/types';
import { PROTOCOL_V1_CAPS } from '../protocol/validationCaps';
import { FakeCloudProvider } from '../providers';
import { InMemorySyncDevice } from './inMemoryEngine';

const entry = (content: string, tags: string[] = [], assets: EntryState['assets'] = []): EntryState => ({
  entityType: 'entry',
  title: content,
  content,
  mood: null,
  tagIds: tags,
  assets,
  createdAt: 1,
  updatedAt: 1,
  conflictOriginId: null,
});

const tag = (title: string): TagState => ({
  entityType: 'tag',
  title,
  createdAt: 1,
  updatedAt: 1,
  conflictOriginId: null,
});

async function setup(pageSize = 50) {
  const provider = new FakeCloudProvider(pageSize);
  await provider.connect();
  const { vault } = await provider.createVaultMarker(
    'vault',
    canonicalBytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId: 'vault' }),
  );
  return { provider, vault };
}

test('unpublishable local media defers the whole entity and preserves dirty state', async () => {
  const { provider, vault } = await setup();
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.mutate('entry', 'e', entry('base'));
  await a.sync();
  await b.sync();
  b.mutate('entry', 'e', entry('local', [], [{
    assetId: 'photo',
    kind: 'photo',
    mimeType: 'image/jpeg',
    byteSize: 3,
    width: 1,
    height: 1,
    durationMs: null,
    blobHash: 'pending',
  }]));
  a.mutate('entry', 'e', entry('remote'));
  await a.sync();
  await b.sync();
  expect(b.snapshot()['entry:e']).toMatchObject({ content: 'local' });
  expect(b.outbox.has('entry:e')).toBe(true);
});

test('one tombstone race creates one stable recovered tag across devices', async () => {
  const { provider, vault } = await setup();
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.seed([
    { type: 'tag', id: 't', state: tag('Kindness') },
    { type: 'entry', id: 'e', state: entry('base', ['t']) },
  ]);
  for (let round = 0; round < 3; round++) { await a.sync(); await b.sync(); }
  a.mutate('tag', 't', null);
  await a.sync();
  b.mutate('entry', 'e', entry('b-edit', ['t']));
  await b.sync();
  a.mutate('entry', 'e', entry('a-edit', ['t']));
  await a.sync();
  for (let round = 0; round < 6; round++) { await a.sync(); await b.sync(); }
  const recoveredTags = Object.entries(a.snapshot()).filter(
    ([key, value]) => key.startsWith('tag:') && value.entityType === 'tag',
  );
  expect(recoveredTags).toHaveLength(1);
  expect(recoveredTags[0][1]).toMatchObject({ title: 'Kindness', conflictOriginId: 't' });
});

test('tag recovery uses the last live rename before a complete tombstone', async () => {
  const { provider, vault } = await setup();
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.seed([
    { type: 'tag', id: 't', state: tag('Original') },
    { type: 'entry', id: 'e', state: entry('base', ['t']) },
  ]);
  for (let round = 0; round < 3; round++) {
    await a.sync();
    await b.sync();
  }

  a.mutate('tag', 't', tag('Renamed'));
  await a.sync();
  a.mutate('tag', 't', null);
  await a.sync();
  b.mutate('entry', 'e', entry('offline edit', ['t']));
  await b.sync();

  const recoveredTags = Object.entries(b.snapshot()).filter(
    ([key, value]) =>
      key.startsWith('tag:') &&
      value.entityType === 'tag' &&
      value.conflictOriginId === 't',
  );
  expect(recoveredTags).toHaveLength(1);
  expect(recoveredTags[0][1]).toMatchObject({ title: 'Renamed' });
  expect((b.snapshot()['entry:e'] as EntryState).tagIds).toEqual([
    recoveredTags[0][0].slice('tag:'.length),
  ]);
});

test('an incomplete tombstone stays parked and cannot trigger tag recovery', async () => {
  const { provider, vault } = await setup();
  const root = createEditVersion({
    vaultId: 'vault',
    entityType: 'tag',
    entityId: 't',
    parents: [],
    state: tag('Original'),
    authorDeviceId: 'remote',
    editSequence: 1,
    authoredAt: 1,
  });
  const tombstone = createEditVersion({
    vaultId: 'vault',
    entityType: 'tag',
    entityId: 't',
    parents: [root.hash],
    state: null,
    deleted: true,
    authorDeviceId: 'remote',
    editSequence: 2,
    authoredAt: 2,
  });
  await provider.putImmutable(
    vault,
    `entities/tag/t/${tombstone.hash}.json`,
    new TextEncoder().encode(tombstone.canonical),
  );

  const device = new InMemorySyncDevice('device', vault, provider);
  device.mutate('entry', 'e', entry('local', ['t']));
  await device.sync();

  expect(device.graphs.get('tag:t')?.get(tombstone.hash)?.status).toBe('incomplete');
  expect((device.snapshot()['entry:e'] as EntryState).tagIds).toEqual(['t']);
  expect(
    Object.values(device.snapshot()).filter(
      (value) => value.entityType === 'tag' && value.conflictOriginId === 't',
    ),
  ).toHaveLength(0);
});

test('corrupt remote objects quarantine one entity without aborting the pull pass', async () => {
  const { provider, vault } = await setup();
  await provider.putImmutable(
    vault,
    `entities/entry/bad/${'a'.repeat(64)}.json`,
    new TextEncoder().encode('{'),
  );
  const valid = createEditVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'good',
    parents: [],
    state: entry('good'),
    authorDeviceId: 'remote',
    editSequence: 1,
    authoredAt: 1,
  });
  await provider.putImmutable(
    vault,
    `entities/entry/good/${valid.hash}.json`,
    new TextEncoder().encode(valid.canonical),
  );
  const device = new InMemorySyncDevice('device', vault, provider);
  await expect(device.sync()).resolves.toMatchObject({ pulled: 2 });
  expect(device.snapshot()['entry:good']).toMatchObject({ content: 'good' });
  expect(device.degradedEntities.has('entry:bad')).toBe(true);
});

test('change-feed ingest enforces the per-entity fetched dependency byte budget', async () => {
  const { provider, vault } = await setup();
  const remote = createEditVersion({
    vaultId: 'vault',
    entityType: 'entry',
    entityId: 'capped',
    parents: [],
    state: entry('remote'),
    authorDeviceId: 'remote',
    editSequence: 1,
    authoredAt: 1,
  });
  await provider.putImmutable(
    vault,
    `entities/entry/capped/${remote.hash}.json`,
    new TextEncoder().encode(remote.canonical),
  );
  const device = new InMemorySyncDevice('device', vault, provider);
  const graph = new VersionGraph('vault', 'entry', 'capped');
  graph.recordFetchedDependency(
    'f'.repeat(64),
    PROTOCOL_V1_CAPS.dependencyBytesPerEntity,
  );
  device.graphs.set('entry:capped', graph);

  await expect(device.sync()).resolves.toMatchObject({ pulled: 1 });
  expect(device.degradedEntities.get('entry:capped')).toBe(
    'Dependency fetch byte cap exceeded',
  );
  expect(device.snapshot()['entry:capped']).toBeUndefined();
});

test('entities-per-pass defers excess valid work and resumes from its cursor', async () => {
  const { provider, vault } = await setup(PROTOCOL_V1_CAPS.entitiesPerPass + 10);
  provider.faults.reverseListings = true;
  for (let index = 0; index <= PROTOCOL_V1_CAPS.entitiesPerPass; index++) {
    const id = `entry-${index.toString().padStart(3, '0')}`;
    const version = createEditVersion({
      vaultId: 'vault',
      entityType: 'entry',
      entityId: id,
      parents: [],
      state: entry(id),
      authorDeviceId: 'remote',
      editSequence: index + 1,
      authoredAt: index + 1,
    });
    await provider.putImmutable(
      vault,
      `entities/entry/${id}/${version.hash}.json`,
      new TextEncoder().encode(version.canonical),
    );
  }
  const device = new InMemorySyncDevice('device', vault, provider);
  expect((await device.sync()).pulled).toBe(PROTOCOL_V1_CAPS.entitiesPerPass);
  expect(Object.keys(device.snapshot())).toHaveLength(PROTOCOL_V1_CAPS.entitiesPerPass);
  expect((await device.sync()).pulled).toBe(1);
  expect(Object.keys(device.snapshot())).toHaveLength(PROTOCOL_V1_CAPS.entitiesPerPass + 1);
});

test('checkpointed seeding drains each batch and does not duplicate raced edits', async () => {
  const { provider, vault } = await setup(200);
  const device = new InMemorySyncDevice('device', vault, provider);
  device.seed(
    Array.from({ length: 120 }, (_, index) => ({
      type: 'entry' as const,
      id: `entry-${index.toString().padStart(3, '0')}`,
      state: entry(`seed-${index}`),
    })),
  );
  await device.sync();
  expect(device.seedingCheckpoint).toBeNull();
  device.mutate('entry', 'entry-010', entry('behind-cursor-edit'));
  await device.sync();
  expect(device.seedingCheckpoint).toBeNull();
  device.mutate('entry', 'entry-090', entry('ahead-of-cursor-edit'));
  await device.sync();
  expect(device.seedingCheckpoint).toBe('entry:entry-049');
  await device.sync();
  expect(device.seedingCheckpoint).toBe('entry:entry-099');
  await device.sync();
  expect(device.seedingCheckpoint).toBe('entry:entry-119');
  expect(device.snapshot()['entry:entry-010']).toMatchObject({ content: 'behind-cursor-edit' });
  expect(device.snapshot()['entry:entry-090']).toMatchObject({ content: 'ahead-of-cursor-edit' });
  expect(
    provider
      .physicalObjects(vault)
      .filter((object) => object.key.startsWith('entities/entry/entry-090/')),
  ).toHaveLength(1);
});

test('concurrent revocation markers obey each device observed view', async () => {
  const { provider, vault } = await setup();
  const devices = ['a', 'b', 'c'].map(
    (id) => new InMemorySyncDevice(id, vault, provider),
  );
  for (const device of devices) device.mutate('entry', 'e', entry(device.deviceId));
  await devices[0].sync();
  await provider.putImmutable(
    vault,
    'revocations/backup.json',
    canonicalBytes({
      formatVersion: 1,
      vaultId: 'vault',
      kind: 'backup-deleted',
      revocationId: 'backup',
      timestamp: 1,
    }),
  );
  await provider.putImmutable(
    vault,
    'revocations/journal.json',
    canonicalBytes({
      formatVersion: 1,
      vaultId: 'vault',
      kind: 'journal-deleted',
      revocationId: 'journal',
      timestamp: 2,
    }),
  );
  provider.setRevocationView('a', ['backup-deleted', 'journal-deleted']);
  provider.setRevocationView('b', ['journal-deleted']);
  provider.setRevocationView('c', ['backup-deleted']);
  await devices[0].sync();
  await devices[1].sync();
  await devices[2].sync();
  expect(devices.every((device) => device.isRevoked)).toBe(true);
  expect(Object.keys(devices[0].snapshot())).toHaveLength(0);
  expect(Object.keys(devices[1].snapshot())).toHaveLength(0);
  expect(Object.keys(devices[2].snapshot()).length).toBeGreaterThan(0);
});
