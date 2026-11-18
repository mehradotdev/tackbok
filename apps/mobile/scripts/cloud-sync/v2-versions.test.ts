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

  // Keep A's version: one new write, which B takes in. It counts as a
  // local change waiting to sync, like an edit.
  a.sqlite.run(
    "INSERT INTO cloud_vault (vault_id, provider_kind, device_id, status, created_at, updated_at) VALUES ('vault', 'google-drive', 'connection', 'idle', 1, 1)",
  );
  const seen = [groups[0].original, ...groups[0].versions];
  await on(a, T + 6, () =>
    versions.keepEntryVersion(groups[0].versions[0].note_id, seen, simMediaFiles),
  );
  expect(await on(a, T + 7, versions.countSyncChoices)).toBe(0);
  expect(a.sqlite.query('SELECT status FROM cloud_vault').all()).toEqual([
    { status: 'dirty' },
  ]);
  expect(
    a.sqlite
      .query(
        'SELECT journal_generation - settled_generation AS waiting FROM cloud_sync_state',
      )
      .all(),
  ).toEqual([{ waiting: 1 }]);
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
  expect(profile.name.shown).toBe('Samuel');
  expect(profile.name.others.map((item) => item.value)).toEqual(['Sam']);
  await on(a, T + 4, () =>
    versions.keepProfileChoice(
      'name',
      profile.name.others[0].stamp,
      profile.name,
      simMediaFiles,
    ),
  );
  expect(a.sqlite.query('SELECT display_name FROM user_profile').all()).toEqual([
    { display_name: 'Sam' },
  ]);
  expect((await on(a, T + 5, versions.listProfileVersions)).name.others).toEqual([]);
});

test('"Use" and "Keep current" write nothing if a name arrived after the card listed them', async () => {
  const c = devices.create();
  await write(c, T, (tx) => store.rebuildSyncMetadataInTransaction(tx, 'vault', T));
  for (const [device, name, wall] of [
    [a, 'Sam', T],
    [b, 'Samuel', T + 1],
  ] as const)
    await write(device, wall, (tx) =>
      repositories.updateProfileInTransaction(tx, { displayName: name }, { now: wall }),
    );
  await syncFrom(a, b, T + 2);
  const listed = (await on(a, T + 3, versions.listProfileVersions)).name;
  // While the choice is open, a third device's name arrives.
  await write(c, T + 4, (tx) =>
    repositories.updateProfileInTransaction(tx, { displayName: 'S.' }, { now: T + 4 }),
  );
  await syncFrom(a, c, T + 5);
  for (const chosen of [listed.others[0].stamp, null])
    await expect(
      on(a, T + 6, () =>
        versions.keepProfileChoice('name', chosen, listed, simMediaFiles),
      ),
    ).rejects.toBeInstanceOf(versions.VersionsChangedError);
  const after = (await on(a, T + 7, versions.listProfileVersions)).name;
  expect([after.shown, ...after.others.map((item) => item.value)].sort()).toEqual([
    'S.',
    'Sam',
    'Samuel',
  ]);
  // Choosing from the refreshed list works.
  await on(a, T + 8, () =>
    versions.keepProfileChoice('name', null, after, simMediaFiles),
  );
  expect((await on(a, T + 9, versions.listProfileVersions)).name.others).toEqual([]);
  c.sqlite.close();
});

test('"Keep this one" writes nothing if a version arrived after the screen listed them', async () => {
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
  const [group] = await on(a, T + 5, versions.listVersionGroups);
  const seen = [group.original, ...group.versions];
  // While the confirmation is open, B edits again and A takes it in.
  await write(b, T + 6, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'C'), { now: T + 6 }),
  );
  await syncFrom(a, b, T + 7);
  const before = (await on(a, T + 8, versions.listOtherVersions)).get('e1');
  await expect(
    on(a, T + 9, () =>
      versions.keepEntryVersion(group.original.note_id, seen, simMediaFiles),
    ),
  ).rejects.toBeInstanceOf(versions.VersionsChangedError);
  expect((await on(a, T + 10, versions.listOtherVersions)).get('e1')).toEqual(before);
  // Keeping what the refreshed list shows works.
  const [fresh] = await on(a, T + 11, versions.listVersionGroups);
  await on(a, T + 12, () =>
    versions.keepEntryVersion(
      fresh.original.note_id,
      [fresh.original, ...fresh.versions],
      simMediaFiles,
    ),
  );
  expect(a.sqlite.query('SELECT text_content FROM entries').all()).toEqual([
    { text_content: 'C' },
  ]);
  expect(await on(a, T + 13, versions.countSyncChoices)).toBe(0);
});

