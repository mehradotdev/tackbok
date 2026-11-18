/**
 * Cloud sync v2 (#185): the conflict screens' data (`ui/versions.ts`) on real
 * SQLite: other versions, returned entries and profile versions, and the
 * "Keep this one" and "Got it" writes, which sync like any other write.
 */
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { installSqliteDevices, type SqliteDevice } from './sim/sqliteDevices';

const devices = installSqliteDevices();
const { simMediaFiles } = await import('./sim/v2StoreAdapter');
const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const store = await import('../../src/lib/cloudSync/storage/v2State');
const versions = await import('../../src/lib/cloudSync/ui/versions');
const { absorb } = await import('../../src/lib/cloudSync/v2/compact');
type CloudSyncTransaction =
  import('../../src/lib/cloudSync/storage/repositories').CloudSyncTransaction;

const T = 1_790_000_000_000;
let a: SqliteDevice;
let b: SqliteDevice;

const write = <R>(
  device: SqliteDevice,
  wall: number,
  run: (tx: CloudSyncTransaction) => Promise<R>,
) => devices.on(device, wall, () => repositories.runInCloudSyncTransaction(run));
const on = <R>(device: SqliteDevice, wall: number, run: () => Promise<R>) =>
  devices.on(device, wall, run);
const entry = (id: string, text: string) => ({
  note_id: id,
  text_title: null,
  text_content: text,
  mood: null,
  created_at: T,
  updated_at: T,
  tags: '',
  assets: [],
});

async function syncFrom(device: SqliteDevice, other: SqliteDevice, wall: number) {
  const theirs = await on(other, wall, store.captureSyncState);
  const mine = await on(device, wall, store.captureSyncState);
  const next = absorb(mine.state, theirs.state, {
    device: mine.deviceId,
    wallMs: wall,
  }).state;
  expect(
    await on(device, wall, () => store.applySyncState(mine, next, simMediaFiles)),
  ).not.toBeNull();
}

beforeEach(async () => {
  a = devices.create();
  b = devices.create();
  for (const device of [a, b])
    await write(device, T, (tx) =>
      store.rebuildSyncMetadataInTransaction(tx, 'vault', T),
    );
});
afterEach(() => {
  a.sqlite.close();
  b.sqlite.close();
});

test('two edits of one entry show as versions; "Keep this one" resolves them on both devices', async () => {
  await write(a, T, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'Base'), { now: T }),
  );
  await syncFrom(b, a, T + 1);
  await write(a, T + 2, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'A'), { now: T + 2 }),
  );
  await write(b, T + 3, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'B'), { now: T + 3 }),
  );
  await syncFrom(a, b, T + 4);
  const groups = await on(a, T + 5, versions.listVersionGroups);
  expect(groups).toHaveLength(1);
  expect(groups[0].original.text_content).toBe('B');
  expect(groups[0].versions.map((copy) => copy.text_content)).toEqual(['A']);
  expect(await on(a, T + 5, versions.countSyncChoices)).toBe(1);

  // Keep A's version: one new write, which B takes in.
  await on(a, T + 6, () =>
    versions.keepEntryVersion(groups[0].versions[0].note_id, simMediaFiles),
  );
  expect(await on(a, T + 7, versions.countSyncChoices)).toBe(0);
  await syncFrom(b, a, T + 8);
  expect(b.sqlite.query('SELECT text_content FROM entries').all()).toEqual([
    { text_content: 'A' },
  ]);
  expect(await on(b, T + 9, versions.countSyncChoices)).toBe(0);
});

test('an entry back after a delete is listed until "Got it", which syncs', async () => {
  await write(a, T, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'Base'), { now: T }),
  );
  await syncFrom(b, a, T + 1);
  await write(b, T + 2, (tx) =>
    repositories.deleteEntryInTransaction(tx, 'e1', { now: T + 2 }),
  );
  await write(a, T + 3, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'Edited'), { now: T + 3 }),
  );
  await syncFrom(a, b, T + 4);
  const returned = await on(a, T + 5, versions.listReturnedEntries);
  expect(returned.map((item) => item.entryId)).toEqual(['e1']);
  await on(a, T + 6, () => versions.acknowledgeReturnedEntries(['e1'], simMediaFiles));
  expect(await on(a, T + 7, versions.listReturnedEntries)).toEqual([]);
  await syncFrom(b, a, T + 8);
  expect(b.sqlite.query('SELECT text_content FROM entries').all()).toEqual([
    { text_content: 'Edited' },
  ]);
  expect(await on(b, T + 9, versions.listReturnedEntries)).toEqual([]);
});

test('a profile name changed on two devices offers the other one', async () => {
  await write(a, T, (tx) =>
    repositories.updateProfileInTransaction(tx, { displayName: 'Sam' }, { now: T }),
  );
  await write(b, T + 1, (tx) =>
    repositories.updateProfileInTransaction(
      tx,
      { displayName: 'Samuel' },
      { now: T + 1 },
    ),
  );
  await syncFrom(a, b, T + 2);
  const profile = await on(a, T + 3, versions.listProfileVersions);
  expect(profile.name.map((item) => item.value)).toEqual(['Sam']);
  await on(a, T + 4, () =>
    versions.keepProfileVersion('name', profile.name[0].stamp, simMediaFiles),
  );
  expect(a.sqlite.query('SELECT display_name FROM user_profile').all()).toEqual([
    { display_name: 'Sam' },
  ]);
  expect((await on(a, T + 5, versions.listProfileVersions)).name).toEqual([]);
});
