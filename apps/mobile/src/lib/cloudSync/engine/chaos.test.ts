import { canonicalBytes } from '../codec';
import type { EntryState, TagState } from '../domain/types';
import { FakeCloudProvider } from '../providers';
import { InMemorySyncDevice } from './inMemoryEngine';

const entry = (content: string, tags: string[] = []): EntryState => ({
  entityType: 'entry',
  title: content,
  content,
  mood: null,
  tagIds: tags,
  assets: [],
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

async function setup(deviceCount = 3) {
  const provider = new FakeCloudProvider(2);
  await provider.connect();
  const { vault } = await provider.createVaultMarker(
    'vault',
    canonicalBytes({
      magic: 'tackbok-vault',
      formatVersion: 1,
      vaultId: 'vault',
    }),
  );
  const devices = Array.from(
    { length: deviceCount },
    (_, index) => new InMemorySyncDevice(`device-${index}`, vault, provider),
  );
  return { provider, vault, devices };
}

async function converge(devices: InMemorySyncDevice[], rounds = 4): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    for (const device of devices) {
      try {
        await device.sync();
      } catch {
        await device.sync();
      }
    }
  }
}

test('initial seeding and two/three-device concurrent edits converge under duplicates and reordering', async () => {
  const { provider, devices } = await setup();
  devices[0].seed([{ type: 'entry', id: 'entry', state: entry('seed') }]);
  await converge(devices, 2);
  expect(devices.map((device) => device.snapshot())).toEqual([
    devices[0].snapshot(),
    devices[0].snapshot(),
    devices[0].snapshot(),
  ]);

  devices[0].mutate('entry', 'entry', entry('alpha', ['a']));
  devices[1].mutate('entry', 'entry', entry('beta', ['b']));
  devices[2].mutate('entry', 'entry', entry('gamma', ['c']));
  provider.faults.reverseListings = true;
  provider.faults.duplicateNextPut = true;
  await converge(devices, 5);
  const expected = devices[0].snapshot();
  expect(devices[1].snapshot()).toEqual(expected);
  expect(devices[2].snapshot()).toEqual(expected);
  const liveEntryTexts = Object.values(expected)
    .filter((value) => value.entityType === 'entry')
    .map((value) => (value.entityType === 'entry' ? value.content : null));
  expect(new Set(liveEntryTexts)).toEqual(new Set(['alpha', 'beta', 'gamma']));
});

test('Apply CAS preserves a local save raced between resolve and apply', async () => {
  const { devices } = await setup(2);
  devices[0].mutate('entry', 'entry', entry('remote'));
  await devices[0].sync();
  const result = await devices[1].sync({
    beforeApply: (device) => device.mutate('entry', 'entry', entry('newest-local')),
  });
  expect(result.skippedByCas).toBe(1);
  expect(devices[1].snapshot()['entry:entry']).toMatchObject({ content: 'newest-local' });
  expect(devices[1].outbox.size).toBe(1);
  await converge(devices, 4);
  expect(devices[0].snapshot()).toEqual(devices[1].snapshot());
});

test('an entry racing a tag tombstone deterministically recovers and references a live tag', async () => {
  const { devices } = await setup(2);
  devices[0].seed([
    { type: 'tag', id: 'tag', state: tag('Kindness') },
    { type: 'entry', id: 'entry', state: entry('seed', ['tag']) },
  ]);
  await converge(devices, 3);
  devices[0].mutate('tag', 'tag', null);
  await devices[0].sync();
  devices[1].mutate('entry', 'entry', entry('offline edit', ['tag']));
  await converge(devices, 5);

  expect(devices[0].snapshot()).toEqual(devices[1].snapshot());
  const snapshot = devices[0].snapshot();
  const restoredEntry = snapshot['entry:entry'];
  expect(restoredEntry?.entityType).toBe('entry');
  if (restoredEntry?.entityType !== 'entry') throw new Error('entry missing');
  expect(restoredEntry.tagIds).toHaveLength(1);
  const recoveredId = restoredEntry.tagIds[0];
  expect(recoveredId).not.toBe('tag');
  expect(snapshot[`tag:${recoveredId}`]).toMatchObject({
    entityType: 'tag',
    title: 'Kindness',
    conflictOriginId: 'tag',
  });
});

test.each([
  ['backup-deleted' as const, true],
  ['journal-deleted' as const, false],
])('revocation %s dominates a stale offline writer in every scheduled order', async (kind, keepsLocal) => {
  for (const order of [
    ['revoke', 'stale-sync'],
    ['stale-check', 'revoke', 'stale-sync'],
  ]) {
    const { provider, vault, devices } = await setup(2);
    devices[0].mutate('entry', 'entry', entry('seed'));
    await converge(devices, 2);
    devices[1].mutate('entry', 'entry', entry('stale-offline'));
    if (order[0] === 'stale-check') await devices[1].sync();
    await devices[0].revoke(kind, `revocation-${kind}`, 10);
    await devices[1].sync();
    expect(devices[1].isRevoked).toBe(true);
    expect(Object.keys(devices[1].snapshot()).length > 0).toBe(keepsLocal);
    expect(
      provider
        .physicalObjects(vault)
        .every((object) => object.key.startsWith('revocations/')),
    ).toBe(true);
  }
});

test('seeded chaos converges after interrupted at-least-once pushes, deletes, and restarts', async () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { provider, devices } = await setup(3);
    devices[0].mutate('entry', 'entry', entry('root'));
    await converge(devices, 2);
    let value = seed * 0x9e3779b1;
    const random = () => {
      value = (Math.imul(value ^ (value >>> 16), 0x45d9f3b) + 0x27100001) | 0;
      return (value >>> 0) / 0x100000000;
    };
    for (let operation = 0; operation < 15; operation++) {
      const device = devices[Math.floor(random() * devices.length)];
      const content = `seed-${seed}-op-${operation}-device-${device.deviceId}`;
      device.mutate(
        'entry',
        'entry',
        random() < 0.15 ? null : entry(content, [`tag-${operation % 3}`]),
      );
      if (random() < 0.35) provider.faults.duplicateNextPut = true;
      if (random() < 0.15) provider.faults.failNextPutAfterStore = true;
      try {
        await devices[Math.floor(random() * devices.length)].sync();
      } catch {
        // Simulated process/network interruption. The next pass must recover.
      }
    }
    await converge(devices, 8);
    expect(devices[1].snapshot()).toEqual(devices[0].snapshot());
    expect(devices[2].snapshot()).toEqual(devices[0].snapshot());
    expect(devices.every((device) => device.outbox.size === 0)).toBe(true);
  }
});