test('a profile photo removed on one device and changed on another: "no photo" can be kept', async () => {
  const hashMedia = (device: SqliteDevice) =>
    device.sqlite.run(
      "UPDATE media_assets SET blob_hash = substr(lower(hex(asset_id)) || '0000000000000000000000000000000000000000000000000000000000000000', 1, 64), byte_size = 10 WHERE blob_hash IS NULL",
    );
  await write(a, T, (tx) =>
    repositories.updateProfileInTransaction(
      tx,
      { photoUri: 'photos/me.jpg', photoAssetId: 'me' },
      { now: T },
    ),
  );
  hashMedia(a);
  await syncFrom(b, a, T + 1);
  await write(b, T + 2, (tx) =>
    repositories.updateProfileInTransaction(tx, { photoUri: null }, { now: T + 2 }),
  );
  await write(a, T + 3, (tx) =>
    repositories.updateProfileInTransaction(
      tx,
      { photoUri: 'photos/me2.jpg', photoAssetId: 'me2' },
      { now: T + 3 },
    ),
  );
  hashMedia(a);
  await syncFrom(a, b, T + 4);
  const photo = (await on(a, T + 5, versions.listProfileVersions)).photo;
  expect(photo.shown).toBe('me2');
  expect(photo.others.map((other) => other.value)).toEqual([null]);
  const waiting = () =>
    a.sqlite
      .query(
        'SELECT journal_generation - settled_generation AS waiting FROM cloud_sync_state',
      )
      .all();
  const before = waiting();
  // A choice made from an out-of-date listing writes nothing.
  await expect(
    on(a, T + 6, () =>
      versions.keepProfileChoice(
        'photo',
        photo.others[0].stamp,
        { ...photo, others: [] },
        simMediaFiles,
      ),
    ),
  ).rejects.toBeInstanceOf(versions.VersionsChangedError);
  expect(waiting()).toEqual(before);
  await on(a, T + 7, () =>
    versions.keepProfileChoice('photo', photo.others[0].stamp, photo, simMediaFiles),
  );
  expect(a.sqlite.query('SELECT photo_asset_id FROM user_profile').all()).toEqual([
    { photo_asset_id: null },
  ]);
  expect((await on(a, T + 8, versions.listProfileVersions)).photo.others).toEqual([]);
  // Nothing left to choose: a late "Keep current" is refused, not a silent no-op.
  await expect(
    on(a, T + 9, () => versions.keepProfileChoice('photo', null, photo, simMediaFiles)),
  ).rejects.toBeInstanceOf(versions.VersionsChangedError);
});

test('the Home notice: seen choices sync, and only a new value from another device brings it back', async () => {
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
  const noticeStamps = async (device: SqliteDevice, wall: number) =>
    on(device, wall, async () =>
      [...(await versions.listOtherVersions()).values()].flatMap((list) =>
        list.flatMap((other) => [other.stamp, other.shownStamp]),
      ),
    );
  const isNew = async (device: SqliteDevice, wall: number) => {
    const stamps = await noticeStamps(device, wall);
    return versions.isNewChoice(stamps, await on(device, wall, versions.readNoticeSeen));
  };
  expect(await isNew(a, T + 5)).toBe(true);

  // Hidden on A: seen there, and on B once it syncs.
  const stamps = await noticeStamps(a, T + 6);
  await on(a, T + 6, () => versions.markConflictsSeen(stamps, simMediaFiles));
  expect(await isNew(a, T + 7)).toBe(false);
  await syncFrom(b, a, T + 8);
  expect(await isNew(b, T + 9)).toBe(false);

  // Seen again: nothing to write.
  const generation = () =>
    a.sqlite.query('SELECT ctx_json FROM sync_device').all() as unknown[];
  const before = generation();
  await on(a, T + 10, () => versions.markConflictsSeen(stamps, simMediaFiles));
  expect(generation()).toEqual(before);

  // A local edit of the shown version is not news on the device that made it.
  await write(a, T + 11, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'A2'), { now: T + 11 }),
  );
  expect((await on(a, T + 12, versions.listOtherVersions)).get('e1')).toHaveLength(1);
  expect(await isNew(a, T + 12)).toBe(false);

  // A new version from another device is.
  await write(b, T + 13, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'B2'), { now: T + 13 }),
  );
  await syncFrom(a, b, T + 14);
  expect(await isNew(a, T + 15)).toBe(true);

  // Seen stamps no longer in an open choice are dropped when it is written again.
  const open = await noticeStamps(a, T + 16);
  await on(a, T + 16, () => versions.markConflictsSeen(open, simMediaFiles));
  const seen = await on(a, T + 17, versions.readNoticeSeen);
  expect([...seen.seen].sort()).toEqual([...new Set(open.map(versions.stampKey))].sort());
  // The first edits' stamps were replaced, so they are no longer kept.
  for (const stamp of stamps)
    if (!open.some((other) => versions.stampKey(other) === versions.stampKey(stamp)))
      expect(seen.seen.has(versions.stampKey(stamp))).toBe(false);
});

test('marking one choice seen keeps the other choices seen', async () => {
  await write(a, T, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'Base'), { now: T }),
  );
  await syncFrom(b, a, T + 1);
  for (const [device, text, name, wall] of [
    [a, 'A', 'Sam', T + 2],
    [b, 'B', 'Samuel', T + 3],
  ] as const) {
    await write(device, wall, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', text), { now: wall }),
    );
    await write(device, wall, (tx) =>
      repositories.updateProfileInTransaction(tx, { displayName: name }, { now: wall }),
    );
  }
  await syncFrom(a, b, T + 4);
  const name = (await on(a, T + 5, versions.listProfileVersions)).name;
  const nameStamps = [name.shownStamp!, ...name.others.map((other) => other.stamp)];
  const entryStamps = [
    ...(await on(a, T + 5, versions.listOtherVersions)).values(),
  ].flatMap((list) => list.flatMap((other) => [other.stamp, other.shownStamp]));
  await on(a, T + 6, () => versions.markConflictsSeen(nameStamps, simMediaFiles));
  // Only the entries' stamps are passed now, as when Other versions opens.
  await on(a, T + 7, () => versions.markConflictsSeen(entryStamps, simMediaFiles));
  const seen = await on(a, T + 8, versions.readNoticeSeen);
  expect(versions.isNewChoice(nameStamps, seen)).toBe(false);
  expect(versions.isNewChoice(entryStamps, seen)).toBe(false);
});

test('"Keep both" on two devices at once makes one new entry, and resolves the versions', async () => {
  await write(a, T, (tx) =>
    repositories.upsertEntryInTransaction(
      tx,
      { ...entry('e1', 'Base'), mood: 'HAPPY', text_title: 'Walk' },
      { now: T },
    ),
  );
  await syncFrom(b, a, T + 1);
  await write(a, T + 2, (tx) =>
    repositories.upsertEntryInTransaction(
      tx,
      { ...entry('e1', 'A'), mood: 'HAPPY', text_title: 'Walk' },
      { now: T + 2 },
    ),
  );
  await write(b, T + 3, (tx) =>
    repositories.upsertEntryInTransaction(
      tx,
      { ...entry('e1', 'B'), mood: 'HAPPY', text_title: 'Walk' },
      { now: T + 3 },
    ),
  );
  await syncFrom(a, b, T + 4);
  await syncFrom(b, a, T + 5);
  // Both devices list B shown and A as the other version; both keep both.
  const made: string[] = [];
  for (const [device, wall] of [
    [a, T + 6],
    [b, T + 7],
  ] as const) {
    const [group] = await on(device, wall, versions.listVersionGroups);
    expect(group.original.text_content).toBe('B');
    made.push(
      await on(device, wall, () =>
        versions.keepBothVersions(
          group.versions[0].note_id,
          [group.original, ...group.versions],
          simMediaFiles,
        ),
      ),
    );
  }
  expect(made[0]).toBe(made[1]);
  await syncFrom(a, b, T + 8);
  await syncFrom(b, a, T + 9);
  for (const device of [a, b]) {
    expect(
      device.sqlite
        .query(
          'SELECT note_id, text_title, text_content, mood FROM entries ORDER BY text_content',
        )
        .all(),
    ).toEqual([
      { note_id: made[0], text_title: 'Walk', text_content: 'A', mood: 'HAPPY' },
      { note_id: 'e1', text_title: 'Walk', text_content: 'B', mood: 'HAPPY' },
    ]);
    expect(await on(device, T + 10, versions.countSyncChoices)).toBe(0);
  }
});

test('"Keep both" writes nothing if a version arrived after the screen listed them', async () => {
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
  const [group] = await on(a, T + 5, versions.listVersionGroups);
  await write(b, T + 6, (tx) =>
    repositories.upsertEntryInTransaction(tx, entry('e1', 'C'), { now: T + 6 }),
  );
  await syncFrom(a, b, T + 7);
  await expect(
    on(a, T + 8, () =>
      versions.keepBothVersions(
        group.versions[0].note_id,
        [group.original, ...group.versions],
        simMediaFiles,
      ),
    ),
  ).rejects.toBeInstanceOf(versions.VersionsChangedError);
  expect(a.sqlite.query('SELECT COUNT(*) AS n FROM entries').all()).toEqual([{ n: 1 }]);
});

test('a choice on an entry deleted meanwhile is refused as changed, writing nothing', async () => {
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
  const [group] = await on(a, T + 5, versions.listVersionGroups);
  const seen = [group.original, ...group.versions];
  // B, having seen both versions, deletes the entry; A takes it in.
  await syncFrom(b, a, T + 6);
  await write(b, T + 7, (tx) =>
    repositories.deleteEntryInTransaction(tx, 'e1', { now: T + 7 }),
  );
  await syncFrom(a, b, T + 8);
  expect(a.sqlite.query('SELECT COUNT(*) AS n FROM entries').all()).toEqual([{ n: 0 }]);
  for (const choose of [
    async () =>
      void (await versions.keepBothVersions(
        group.versions[0].note_id,
        seen,
        simMediaFiles,
      )),
    () => versions.keepEntryVersion(group.original.note_id, seen, simMediaFiles),
  ])
    await expect(on(a, T + 9, choose)).rejects.toBeInstanceOf(
      versions.VersionsChangedError,
    );
  expect(a.sqlite.query('SELECT COUNT(*) AS n FROM entries').all()).toEqual([{ n: 0 }]);
});
