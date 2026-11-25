/**
 * Cloud sync v2 engine (#185, P6): passes against real SQLite (every
 * migration, the app's repositories) and the fake provider shared by the
 * devices of one vault.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  BunSyncDatabase,
  installSqliteDevices,
  type SqliteDevice,
} from './sim/sqliteDevices';

const devices = installSqliteDevices();
const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const { resetSyncIdentityInTransaction } =
  await import('../../src/lib/cloudSync/storage/syncStamps');
const { FakeSnapshotProvider, MemorySnapshotMediaStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/fakes');
const { SQLiteSyncStateStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/sqliteState');
const {
  V2SyncEngine,
  ACK_INTERVAL_MS,
  MEDIA_UPLOAD_CONCURRENCY,
  NO_READABLE_HEAD,
  removeUnreadableHeads,
} = await import('../../src/lib/cloudSync/snapshot/sync/v2Engine');
const { SnapshotProviderError } =
  await import('../../src/lib/cloudSync/snapshot/sync/types');
const { simMediaFiles } = await import('./sim/v2StoreAdapter');
const { canonicalState, decodeEnvelope } =
  await import('../../src/lib/cloudSync/v2/codec');
const { continueAsNewDevice } =
  await import('../../src/lib/cloudSync/snapshot/sync/newDevice');
const { AssetType } = await import('../../src/types');
const { backupHistory } = await import('../../src/lib/cloudSync/snapshot/sync/retention');
type Provider = InstanceType<typeof FakeSnapshotProvider>;
type SyncProgressListener =
  import('../../src/lib/cloudSync/snapshot/sync/types').SyncProgressListener;
type SyncProgressReport =
  import('../../src/lib/cloudSync/snapshot/sync/types').SyncProgressReport;
type CloudSyncTransaction =
  import('../../src/lib/cloudSync/storage/repositories').CloudSyncTransaction;

const VAULT = 'vault-engine';
const T = 1_790_000_000_000;
const DAY = 86_400_000;

interface Device {
  database: SqliteDevice;
  engine: InstanceType<typeof V2SyncEngine>;
  stateStore: InstanceType<typeof SQLiteSyncStateStore>;
}

let provider: Provider;
let blobs: InstanceType<typeof MemorySnapshotMediaStore>;
let opened: Device[] = [];
let clock = T;

function device(
  options: {
    database?: SqliteDevice;
    codeVersion?: string;
    at?: (point: string) => void;
    progress?: SyncProgressListener;
  } = {},
): Device {
  const database = options.database ?? devices.create();
  const stateStore = new SQLiteSyncStateStore(new BunSyncDatabase(database.sqlite));
  const engine = new V2SyncEngine({
    vaultId: VAULT,
    stateKey: 'connection',
    stateStore,
    provider,
    mediaStore: blobs,
    files: simMediaFiles,
    codeVersion: options.codeVersion,
    hooks:
      options.at || options.progress
        ? { at: options.at, progress: options.progress }
        : undefined,
  });
  const created = { database, engine, stateStore };
  opened.push(created);
  return created;
}

const sync = (target: Device) =>
  devices.on(target.database, clock, () => target.engine.sync());
const write = <T>(target: Device, operation: (tx: CloudSyncTransaction) => Promise<T>) =>
  devices.on(target.database, clock, () =>
    repositories.runInCloudSyncTransaction(operation),
  );
const addEntry = (target: Device, id: string, fields: Record<string, unknown> = {}) =>
  write(target, (tx) =>
    repositories.upsertEntryInTransaction(
      tx,
      {
        note_id: id,
        text_title: null,
        text_content: `Text ${id}`,
        mood: null,
        created_at: T,
        updated_at: T,
        tags: '',
        assets: [],
        ...fields,
      },
      { now: clock },
    ),
  );
const texts = (target: Device) =>
  (
    target.database.sqlite
      .query('SELECT note_id, text_content FROM entries ORDER BY note_id')
      .all() as { note_id: string; text_content: string }[]
  ).map((row) => `${row.note_id}:${row.text_content}`);
/** Provider requests made by `operation`. */
async function requests(operation: () => Promise<unknown>): Promise<string[]> {
  const before = provider.requests.length;
  await operation();
  return provider.requests.slice(before);
}
const deviceIdOf = (target: Device) =>
  (
    target.database.sqlite
      .query("SELECT device_id FROM sync_device WHERE id = 'self'")
      .get() as {
      device_id: string;
    }
  ).device_id;
/** The snapshot this device's head points to. */
const headSnapshot = (target: Device) =>
  provider
    .physicalHeads(VAULT)
    .find((listedHead) => listedHead.head?.deviceId === deviceIdOf(target))!.head!
    .snapshotId;
/** Every text an entry holds: the shown one and its other versions. */
const allTexts = (target: Device, id: string) =>
  [
    ...(
      target.database.sqlite
        .query('SELECT text_content AS v FROM entries WHERE note_id = ?')
        .all(id) as { v: string }[]
    ).map((row) => row.v),
    ...(
      target.database.sqlite
        .query(
          "SELECT value_json AS v FROM sync_field_values WHERE entity_id = ? AND field = 'text'",
        )
        .all(id) as { v: string }[]
    ).map((row) => JSON.parse(row.v) as string),
  ].sort();
const newDevice = (target: Device, reason: 'another-install' | 'clock-ahead') =>
  devices.on(target.database, clock, () =>
    continueAsNewDevice({
      vaultId: VAULT,
      reason,
      provider,
      files: simMediaFiles,
      now: clock,
    }),
  );
/** IDs the state on this device records as retired. */
const retiredOf = (target: Device) => {
  const row = target.database.sqlite
    .query(
      "SELECT ext_json FROM sync_records WHERE entity_type = 'profile' AND entity_id = 'profile'",
    )
    .get() as { ext_json: string } | null;
  const items = row
    ? ((JSON.parse(row.ext_json) as Record<string, { v: Record<string, number> }[]>)[
        'retired-devices'
      ] ?? [])
    : [];
  return [...new Set(items.flatMap((item) => Object.keys(item.v)))].sort();
};
/** As the app's launch check does before any engine runs (`installBinding.ts`). */
const bindInstall = (target: Device) =>
  target.database.sqlite.run(
    "UPDATE sync_device SET install_id = 'install' WHERE id = 'self'",
  );
const pendingOf = (target: Device) =>
  JSON.parse(
    (
      target.database.sqlite
        .query("SELECT retired_json FROM sync_device WHERE id = 'self'")
        .get() as { retired_json: string }
    ).retired_json,
  ) as { vaultId: string; deviceId: string }[];
const count = (list: string[], name: string) =>
  list.filter((item) => item === name).length;

beforeEach(() => {
  provider = new FakeSnapshotProvider();
  blobs = new MemorySnapshotMediaStore();
  clock = T;
});
afterEach(() => {
  for (const { database } of opened) database.sqlite.close();
  opened = [];
});

describe('passes', () => {
  test('a device publishes as soon as it joins, even with nothing written', async () => {
    const a = device();
    const result = await sync(a);
    expect(result.status).toBe('published');
    const [listed] = provider.physicalHeads(VAULT);
    expect(listed.head).toMatchObject({ format: 'tackbok-head', major: 2, required: [] });
  });

  test('nothing changed: no snapshot is downloaded or uploaded', async () => {
    const a = device();
    const b = device();
    await addEntry(a, 'e1');
    await sync(a);
    expect((await sync(b)).status).toBe('published');
    // A takes in B's acknowledgement once; after that both are quiet.
    await sync(a);
    for (const target of [a, b]) {
      clock += 1000;
      const made = await requests(() => sync(target));
      expect(count(made, 'download-snapshot')).toBe(0);
      expect(count(made, 'upload-snapshot')).toBe(0);
      expect(count(made, 'update-head')).toBe(0);
    }
    expect(texts(b)).toEqual(['e1:Text e1']);
  });

  test('only heads that changed are downloaded', async () => {
    const [a, b, c] = [device(), device(), device()];
    for (const target of [a, b, c]) await sync(target);
    for (const target of [a, b, c]) await sync(target);
    clock += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    const made = await requests(() => sync(c));
    expect(count(made, 'download-snapshot')).toBe(1);
    expect(texts(c)).toEqual(['e1:Text e1']);
  });

  test('a device that only pulls acknowledges at most once a day', async () => {
    const a = device();
    const b = device();
    await sync(a);
    await sync(b);
    await sync(a);
    clock += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    expect((await sync(b)).status).toBe('pulled');
    clock += ACK_INTERVAL_MS;
    expect((await sync(b)).status).toBe('published');
  });

  test('concurrent edits of one entry are kept as versions on both devices', async () => {
    const a = device();
    const b = device();
    await addEntry(a, 'e1', { text_content: 'Base' });
    await sync(a);
    await sync(b);
    clock += 1000;
    await addEntry(a, 'e1', { text_content: 'From A' });
    // Later, so B's is the version shown (equal times would tie on device ID).
    clock += 1;
    await addEntry(b, 'e1', { text_content: 'From B' });
    await sync(a);
    await sync(b);
    await sync(a);
    for (const target of [a, b]) {
      expect(texts(target)).toEqual(['e1:From B']);
      expect(
        target.database.sqlite
          .query("SELECT value_json FROM sync_field_values WHERE field = 'text'")
          .all(),
      ).toEqual([{ value_json: '"From A"' }]);
    }
  });

  test('an entry an unseen edit brings back after its delete was compacted is reported', async () => {
    const a = device();
    const b = device();
    await addEntry(a, 'e1', { text_content: 'Old' });
    await sync(a);
    await sync(b);
    clock += 1000;
    // A's edit stays unpublished: B's delete will not have seen it.
    await addEntry(a, 'e1', { text_content: 'Old', mood: 'HAPPY' });
    await addEntry(b, 'e1', { text_content: 'New' });
    await write(b, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: clock }),
    );
    // A is silent for more than 180 days, so B compacts the deleted entry.
    clock += 200 * DAY;
    expect(await sync(b)).toMatchObject({ status: 'published', revivedEntries: [] });
    clock += 1000;
    // A's edit returns the entry with A's text: compaction dropped the text B
    // had replaced it with, so the older one is shown. That is reported.
    const back = await sync(a);
    expect(back).toMatchObject({ status: 'published', revivedEntries: ['e1'] });
    expect(texts(a)).toEqual(['e1:Old']);
    // B takes it back too, with A's edit: nothing A had is lost.
    expect(await sync(b)).toMatchObject({ revivedEntries: ['e1'] });
    for (const target of [a, b]) {
      expect(texts(target)).toEqual(['e1:Old']);
      expect(target.database.sqlite.query('SELECT mood FROM entries').all()).toEqual([
        { mood: 'HAPPY' },
      ]);
    }
    // Once shown on both sides, later passes do not report it again.
    clock += 1000;
    await addEntry(b, 'e1', { text_content: 'Later', mood: 'HAPPY' });
    expect(await sync(b)).toMatchObject({ revivedEntries: [] });
    expect(await sync(a)).toMatchObject({ revivedEntries: [] });
    expect(texts(a)).toEqual(['e1:Later']);
  });

  test('a wiped device downloads every head again', async () => {
    const a = device();
    const b = device();
    await addEntry(a, 'e1');
    await sync(a);
    await sync(b);
    b.database.sqlite.run('DELETE FROM entries');
    await write(b, (tx) => resetSyncIdentityInTransaction(tx, clock));
    expect(texts(b)).toEqual([]);
    clock += 1000;
    await sync(b);
    expect(texts(b)).toEqual(['e1:Text e1']);
  });
});

describe('roster expiry and head pruning (P11)', () => {
  const heads = () =>
    provider
      .physicalHeads(VAULT)
      .map((listed) => listed.head!.deviceId)
      .sort();
  const deleteEntry = (target: Device, id: string) =>
    write(target, (tx) => repositories.deleteEntryInTransaction(tx, id, { now: clock }));
  const deletedValues = (target: Device) =>
    target.database.sqlite.query('SELECT entity_id FROM sync_deleted_records').all();

  test('a device away for 180 days loses its head; back, it brings back only what it edited', async () => {
    const [a, b, c] = [device(), device(), device()];
    await addEntry(a, 'kept-deleted', { text_content: 'Gone' });
    await addEntry(a, 'edited-away', { text_content: 'Old' });
    for (const target of [a, b, c, a]) await sync(target);
    // B edits one entry offline, then goes quiet; A deletes both.
    clock += 1000;
    await addEntry(b, 'edited-away', { text_content: 'Edited on B' });
    await deleteEntry(a, 'kept-deleted');
    await deleteEntry(a, 'edited-away');
    await sync(a);
    await sync(c);
    // 200 days on: B has expired, A and C go on.
    clock += 200 * DAY;
    await addEntry(c, 'later');
    await sync(c);
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    const bId = deviceIdOf(b);
    expect(heads()).toEqual([deviceIdOf(a), deviceIdOf(c)].sort());
    expect(heads()).not.toContain(bId);
    // A's own record of B's head stays; the deleted values are compacted.
    expect(deletedValues(a)).toEqual([]);
    // B comes back: its own head is gone, so it publishes a new one. The
    // entry it never edited stays deleted; its unseen edit returns.
    clock += 1000;
    const back = await sync(b);
    expect(back).toMatchObject({ status: 'published', revivedEntries: ['edited-away'] });
    expect(texts(b)).toEqual(['edited-away:Edited on B', 'later:Text later']);
    expect(heads()).toContain(bId);
    clock += 1000;
    expect(await sync(a)).toMatchObject({ revivedEntries: ['edited-away'] });
    for (const target of [a, c]) {
      await sync(target);
      expect(texts(target)).toEqual(['edited-away:Edited on B', 'later:Text later']);
    }
  });

  test('a pass that only pulls prunes nothing: the device publishes first', async () => {
    const [a, b] = [device(), device()];
    await addEntry(a, 'e1');
    for (const target of [a, b, a]) await sync(target);
    // 200 days on, a new device joins (its publication changes no context);
    // its own pruning fails this once.
    clock += 200 * DAY;
    provider.failNext('delete-head', new SnapshotProviderError('transient', 'offline'));
    const joining = await requests(() => sync(device()));
    expect(count(joining, 'delete-head')).toBe(1);
    expect(heads()).toHaveLength(3);
    // A, relaunched (a fresh engine runs its cleanup at once), only pulls:
    // B is expired, but A has not published since taking it in.
    const relaunched = device({ database: a.database });
    clock += 1000;
    let status = '';
    const pulling = await requests(async () => {
      status = (await sync(relaunched)).status;
    });
    expect(status).toBe('pulled');
    expect(count(pulling, 'list-snapshots')).toBe(1);
    expect(count(pulling, 'delete-head')).toBe(0);
    expect(heads()).toContain(deviceIdOf(b));
    // Its next publication prunes it.
    clock += 1000;
    await addEntry(relaunched, 'e2');
    expect((await sync(relaunched)).status).toBe('published');
    expect(heads()).not.toContain(deviceIdOf(b));
  });

  test('a device back after its head was pruned publishes even if the only other head is damaged', async () => {
    const [a, b] = [device(), device()];
    await sync(a);
    await addEntry(b, 'from-b');
    await sync(b);
    clock += 200 * DAY;
    await addEntry(a, 'e1');
    await sync(a);
    expect(heads()).toEqual([deviceIdOf(a)]);
    provider.removeDeviceHeadForTest(VAULT, deviceIdOf(a));
    provider.injectUnreadableHead(VAULT, deviceIdOf(a), 'corrupt-file');
    clock += 1000;
    expect(await sync(b)).toMatchObject({
      status: 'published',
      skippedHeads: [{ physicalId: 'corrupt-file', reason: 'unreadable' }],
    });
  });

  test('an expired ID loses only the head taken in, never another file under it', async () => {
    const [a, b] = [device(), device()];
    await sync(a);
    await addEntry(b, 'from-b');
    await sync(b);
    // Under B's ID: a leftover older file (a race), and a newer one whose
    // snapshot cannot be read, so A never takes it in.
    const [bHead] = provider
      .physicalHeads(VAULT)
      .filter((listed) => listed.head?.deviceId === deviceIdOf(b));
    provider.injectPhysicalHead({
      ...bHead.head!,
      deviceSequence: 0,
      snapshotId: 'e'.repeat(64),
    });
    clock += 200 * DAY;
    await addEntry(a, 'e1');
    expect((await sync(a)).status).toBe('published');
    provider.injectPhysicalHead({
      ...bHead.head!,
      deviceSequence: 9,
      snapshotId: 'f'.repeat(64),
    });
    clock += 1000;
    await addEntry(a, 'e2');
    expect((await sync(a)).status).toBe('published');
    expect(texts(a)).toEqual(['e1:Text e1', 'e2:Text e2', 'from-b:Text from-b']);
    const left = provider.physicalHeads(VAULT).map((listed) => listed.head!);
    expect(left.map((head) => head.snapshotId).sort()).toEqual(
      [
        left.find((head) => head.deviceId === deviceIdOf(a))!.snapshotId,
        'e'.repeat(64),
        'f'.repeat(64),
      ].sort(),
    );
  });
});

describe('retired device IDs (P11)', () => {
  test('after "Delete all", the old ID is retired: compaction goes ahead and its head goes', async () => {
    const [a, b] = [device(), device()];
    await addEntry(a, 'e1', { text_content: 'Secret' });
    await sync(a);
    await sync(b);
    await sync(a);
    const old = deviceIdOf(a);
    // B deletes; A is wiped before it ever acknowledges that delete.
    clock += 1000;
    await write(b, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: clock }),
    );
    await sync(b);
    a.database.sqlite.run('DELETE FROM entries');
    bindInstall(a);
    await write(a, (tx) => resetSyncIdentityInTransaction(tx, clock));
    expect(pendingOf(a)).toMatchObject([{ vaultId: VAULT, deviceId: old }]);
    // A binds again under a new ID, takes the journal back from Drive and
    // retires the old ID in the same publication; then prunes its head.
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    expect(deviceIdOf(a)).not.toBe(old);
    expect(pendingOf(a)).toEqual([]);
    expect(retiredOf(a)).toEqual([old]);
    expect(
      provider.physicalHeads(VAULT).map((head) => head.head!.deviceId),
    ).not.toContain(old);
    // B no longer waits for the dead ID: once it takes A in, the deleted
    // text is compacted at once instead of after 180 days.
    clock += DAY;
    await sync(b);
    for (const target of [a, b]) {
      await sync(target);
      expect(texts(target)).toEqual([]);
      expect(
        target.database.sqlite.query('SELECT entity_id FROM sync_deleted_records').all(),
      ).toEqual([]);
    }
  });

  test('an old backup of a retired ID pauses instead of syncing, then continues as a new device', async () => {
    const [a, b] = [device(), device()];
    await addEntry(a, 'e1');
    for (const target of [a, b, a]) await sync(target);
    // An encrypted backup restored onto the same phone keeps the ID and the
    // install marker; it never saw what A wrote after it.
    const backup = devices.clone(a.database);
    clock += 1000;
    await addEntry(a, 'e2', { text_content: 'After the backup' });
    await sync(a);
    bindInstall(a);
    a.database.sqlite.run('DELETE FROM entries');
    await write(a, (tx) => resetSyncIdentityInTransaction(tx, clock));
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    const restored = device({ database: backup });
    clock += 1000;
    await addEntry(restored, 'e2', { text_content: 'Edited on the restored copy' });
    expect(await sync(restored)).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
    expect(restored.stateStore.loadState(VAULT, 'connection').lastErrorClass).toBe(
      'device-id-retired',
    );
    // Its way out keeps every value on both sides.
    await newDevice(restored, 'another-install');
    restored.stateStore.clearPause(VAULT, 'connection');
    clock += 1000;
    expect((await sync(restored)).status).toBe('published');
    clock += 1000;
    await sync(a);
    for (const target of [a, restored])
      expect(allTexts(target, 'e2')).toEqual([
        'After the backup',
        'Edited on the restored copy',
      ]);
  });

  test('a copy rebound after its "Delete all" does not retire the original install\'s ID', async () => {
    const a = device();
    await sync(a);
    const copy = device({ database: devices.clone(a.database) });
    const id = deviceIdOf(a);
    bindInstall(copy);
    await write(copy, (tx) => resetSyncIdentityInTransaction(tx, clock));
    expect(pendingOf(copy)).toMatchObject([{ deviceId: id, installId: 'install' }]);
    // Its launch check finds another install's marker and rebinds it.
    copy.database.sqlite.run(
      "UPDATE sync_device SET install_id = 'copy' WHERE id = 'self'",
    );
    clock += 1000;
    expect((await sync(copy)).status).toBe('published');
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    for (const target of [a, copy]) expect(retiredOf(target)).not.toContain(id);
  });

  test('"Delete all" on a database not bound to this install retires nothing', async () => {
    const a = device();
    await sync(a);
    await write(a, (tx) => resetSyncIdentityInTransaction(tx, clock));
    expect(pendingOf(a)).toEqual([]);
  });

  test('a cloned ID is not retired by the copy that continues as a new device', async () => {
    const a = device();
    await sync(a);
    const copy = device({ database: devices.clone(a.database) });
    const id = deviceIdOf(a);
    await newDevice(copy, 'another-install');
    copy.stateStore.clearPause(VAULT, 'connection');
    clock += 1000;
    await sync(copy);
    await sync(a);
    for (const target of [a, copy]) expect(retiredOf(target)).not.toContain(id);
  });
});

describe('compaction reaches Drive (P11)', () => {
  const deleteOn = (target: Device, id: string) =>
    write(target, (tx) => repositories.deleteEntryInTransaction(tx, id, { now: clock }));
  /** The bodies of the snapshots every listed head points to. */
  async function headBodies() {
    const bodies: string[] = [];
    for (const { head } of provider.physicalHeads(VAULT)) {
      const bytes = await provider.downloadSnapshot(VAULT, head!.snapshotId);
      bodies.push(canonicalState(decodeEnvelope(bytes!).state));
    }
    return bodies;
  }

  test('a quiet device republishes once it compacts, so no head keeps the deleted text', async () => {
    const [a, b] = [device(), device()];
    await addEntry(a, 'e1', { text_content: 'Secret' });
    for (const target of [a, b, a]) await sync(target);
    clock += 1000;
    await write(a, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: clock }),
    );
    await sync(a);
    // B takes the delete in, but not everyone has acknowledged it yet:
    // nothing compacts, so nothing is owed.
    expect((await sync(b)).status).toBe('pulled');
    // A day on, B acknowledges the delete and compacts it at once.
    clock += DAY;
    expect((await sync(b)).status).toBe('published');
    // A has written nothing since; taking B's acknowledgement in, it compacts
    // too, and publishes so its own head drops the text.
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    const bodies = await headBodies();
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).toContain('"e1"');
      expect(body).not.toContain('Secret');
    }
    // B takes A's head in without publishing again; then both are quiet.
    clock += 1000;
    expect((await sync(b)).status).toBe('pulled');
    clock += 1000;
    for (const target of [a, b]) expect((await sync(target)).status).toBe('up-to-date');
  });

  test('a compaction publication that fails is made at a later pass', async () => {
    const [a, b] = [device(), device()];
    await addEntry(a, 'e1', { text_content: 'Secret' });
    for (const target of [a, b, a]) await sync(target);
    clock += 1000;
    await deleteOn(a, 'e1');
    await sync(a);
    await sync(b);
    clock += DAY;
    await sync(b);
    // A compacts, but its upload fails: the next quiet pass still publishes.
    provider.failNext(
      'upload-snapshot',
      new SnapshotProviderError('transient', 'offline'),
    );
    clock += 1000;
    expect((await sync(a)).status).toBe('retry');
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    for (const body of await headBodies()) expect(body).not.toContain('Secret');
    clock += 1000;
    expect((await sync(a)).status).toBe('up-to-date');
  });

  test('with a third device holding the text, every head ends clean and passes settle', async () => {
    const [a, b, c] = [device(), device(), device()];
    await addEntry(a, 'e1', { text_content: 'Secret' });
    for (const target of [a, b, c, a, b, c]) await sync(target);
    clock += 1000;
    await deleteOn(a, 'e1');
    await sync(a);
    // C acknowledges before B: not compactable yet, so C's head keeps the text.
    clock += DAY;
    expect((await sync(c)).status).toBe('published');
    // B acknowledges last and compacts; A and C take that in and compact too.
    clock += 1000;
    expect((await sync(b)).status).toBe('published');
    for (const target of [a, c]) {
      clock += 1000;
      expect((await sync(target)).status).toBe('published');
    }
    for (const body of await headBodies()) expect(body).not.toContain('Secret');
    // One more round takes the last heads in; then no one publishes again.
    for (const target of [a, b, c]) {
      clock += 1000;
      expect((await sync(target)).status).not.toBe('published');
    }
    for (const target of [a, b, c]) {
      clock += 1000;
      expect((await sync(target)).status).toBe('up-to-date');
    }
  });
});

describe('attachments', () => {
  async function attach(target: Device) {
    await addEntry(target, 'e1', {
      assets: [{ type: AssetType.IMAGE, uri: 'photos/p.jpg', assetId: 'photo-1' }],
    });
    const hash = 'c'.repeat(64);
    target.database.sqlite.run('UPDATE media_assets SET blob_hash = ?, byte_size = 3', [
      hash,
    ]);
    await blobs.writeVerified(hash, new Uint8Array([1, 2, 3]));
    return hash;
  }

  test('an attachment is stamped once its blob is uploaded, before the snapshot', async () => {
    const a = device();
    const hash = await attach(a);
    const made = await requests(() => sync(a));
    expect(made.indexOf('upload-media')).toBeLessThan(made.indexOf('upload-snapshot'));
    expect((await provider.hasMediaBatch(VAULT, [hash])).has(hash)).toBe(true);
    const b = device();
    await sync(b);
    expect(
      b.database.sqlite.query('SELECT asset_id, download_state FROM media_assets').all(),
    ).toEqual([{ asset_id: 'photo-1', download_state: 'pending' }]);
  });

  /** One entry with `count` photos, each with its own blob. */
  async function attachMany(target: Device, count: number) {
    await addEntry(target, 'e1', {
      assets: Array.from({ length: count }, (_, i) => ({
        type: AssetType.IMAGE,
        uri: `photos/p${i}.jpg`,
        assetId: `photo-${i}`,
      })),
    });
    const hashes: string[] = [];
    for (let i = 0; i < count; i++) {
      const hash = i.toString(16).padStart(64, 'd');
      target.database.sqlite.run(
        'UPDATE media_assets SET blob_hash = ?, byte_size = 3 WHERE asset_id = ?',
        [hash, `photo-${i}`],
      );
      await blobs.writeVerified(hash, new Uint8Array([1, 2, i]));
      hashes.push(hash);
    }
    return hashes;
  }

  /** Holds every upload until the test lets it go, counting those in flight. */
  function gateUploads() {
    const upload = provider.uploadMedia.bind(provider);
    const gate = { inFlight: 0, most: 0, started: 0, release: [] as (() => void)[] };
    provider.uploadMedia = async (...args) => {
      gate.started += 1;
      gate.inFlight += 1;
      gate.most = Math.max(gate.most, gate.inFlight);
      await new Promise<void>((resolve) => gate.release.push(resolve));
      try {
        return await upload(...args);
      } finally {
        gate.inFlight -= 1;
      }
    };
    return gate;
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  /** Waits until `ready`, failing rather than hanging if the pass never gets there. */
  async function until(ready: () => boolean) {
    for (let tick = 0; !ready(); tick++) {
      if (tick > 200) throw new Error('the uploads never started');
      await settle();
    }
  }

  test('attachments upload a few at a time, then all are published', async () => {
    const a = device();
    const hashes = await attachMany(a, 7);
    const gate = gateUploads();
    const pass = sync(a);
    while (gate.started < 7 || gate.release.length > 0) {
      await settle();
      expect(gate.inFlight).toBeLessThanOrEqual(MEDIA_UPLOAD_CONCURRENCY);
      gate.release.shift()?.();
    }
    expect(await pass).toMatchObject({ status: 'published', deferredMediaCount: 0 });
    expect(gate.most).toBe(MEDIA_UPLOAD_CONCURRENCY);
    expect((await provider.hasMediaBatch(VAULT, hashes)).size).toBe(7);
  });

  test('a failed upload starts no more; those in flight finish first', async () => {
    const a = device();
    const hashes = await attachMany(a, 7);
    const gate = gateUploads();
    const upload = provider.uploadMedia.bind(provider);
    let calls = 0;
    provider.uploadMedia = async (...args) => {
      calls += 1;
      if (calls === 2) throw new SnapshotProviderError('transient', 'offline');
      return upload(...args);
    };
    const pass = sync(a);
    let settled = false;
    void pass.finally(() => {
      settled = true;
    });
    // The others in the first round were in flight when the second failed:
    // the pass waits for all of them, and starts no more.
    const inFlight = MEDIA_UPLOAD_CONCURRENCY - 1;
    await until(() => gate.started === inFlight);
    for (let held = inFlight; held > 0; held--) {
      await settle();
      expect(settled).toBe(false);
      gate.release.shift()!();
    }
    const result = await pass;
    expect(result.status).not.toBe('published');
    expect(calls).toBe(MEDIA_UPLOAD_CONCURRENCY);
    expect(gate.started).toBe(inFlight);
    // Those in flight reached the provider; the failed one and the rest did not.
    const firstRound = hashes.slice(0, MEDIA_UPLOAD_CONCURRENCY);
    expect(
      (
        await provider.hasMediaBatch(
          VAULT,
          firstRound.filter((_, i) => i !== 1),
        )
      ).size,
    ).toBe(inFlight);
    expect(
      (
        await provider.hasMediaBatch(VAULT, [
          hashes[1],
          ...hashes.slice(firstRound.length),
        ])
      ).size,
    ).toBe(0);
    // Nothing is stamped: the attachments are still unpublished.
    expect(
      a.database.sqlite
        .query('SELECT count(*) AS n FROM media_assets WHERE stamp_hlc IS NOT NULL')
        .get(),
    ).toEqual({ n: 0 });
  });

  test('a Wi-Fi-only refusal mid-way keeps what was uploaded and defers the rest', async () => {
    const a = device();
    await attachMany(a, 7);
    const gate = gateUploads();
    const upload = provider.uploadMedia.bind(provider);
    let calls = 0;
    provider.uploadMedia = async (...args) => {
      calls += 1;
      if (calls === 2) throw new SnapshotProviderError('wifi-only-media', 'cellular');
      return upload(...args);
    };
    const pass = sync(a);
    const inFlight = MEDIA_UPLOAD_CONCURRENCY - 1;
    await until(() => gate.started === inFlight);
    while (gate.release.length > 0) gate.release.shift()!();
    // Those in flight finish and are published; the rest wait.
    expect(await pass).toMatchObject({
      status: 'published',
      deferredMediaCount: 7 - inFlight,
    });
    expect(calls).toBe(MEDIA_UPLOAD_CONCURRENCY);
    expect(
      a.database.sqlite
        .query('SELECT count(*) AS n FROM media_assets WHERE stamp_hlc IS NOT NULL')
        .get(),
    ).toEqual({ n: inFlight });
  });

  test('after an interrupted first backup, re-checks show progress and lost blobs upload a few at a time', async () => {
    const reports: SyncProgressReport[] = [];
    const a = device({ progress: (report) => reports.push(report) });
    const hashes = await attachMany(a, 8);
    // Every photo is uploaded and stamped, but the snapshot never makes it.
    provider.failNext(
      'upload-snapshot',
      new SnapshotProviderError('transient', 'offline'),
    );
    expect((await sync(a)).status).toBe('retry');
    expect(provider.mediaHashes(VAULT)).toEqual([...hashes].sort());
    // Meanwhile the backup lost all but one (say, deleted outside the app).
    for (const hash of hashes.slice(1)) provider.removeMediaForTest(VAULT, hash);
    reports.length = 0;
    const gate = gateUploads();
    const pass = sync(a);
    while (gate.started < 7 || gate.release.length > 0) {
      await settle();
      expect(gate.inFlight).toBeLessThanOrEqual(MEDIA_UPLOAD_CONCURRENCY);
      gate.release.shift()?.();
    }
    expect(await pass).toMatchObject({ status: 'published' });
    expect(gate.most).toBe(MEDIA_UPLOAD_CONCURRENCY);
    expect(provider.mediaHashes(VAULT)).toEqual([...hashes].sort());
    const progress = (phase: string) =>
      reports.filter((report) => 'phase' in report && report.phase === phase);
    expect(progress('checking-media')).toEqual([
      { type: 'plan', phase: 'checking-media', items: { done: 0, total: 8 } },
      ...Array.from({ length: 8 }, () => ({
        type: 'item' as const,
        phase: 'checking-media' as const,
      })),
    ]);
    expect(progress('uploading-media')).toEqual([
      {
        type: 'plan',
        phase: 'uploading-media',
        items: { done: 0, total: 7 },
        bytesTotal: 21,
      },
      ...Array.from({ length: 7 }, () => ({
        type: 'item' as const,
        phase: 'uploading-media' as const,
      })),
    ]);
  });

  test('a device that holds none of the blobs asks the provider about none', async () => {
    const a = device();
    await attach(a);
    await sync(a);
    // B restores the journal: its attachments wait for their downloads.
    const b = device();
    const mightHold = blobs.mightHold;
    blobs.mightHold = async () => new Set();
    try {
      const made = await requests(() => sync(b));
      expect(count(made, 'has-media')).toBe(0);
      expect(count(made, 'upload-snapshot')).toBe(1);
    } finally {
      blobs.mightHold = mightHold;
    }
  });

  test('Wi-Fi-only media waits; the entry is published without it', async () => {
    const a = device();
    await attach(a);
    provider.mediaTransfersAllowed = async () => false;
    const result = await sync(a);
    expect(result).toMatchObject({ status: 'published', deferredMediaCount: 1 });
    const b = device();
    await sync(b);
    expect(texts(b)).toEqual(['e1:Text e1']);
    expect(b.database.sqlite.query('SELECT * FROM media_assets').all()).toEqual([]);
    // On Wi-Fi it publishes, and the other device gets it.
    provider.mediaTransfersAllowed = async () => true;
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    await sync(b);
    expect(b.database.sqlite.query('SELECT asset_id FROM media_assets').all()).toEqual([
      { asset_id: 'photo-1' },
    ]);
  });

  test('an unhashed new profile photo is a short wait, not a pause', async () => {
    const a = device();
    await sync(a);
    await write(a, (tx) =>
      repositories.updateProfileInTransaction(
        tx,
        { photoUri: 'photos/me.jpg', photoAssetId: 'me' },
        { now: clock },
      ),
    );
    clock += 1000;
    expect(await sync(a)).toMatchObject({ status: 'retry', reason: 'transient' });
    expect(a.stateStore.loadState(VAULT, 'connection').pauseReason).toBeNull();
  });
});

describe('versioning and safety', () => {
  async function injectHead(head: Record<string, unknown>) {
    provider.injectPhysicalHead({
      format: 'tackbok-head',
      major: 2,
      required: [],
      vaultId: VAULT,
      deviceId: 'other-device',
      deviceSequence: 1,
      snapshotId: 'f'.repeat(64),
      updatedAt: T,
      ...head,
    } as never);
  }

  test.each([
    ['a newer major version', { major: 3 }],
    ['an unknown required feature', { required: ['encrypted-body'] }],
    ['an unknown head format', { format: 'tackbok-head-v9' }],
  ])('%s pauses for an update, writing and deleting nothing', async (_name, head) => {
    const a = device();
    await addEntry(a, 'e1');
    await injectHead(head);
    const local = () =>
      JSON.stringify([
        a.database.sqlite.query('SELECT * FROM sync_device').all(),
        a.database.sqlite.query('SELECT * FROM sync_records').all(),
        a.database.sqlite.query('SELECT * FROM tags').all(),
      ]);
    const before = local();
    const made = await requests(() => sync(a));
    // Not even bound to the vault: the local journal is as it was.
    expect(local()).toBe(before);
    expect(await sync(a)).toMatchObject({
      status: 'attention',
      reason: 'unsupported-format',
    });
    for (const name of [
      'download-snapshot',
      'upload-snapshot',
      'update-head',
      'delete-snapshot',
      'upload-media',
    ])
      expect(count(made, name)).toBe(0);
  });

  test('old snapshots no head points to are deleted after 30 days', async () => {
    const a = device();
    await sync(a);
    const first = provider.physicalHeads(VAULT)[0].head!.snapshotId;
    clock += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    expect(provider.snapshotIds(VAULT)).toContain(first);
    clock += 31 * DAY;
    await addEntry(a, 'e2');
    await sync(a);
    expect(provider.snapshotIds(VAULT)).not.toContain(first);
  });

  test('"Delete journal everywhere" elsewhere stops sync for review', async () => {
    const a = device();
    await sync(a);
    provider.setRevocations(VAULT, ['journal-deleted']);
    expect(await sync(a)).toMatchObject({
      status: 'attention',
      reason: 'journal-deleted',
    });
  });

  test('a provider failure is a retry, and the next pass publishes', async () => {
    const a = device();
    await addEntry(a, 'e1');
    provider.failNext('update-head', new SnapshotProviderError('transient', 'offline'));
    expect(await sync(a)).toMatchObject({ status: 'retry', reason: 'transient' });
    expect(provider.physicalHeads(VAULT)).toEqual([]);
    expect((await sync(a)).status).toBe('published');
    expect(provider.physicalHeads(VAULT)).toHaveLength(1);
  });

  test('an update-required pause clears once the app is updated', async () => {
    const a = device({ codeVersion: '1' });
    await injectHead({ major: 3 });
    expect(await sync(a)).toMatchObject({
      status: 'attention',
      reason: 'unsupported-format',
    });
    expect(await sync(a)).toMatchObject({
      status: 'attention',
      reason: 'unsupported-format',
    });
    // The other device went back to a format this build reads.
    provider.removeDeviceHeadForTest(VAULT, 'other-device');
    expect(await sync(a)).toMatchObject({ status: 'attention' });
    const updated = device({ database: a.database, codeVersion: '2' });
    expect((await sync(updated)).status).toBe('published');
  });
});

describe('backup history and retention (P9)', () => {
  const listed = async () => provider.listSnapshots(VAULT);

  test('a device clock far ahead deletes no history early', async () => {
    let real = clock;
    provider.serverClock = () => real;
    const a = device();
    await sync(a);
    clock += 1000;
    real += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    const before = provider.snapshotIds(VAULT);
    // 60 days ahead by this device's clock; an hour later by Drive's.
    clock += 60 * DAY;
    real += 60 * 60 * 1000;
    await addEntry(a, 'e2');
    expect((await sync(a)).status).toBe('published');
    for (const snapshotId of before)
      expect(provider.snapshotIds(VAULT)).toContain(snapshotId);
  });

  test('a device clock behind does not keep history for ever', async () => {
    let real = clock;
    provider.serverClock = () => real;
    const a = device();
    await sync(a);
    const first = headSnapshot(a);
    clock += 1000;
    real += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    const second = headSnapshot(a);
    // Drive's clock moves 31 days on; this device's barely moves.
    clock += 2000;
    real += 31 * DAY;
    await addEntry(a, 'e2');
    expect((await sync(a)).status).toBe('published');
    // The first goes; the head this pass started from, at the next cleanup.
    expect(provider.snapshotIds(VAULT)).not.toContain(first);
    expect(provider.snapshotIds(VAULT)).toContain(second);
    clock += 1000;
    real += 1000;
    await addEntry(a, 'e3');
    await sync(a);
    expect(provider.snapshotIds(VAULT)).not.toContain(second);
  });

  test('one snapshot a day stays for 30 days, days with none included', async () => {
    const [a, b] = [device(), device()];
    // Days of the test are UTC days, as the history's are.
    const midnight = Math.ceil(T / DAY) * DAY;
    for (let day = 0; day < 40; day++) {
      // Two quiet days a week.
      if (day % 7 < 5)
        for (const [hour, target] of [
          [2, a],
          [9, b],
          [17, a],
        ] as const) {
          clock = midnight + day * DAY + hour * 60 * 60 * 1000;
          await addEntry(target, `d${day}-h${hour}`);
          await sync(target);
          await sync(target === a ? b : a);
        }
    }
    // Two quiet days: each device cleans up once a day, and a head a pass
    // started from stays until the next cleanup.
    for (let day = 0; day < 2; day++) {
      clock += DAY;
      for (const target of [a, b]) await sync(target);
    }
    const now = clock;
    const snapshots = await listed();
    const heads = new Set([headSnapshot(a), headSnapshot(b)]);
    const history = backupHistory(snapshots, now).map((snapshot) => snapshot.snapshotId);
    // Nothing but the heads and one a day.
    expect(snapshots.map((snapshot) => snapshot.snapshotId).sort()).toEqual(
      [...new Set([...heads, ...history])].sort(),
    );
    // Every day of the last 30 that had a snapshot has one.
    const days = new Set(
      snapshots
        .filter((snapshot) => now - snapshot.createdAt < 30 * DAY)
        .map((snapshot) => Math.floor(snapshot.createdAt / DAY)),
    );
    let busyDays = 0;
    for (let day = 0; day < 40; day++) {
      const start = midnight + day * DAY;
      if (day % 7 < 5 && now - (start + 17 * 60 * 60 * 1000) < 30 * DAY) {
        busyDays++;
        expect(days.has(Math.floor((start + 17 * 60 * 60 * 1000) / DAY))).toBe(true);
      }
    }
    // The quiet days at the end have acknowledgements of their own.
    expect(busyDays).toBe(20);
    expect(history.length).toBeGreaterThanOrEqual(busyDays);
  });

  test("a pruned head's snapshot is history like any other: kept as its day's newest, else thinned", async () => {
    const [a, b] = [device(), device()];
    await addEntry(a, 'e1');
    for (const target of [a, b, a]) await sync(target);
    const old = deviceIdOf(a);
    const oldSnapshot = headSnapshot(a);
    // A is wiped; its next pass retires the old ID and prunes that head.
    clock += 1000;
    a.database.sqlite.run('DELETE FROM entries');
    bindInstall(a);
    await write(a, (tx) => resetSyncIdentityInTransaction(tx, clock));
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    expect(
      provider.physicalHeads(VAULT).map((head) => head.head!.deviceId),
    ).not.toContain(old);
    // Same day: kept. A day on, A's newer snapshot of that day covers it.
    expect(provider.snapshotIds(VAULT)).toContain(oldSnapshot);
    clock += DAY;
    await addEntry(a, 'e2');
    await sync(a);
    expect(provider.snapshotIds(VAULT)).not.toContain(oldSnapshot);
  });

  test('without a provider clock nothing is deleted, and cleanup runs once it is known', async () => {
    const a = device();
    await sync(a);
    const first = headSnapshot(a);
    clock += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    const time = provider.providerTime.bind(provider);
    provider.providerTime = () => null;
    clock += 31 * DAY;
    await addEntry(a, 'e2');
    await sync(a);
    expect(provider.snapshotIds(VAULT)).toContain(first);
    // A pass that publishes nothing still cleans up at once: the missing
    // clock did not count as a cleanup.
    provider.providerTime = time;
    clock += 1000;
    await sync(a);
    expect(provider.snapshotIds(VAULT)).not.toContain(first);
  });

  test('an expired head goes with its snapshot in one cleanup', async () => {
    const [a, b] = [device(), device()];
    for (const target of [a, b, a]) await sync(target);
    const gone = headSnapshot(b);
    clock += 200 * DAY;
    await addEntry(a, 'later');
    expect((await sync(a)).status).toBe('published');
    expect(provider.physicalHeads(VAULT)).toHaveLength(1);
    expect(provider.snapshotIds(VAULT)).not.toContain(gone);
  });

  test('a head that moves while it is read is read again, not reported unreadable', async () => {
    const [a, b] = [device(), device()];
    for (const target of [a, b, a]) await sync(target);
    clock += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    const stale = provider.physicalHeads(VAULT);
    clock += 1000;
    await addEntry(a, 'e2');
    await sync(a);
    const moved = headSnapshot(a);
    const old = stale.find((head) => head.head!.deviceId === deviceIdOf(a))!.head!
      .snapshotId;
    // B lists A's head just before A moved it, and the old snapshot is
    // thinned before B downloads it.
    await provider.deleteSnapshot(VAULT, old);
    const current = provider.listHeads.bind(provider);
    let first = true;
    provider.listHeads = async (vaultId) => {
      const heads = await current(vaultId);
      if (!first) return heads;
      first = false;
      return heads.map((listedHead) =>
        listedHead.head?.snapshotId === moved
          ? { ...listedHead, head: { ...listedHead.head, snapshotId: old } }
          : listedHead,
      );
    };
    expect(await sync(b)).toMatchObject({ status: 'retry' });
    expect(await sync(b)).toMatchObject({ status: 'pulled', skippedHeads: [] });
    expect(texts(b)).toEqual(['e1:Text e1', 'e2:Text e2']);
  });
});

describe('identity and clocks', () => {
  test('a restored copy of this device pauses and asks, writing nothing, while the original goes on', async () => {
    const a = device();
    await addEntry(a, 'e1', { text_content: 'Old' });
    await addEntry(a, 'e2', { text_content: 'To delete' });
    await sync(a);
    // An OS backup of this database, restored on another phone.
    const copy = device({ database: devices.clone(a.database) });
    clock += 1000;
    await addEntry(a, 'e1', { text_content: 'New on the original' });
    await write(a, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e2', { now: clock }),
    );
    await sync(a);
    clock += 1000;
    const made = await requests(() => sync(copy));
    expect(await sync(copy)).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
    for (const name of [
      'upload-snapshot',
      'update-head',
      'delete-snapshot',
      'upload-media',
    ])
      expect(count(made, name)).toBe(0);
    // Nothing the original wrote or deleted is undone anywhere.
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    expect(texts(a)).toEqual(['e1:New on the original']);
    const fresh = device();
    await sync(fresh);
    expect(texts(fresh)).toEqual(['e1:New on the original']);
  });

  test('when both installs edit, the one that syncs second pauses instead of overwriting', async () => {
    const a = device();
    await addEntry(a, 'e1', { text_content: 'Before the copy' });
    await sync(a);
    const copy = device({ database: devices.clone(a.database) });
    clock += 1000;
    await addEntry(a, 'e1', { text_content: 'Edited on the original' });
    clock += 1;
    await addEntry(copy, 'e1', { text_content: 'Edited on the copy' });
    await sync(a);
    // The copy finds a head it never published under its ID, at a sequence
    // it has not passed: it pauses, and its head write never happens.
    expect(await sync(copy)).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
    expect(provider.physicalHeads(VAULT)).toHaveLength(1);
    clock += 1000;
    await addEntry(a, 'e2');
    expect((await sync(a)).status).toBe('published');
    expect(texts(a)).toContain('e1:Edited on the original');
    // The copy's edit stays on the copy, not lost, until the user resolves it.
    expect(texts(copy)).toContain('e1:Edited on the copy');

    // "Continue as a new device" on the copy: both edits survive everywhere.
    const before = deviceIdOf(copy);
    await newDevice(copy, 'another-install');
    expect(deviceIdOf(copy)).not.toBe(before);
    copy.stateStore.clearPause(VAULT, 'connection');
    clock += 1000;
    expect((await sync(copy)).status).toBe('published');
    clock += 1000;
    await sync(a);
    for (const target of [a, copy])
      expect(allTexts(target, 'e1')).toEqual([
        'Edited on the copy',
        'Edited on the original',
      ]);
    expect(texts(copy)).toContain('e2:Text e2');
    // The original keeps its ID and goes on; the copy is a device of its own.
    expect(
      provider
        .physicalHeads(VAULT)
        .map((head) => head.head?.deviceId)
        .sort(),
    ).toEqual([before, deviceIdOf(copy)].sort());
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    expect((await sync(copy)).status).not.toBe('attention');
  });

  test('a copy that published over a newer snapshot of the original loses nothing once the original moves', async () => {
    const a = device();
    await addEntry(a, 'e0', { text_content: 'Shared' });
    await sync(a);
    const copy = device({ database: devices.clone(a.database) });
    clock += 1000;
    await addEntry(a, 'e0', { text_content: 'Edited on the original' });
    await sync(a);
    // A race: the copy lists no head under the ID and publishes its own.
    const id = deviceIdOf(a);
    provider.removeDeviceHeadForTest(VAULT, id);
    clock += 1000;
    // Later than the original's edit: its record covers that stamp of the ID.
    await addEntry(copy, 'e0', { text_content: 'Edited on the copy' });
    expect((await sync(copy)).status).toBe('published');
    clock += 1000;
    expect(await sync(a)).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
    await newDevice(a, 'another-install');
    a.stateStore.clearPause(VAULT, 'connection');
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    const fresh = device();
    await sync(fresh);
    for (const target of [a, fresh])
      expect(allTexts(target, 'e0')).toEqual([
        'Edited on the copy',
        'Edited on the original',
      ]);
  });

  test('a copy behind the original deletes only its own older file, and never the newest head', async () => {
    const a = device();
    await addEntry(a, 'e1');
    await sync(a);
    const id = deviceIdOf(a);
    const [first] = provider.physicalHeads(VAULT);
    const copy = device({ database: devices.clone(a.database) });
    const second = device({ database: devices.clone(a.database) });
    // The copy's record names the original's first snapshot, which is still
    // the only head: leaving, the copy must keep it.
    await newDevice(copy, 'another-install');
    expect(provider.physicalHeads(VAULT).map((head) => head.head!.snapshotId)).toEqual([
      first.head!.snapshotId,
    ]);
    // A second copy, once the original has moved on and an older file of
    // that first snapshot is still listed below it: that file goes, the
    // original's newest stays and it syncs on.
    clock += 1000;
    await addEntry(a, 'e2');
    await sync(a);
    provider.injectPhysicalHead(first.head!);
    const filesOf = () =>
      provider.physicalHeads(VAULT).filter((head) => head.head?.deviceId === id);
    expect(filesOf()).toHaveLength(2);
    await newDevice(second, 'another-install');
    const [left] = filesOf();
    expect(filesOf()).toHaveLength(1);
    expect(left.head!.snapshotId).not.toBe(first.head!.snapshotId);
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
  });

  test('a copy paused for another install stays paused when other devices publish', async () => {
    const a = device();
    await sync(a);
    const copy = device({ database: devices.clone(a.database) });
    clock += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    expect(await sync(copy)).toMatchObject({ reason: 'ambiguous-device-head' });
    const other = device();
    await addEntry(other, 'e2');
    await sync(other);
    clock += 1000;
    let result: unknown;
    const made = await requests(async () => {
      result = await sync(copy);
    });
    expect(result).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
    // It waits for the user: not even the heads are listed again.
    expect(count(made, 'list-heads')).toBe(0);
  });

  test('two files under one ID at one sequence: the copy that leaves deletes its own, and the original syncs on', async () => {
    const a = device();
    await addEntry(a, 'e1', { text_content: 'Shared' });
    await sync(a);
    const copy = device({ database: devices.clone(a.database) });
    const id = deviceIdOf(a);
    clock += 1000;
    await addEntry(a, 'e1', { text_content: 'Edited on the original' });
    await sync(a);
    // A race: the copy lists no head under the ID and creates a second file
    // at the same sequence.
    const [original] = provider.physicalHeads(VAULT);
    provider.removeDeviceHeadForTest(VAULT, id);
    clock += 1000;
    await addEntry(copy, 'e2', { text_content: 'Written on the copy' });
    expect((await sync(copy)).status).toBe('published');
    provider.injectPhysicalHead(original.head!);
    const filesOf = () =>
      provider.physicalHeads(VAULT).filter((head) => head.head?.deviceId === id);
    expect(filesOf()).toHaveLength(2);
    for (const target of [a, copy])
      expect(await sync(target)).toMatchObject({ reason: 'ambiguous-device-head' });
    // The copy continues as a new device and deletes its own file only.
    await newDevice(copy, 'another-install');
    copy.stateStore.clearPause(VAULT, 'connection');
    expect(filesOf().map((head) => head.head!.snapshotId)).toEqual([
      original.head!.snapshotId,
    ]);
    // The original's file is the only one again: its pause clears by itself
    // and it goes on under its ID.
    clock += 1000;
    expect((await sync(copy)).status).toBe('published');
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    clock += 1000;
    await sync(copy);
    for (const target of [a, copy])
      expect(texts(target)).toEqual([
        'e1:Edited on the original',
        'e2:Written on the copy',
      ]);
  });

  test('a leftover file under its own ID at a lower sequence is deleted by the install that owns the ID', async () => {
    const a = device();
    await sync(a);
    const copy = device({ database: devices.clone(a.database) });
    const id = deviceIdOf(a);
    // The copy, not seeing the original's file, creates a second one ahead.
    const [original] = provider.physicalHeads(VAULT);
    provider.removeDeviceHeadForTest(VAULT, id);
    clock += 1000;
    await addEntry(copy, 'e1');
    await sync(copy);
    provider.injectPhysicalHead(original.head!);
    // The original pauses: its ID has a newer head it did not publish.
    expect(await sync(a)).toMatchObject({ reason: 'ambiguous-device-head' });
    // The copy owns the ID now; its daily cleanup deletes the leftover. (On
    // Drive a publication updates one file and leaves the other; the fake
    // replaces both, so this pass publishes nothing.)
    clock += DAY;
    expect((await sync(copy)).status).toBe('up-to-date');
    const files = provider
      .physicalHeads(VAULT)
      .filter((head) => head.head?.deviceId === id);
    expect(files).toHaveLength(1);
    expect(files[0].head!.snapshotId).not.toBe(original.head!.snapshotId);
    // The original leaves as a new device and nothing is lost.
    await newDevice(a, 'another-install');
    a.stateStore.clearPause(VAULT, 'connection');
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    expect(texts(a)).toEqual(['e1:Text e1']);
  });

  test("a stale listing of this device's own older head is not taken for another install", async () => {
    const a = device();
    await addEntry(a, 'e1');
    await sync(a);
    const [first] = provider.physicalHeads(VAULT);
    clock += 1000;
    await addEntry(a, 'e2');
    await sync(a);
    provider.removeDeviceHeadForTest(VAULT, first.head!.deviceId);
    provider.injectPhysicalHead(first.head!);
    clock += 1000;
    await addEntry(a, 'e3');
    expect((await sync(a)).status).toBe('published');
  });

  test('a device whose clock is far ahead does not stop this one publishing', async () => {
    const a = device();
    const b = device();
    await sync(a);
    clock += 30 * DAY;
    await addEntry(b, 'ahead', { text_content: 'From the future' });
    await sync(b);
    clock -= 30 * DAY;
    clock += 1000;
    await addEntry(a, 'mine');
    const result = await sync(a);
    expect(result).toMatchObject({
      status: 'published',
      skippedHeads: [{ reason: 'clock-ahead', deviceId: deviceIdOf(b) }],
    });
    expect(texts(a)).toEqual(['mine:Text mine']);
    const durable = a.stateStore.loadState(VAULT, 'connection');
    expect(durable.pauseReason).toBeNull();
    expect(durable.skippedHeads).toHaveLength(1);
    // Not downloaded again before it can fit, and still listed.
    clock += DAY;
    const made = await requests(() => sync(a));
    expect(count(made, 'download-snapshot')).toBe(0);
    expect(a.stateStore.loadState(VAULT, 'connection').skippedHeads).toHaveLength(1);
    // Once its clock is within the bound, the head is read.
    clock += 30 * DAY;
    await sync(a);
    expect(texts(a)).toContain('ahead:From the future');
  });
});

describe('a clock that was far ahead (P8)', () => {
  test('a clock that is now behind does not pause: the uploads show real time', async () => {
    const a = device();
    await addEntry(a, 'e1');
    await sync(a);
    clock -= 400 * DAY;
    await addEntry(a, 'e2');
    expect((await sync(a)).status).toBe('published');
  });

  test('a clock set back after a quiet spell does not pause either', async () => {
    let real = clock;
    provider.serverClock = () => real;
    const a = device();
    await sync(a);
    // Ten quiet days, a write today, then the clock goes back 30 days.
    clock += 10 * DAY;
    real = clock;
    await addEntry(a, 'today');
    clock -= 30 * DAY;
    expect(await sync(a)).toMatchObject({ status: 'published' });
  });

  test('once corrected, the device pauses, and continues as a new device that others accept', async () => {
    // Real time, which the provider records uploads by; device clocks vary.
    let real = clock;
    provider.serverClock = () => real;
    const a = device();
    const b = device();
    await addEntry(a, 'e1', { text_content: 'Base' });
    await sync(a);
    await sync(b);
    // B's clock jumps 30 days ahead; it edits and publishes.
    clock += 30 * DAY;
    await addEntry(b, 'e1', { text_content: 'From the future' });
    await addEntry(b, 'new', { text_content: 'Written while wrong' });
    await sync(b);
    // Its clock is corrected. A refuses its head; B now sees its own clock.
    clock -= 30 * DAY;
    clock += 1000;
    real = clock;
    expect((await sync(a)).status).toBe('up-to-date');
    expect(a.stateStore.loadState(VAULT, 'connection').skippedHeads).toMatchObject([
      { reason: 'clock-ahead' },
    ]);
    const made = await requests(() => sync(b));
    expect(b.stateStore.loadState(VAULT, 'connection').pauseReason).toBe(
      'device-clock-ahead',
    );
    for (const name of ['upload-snapshot', 'update-head', 'delete-head'])
      expect(count(made, name)).toBe(0);

    const old = deviceIdOf(b);
    await newDevice(b, 'clock-ahead');
    b.stateStore.clearPause(VAULT, 'connection');
    // The head no device could take in is gone; B's journal is as it was.
    expect(
      provider.physicalHeads(VAULT).some((head) => head.head?.deviceId === old),
    ).toBe(false);
    expect(texts(b)).toEqual(['e1:From the future', 'new:Written while wrong']);
    clock += 1000;
    real = clock;
    expect((await sync(b)).status).toBe('published');
    clock += 1000;
    real = clock;
    const result = await sync(a);
    expect(result.status).not.toBe('attention');
    expect(a.stateStore.loadState(VAULT, 'connection').skippedHeads).toEqual([]);
    // B's edit was made after it had seen A's: it still replaces the base.
    expect(texts(a)).toEqual(['e1:From the future', 'new:Written while wrong']);
    expect(allTexts(a, 'e1')).toEqual(['From the future']);
    // The old ID is retired (P11): it no longer counts as active anywhere.
    for (const target of [a, b]) expect(retiredOf(target)).toContain(old);
  });
});

describe("other devices' bad heads (P8)", () => {
  const skippedOf = (target: Device) =>
    target.stateStore.loadState(VAULT, 'connection').skippedHeads;
  /** A second device's journal, published, so the vault has a readable head. */
  async function published(id: string) {
    const other = device();
    await addEntry(other, id);
    await sync(other);
    return other;
  }

  test('a head file that cannot be read is skipped while another head can be read', async () => {
    await published('from-b');
    provider.injectUnreadableHead(VAULT, 'dead-device', 'corrupt-file');
    const a = device();
    await addEntry(a, 'mine');
    const result = await sync(a);
    expect(result).toMatchObject({
      status: 'published',
      skippedHeads: [
        {
          physicalId: 'corrupt-file',
          deviceId: 'dead-device',
          snapshotId: null,
          reason: 'unreadable',
        },
      ],
    });
    expect(texts(a)).toEqual(['from-b:Text from-b', 'mine:Text mine']);
    expect(skippedOf(a)).toHaveLength(1);
    // Never deleted automatically.
    expect(provider.physicalHeads(VAULT).some((head) => head.head === null)).toBe(true);
  });

  test.each([
    ['is missing', (_id: string) => {}],
    [
      'is corrupt',
      (id: string) => provider.injectSnapshot(VAULT, id, new Uint8Array([1, 2, 3]), T),
    ],
  ])(
    'a head whose snapshot %s is skipped, and not downloaded again until it moves',
    async (_name, damage) => {
      await published('from-b');
      const snapshotId = 'e'.repeat(64);
      damage(snapshotId);
      provider.injectPhysicalHead({
        format: 'tackbok-head',
        major: 2,
        required: [],
        vaultId: VAULT,
        deviceId: 'broken-device',
        deviceSequence: 3,
        snapshotId,
        updatedAt: T,
      } as never);
      const a = device();
      await addEntry(a, 'mine');
      expect(await sync(a)).toMatchObject({
        status: 'published',
        skippedHeads: [{ deviceId: 'broken-device', snapshotId, reason: 'unreadable' }],
      });
      expect(texts(a)).toContain('from-b:Text from-b');
      clock += 1000;
      const made = await requests(() => sync(a));
      expect(count(made, 'download-snapshot')).toBe(0);
      expect(skippedOf(a)).toHaveLength(1);
      // A day later it is read again (a missing snapshot may only be late).
      clock += DAY;
      const later = await requests(() => sync(a));
      expect(count(later, 'download-snapshot')).toBe(1);
      expect(skippedOf(a)).toHaveLength(1);
    },
  );

  test('a snapshot that arrives late is taken in, and Replace keeps its head', async () => {
    await published('from-b');
    const late = device();
    await addEntry(late, 'late-entry');
    await sync(late);
    const [lateHead] = provider
      .physicalHeads(VAULT)
      .filter((head) => head.head?.deviceId === deviceIdOf(late));
    const bytes = await provider.downloadSnapshot(VAULT, lateHead.head!.snapshotId);
    await provider.deleteSnapshot(VAULT, lateHead.head!.snapshotId);
    const a = device();
    await sync(a);
    const skipped = skippedOf(a);
    expect(skipped).toMatchObject([{ deviceId: deviceIdOf(late), reason: 'unreadable' }]);
    // The snapshot shows up (a listing lag); Replace must not delete the head.
    provider.injectSnapshot(VAULT, lateHead.head!.snapshotId, bytes!, clock);
    // Nor when it cannot hash the snapshot to check it: that is not bad data.
    const failing = {
      hashBytes: async () => {
        throw new Error('digest unavailable');
      },
      pause: async () => {},
    };
    await expect(
      removeUnreadableHeads(provider, VAULT, skipped, failing),
    ).rejects.toThrow('could not be hashed');
    expect(
      provider
        .physicalHeads(VAULT)
        .some((head) => head.head?.deviceId === deviceIdOf(late)),
    ).toBe(true);
    expect(await removeUnreadableHeads(provider, VAULT, skipped)).toBe(0);
    // A missing snapshot is read again after an hour, not a day.
    clock += 60 * 60 * 1000 + 1000;
    await sync(a);
    expect(texts(a)).toContain('late-entry:Text late-entry');
    expect(skippedOf(a)).toEqual([]);
  });

  test('retention deletes nothing while a head file cannot be read', async () => {
    const a = device();
    await sync(a);
    const first = provider.physicalHeads(VAULT)[0].head!.snapshotId;
    clock += 1000;
    await addEntry(a, 'e1');
    await sync(a);
    provider.injectUnreadableHead(VAULT, 'dead-device');
    clock += 31 * DAY;
    await addEntry(a, 'e2');
    await sync(a);
    expect(provider.snapshotIds(VAULT)).toContain(first);
  });

  test('two snapshots under one sequence from another device skip that device', async () => {
    const b = await published('from-b');
    const [listed] = provider.physicalHeads(VAULT);
    await published('from-c');
    provider.injectPhysicalHead({ ...listed.head!, snapshotId: 'd'.repeat(64) });
    const a = device();
    const result = await sync(a);
    expect(result.status).toBe('published');
    expect(skippedOf(a).map((head) => head.deviceId)).toEqual([
      deviceIdOf(b),
      deviceIdOf(b),
    ]);
  });

  test("this device's own unreadable head is published over", async () => {
    const a = device();
    await addEntry(a, 'mine');
    await sync(a);
    const own = deviceIdOf(a);
    provider.removeDeviceHeadForTest(VAULT, own);
    provider.injectUnreadableHead(VAULT, own);
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    expect(skippedOf(a)).toEqual([]);
    expect(provider.physicalHeads(VAULT).map((head) => head.head?.deviceId)).toEqual([
      own,
    ]);
  });

  test('with no readable head the pass pauses; Replace removes the unreadable ones and publishes', async () => {
    provider.injectUnreadableHead(VAULT, 'dead-device', 'corrupt-file');
    const a = device();
    await addEntry(a, 'mine');
    const made = await requests(() => sync(a));
    const durable = a.stateStore.loadState(VAULT, 'connection');
    expect(durable.pauseReason).toBe('invalid-remote-snapshot');
    expect(durable.lastErrorClass).toBe(NO_READABLE_HEAD);
    expect(durable.skippedHeads.map((head) => head.physicalId)).toEqual(['corrupt-file']);
    for (const name of ['upload-snapshot', 'update-head', 'delete-head'])
      expect(count(made, name)).toBe(0);
    // The confirmed action, as the Cloud backup screen runs it.
    expect(await removeUnreadableHeads(provider, VAULT, durable.skippedHeads)).toBe(1);
    a.stateStore.setSkippedHeads(VAULT, 'connection', []);
    a.stateStore.clearPause(VAULT, 'connection');
    expect((await sync(a)).status).toBe('published');
    expect(provider.physicalHeads(VAULT).map((head) => head.head?.deviceId)).toEqual([
      deviceIdOf(a),
    ]);
    const fresh = device();
    await sync(fresh);
    expect(texts(fresh)).toEqual(['mine:Text mine']);
  });

  test('with no readable head the pause clears by itself once a readable head appears', async () => {
    const b = await published('from-b');
    const [listed] = provider.physicalHeads(VAULT);
    // B's head is briefly missing from the listing; only a damaged one is there.
    provider.removeDeviceHeadForTest(VAULT, deviceIdOf(b));
    provider.injectUnreadableHead(VAULT, 'dead-device');
    const a = device();
    await addEntry(a, 'mine');
    await sync(a);
    expect(a.stateStore.loadState(VAULT, 'connection').pauseReason).toBe(
      'invalid-remote-snapshot',
    );
    clock += 1000;
    expect((await sync(a)).status).toBe('attention');
    provider.injectPhysicalHead(listed.head!);
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    expect(texts(a)).toContain('from-b:Text from-b');
  });

  test('Replace keeps a head that has changed since it was skipped', async () => {
    const snapshotId = 'e'.repeat(64);
    provider.injectPhysicalHead({
      format: 'tackbok-head',
      major: 2,
      required: [],
      vaultId: VAULT,
      deviceId: 'broken-device',
      deviceSequence: 3,
      snapshotId,
      updatedAt: T,
    } as never);
    const a = device();
    await sync(a);
    const skipped = a.stateStore.loadState(VAULT, 'connection').skippedHeads;
    expect(skipped).toHaveLength(1);
    // The device published again under the same file before the user chose.
    const [broken] = provider
      .physicalHeads(VAULT)
      .filter((head) => head.head?.deviceId === 'broken-device');
    provider.removeDeviceHeadForTest(VAULT, 'broken-device');
    provider.injectPhysicalHead(
      { ...broken.head!, deviceSequence: 4, snapshotId: 'c'.repeat(64) },
      broken.physicalId,
    );
    expect(await removeUnreadableHeads(provider, VAULT, skipped)).toBe(0);
    expect(
      provider
        .physicalHeads(VAULT)
        .some((head) => head.head?.deviceId === 'broken-device'),
    ).toBe(true);
  });
});

describe('a pass stopped part way', () => {
  test.each([
    'during-merge-application',
    'after-snapshot-uploaded',
    'after-snapshot-verified',
    'after-head-advanced',
  ])(
    'stopped at %s: the next pass finishes, with no duplicate or lost head',
    async (point) => {
      let armed = true;
      const a = device({
        at: (reached) => {
          if (armed && reached === point) {
            armed = false;
            throw new SnapshotProviderError('transient', `stopped at ${point}`);
          }
        },
      });
      const b = device();
      await addEntry(a, 'e1');
      expect((await sync(a)).status).toBe('retry');
      expect((await sync(a)).status).not.toBe('attention');
      clock += 1000;
      const after = await sync(a);
      expect(after.status).toBe('up-to-date');
      await sync(b);
      expect(texts(b)).toEqual(['e1:Text e1']);
      expect(
        provider.physicalHeads(VAULT).filter(({ head }) => head?.deviceId !== undefined),
      ).toHaveLength(2);
    },
  );
});

describe('mass-deletion guard (P10)', () => {
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `e${String(i).padStart(2, '0')}`);
  async function twoDevices(entries: number) {
    const a = device();
    const b = device();
    for (const id of ids(entries)) await addEntry(a, id);
    await sync(a);
    await sync(b);
    await sync(a);
    return { a, b };
  }
  async function remove(target: Device, list: string[]) {
    clock += 1000;
    for (const id of list)
      await write(target, (tx) =>
        repositories.deleteEntryInTransaction(tx, id, { now: clock }),
      );
  }

  test('deletes from elsewhere that would hide a large share pause and change nothing', async () => {
    const { a, b } = await twoDevices(20);
    await remove(b, ids(12));
    expect((await sync(b)).status).toBe('published');
    clock += 1000;
    const before = texts(a);
    const made = await requests(() => sync(a));
    expect(a.stateStore.loadState(VAULT, 'connection').pauseReason).toBe('mass-deletion');
    expect(texts(a)).toEqual(before);
    for (const name of ['upload-snapshot', 'update-head'])
      expect(count(made, name)).toBe(0);
    // Paused: later passes wait for the user.
    clock += 1000;
    expect((await sync(a)).status).toBe('attention');
  });

  test('ordinary deletes, and this device deleting much of its own journal, pass', async () => {
    const { a, b } = await twoDevices(20);
    await remove(b, ids(4));
    await sync(b);
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    expect(texts(a)).toHaveLength(16);
    // Deleting here is already in this journal: nothing to ask on this device.
    await remove(a, ids(20).slice(4, 18));
    expect((await sync(a)).status).toBe('published');
    expect(texts(a)).toHaveLength(2);
  });

  test('a small journal is not guarded', async () => {
    const { a, b } = await twoDevices(9);
    await remove(b, ids(9));
    await sync(b);
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    expect(texts(a)).toEqual([]);
  });

  test('"Delete them here too" applies exactly the deletes it was asked about', async () => {
    const { a, b } = await twoDevices(20);
    await remove(b, ids(12));
    await sync(b);
    clock += 1000;
    await sync(a);
    a.stateStore.answerMassDeletion(VAULT, 'connection', 'apply');
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    expect(texts(a)).toHaveLength(8);
  });

  test('an answer does not cover deletes that arrived after the question', async () => {
    const { a, b } = await twoDevices(20);
    await remove(b, ids(12));
    await sync(b);
    clock += 1000;
    await sync(a);
    await remove(b, ids(20).slice(12, 14));
    await sync(b);
    a.stateStore.answerMassDeletion(VAULT, 'connection', 'apply');
    clock += 1000;
    expect((await sync(a)).status).toBe('attention');
    expect(texts(a)).toHaveLength(20);
  });

  test('an answer survives a failed pass, and answering with no pause throws', async () => {
    const { a, b } = await twoDevices(20);
    expect(() => a.stateStore.answerMassDeletion(VAULT, 'connection', 'apply')).toThrow();
    await remove(b, ids(12));
    await sync(b);
    clock += 1000;
    await sync(a);
    a.stateStore.answerMassDeletion(VAULT, 'connection', 'apply');
    provider.failNext('list-heads', new SnapshotProviderError('transient', 'offline'));
    clock += 1000;
    expect((await sync(a)).status).toBe('retry');
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    expect(texts(a)).toHaveLength(8);
  });

  test('a pending "Keep" asks again when fewer deletes remain, instead of applying them', async () => {
    const { a, b } = await twoDevices(20);
    await remove(b, ids(12));
    await sync(b);
    clock += 1000;
    await sync(a);
    a.stateStore.answerMassDeletion(VAULT, 'connection', 'keep');
    // B brings back four of them before A's next pass: eight remain hidden.
    clock += 1000;
    for (const id of ids(4)) await addEntry(b, id, { text_content: `Back ${id}` });
    await sync(b);
    clock += 1000;
    expect(await sync(a)).toMatchObject({ status: 'attention', reason: 'mass-deletion' });
    expect(texts(a)).toHaveLength(20);
  });

  test('"Keep my entries" keeps them here and brings them back on the deleting device', async () => {
    const { a, b } = await twoDevices(20);
    await remove(b, ids(12));
    await sync(b);
    clock += 1000;
    await sync(a);
    a.stateStore.answerMassDeletion(VAULT, 'connection', 'keep');
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    expect(texts(a)).toHaveLength(20);
    clock += 1000;
    await sync(b);
    expect(texts(b)).toHaveLength(20);
    expect(texts(b)).toEqual(texts(a));
  });
});

test('the guard trips on 100 entries in a large journal, a quarter or not', async () => {
  const { isMassDeletion } =
    await import('../../src/lib/cloudSync/snapshot/sync/massDeletion');
  expect(isMassDeletion(9, 9)).toBe(false);
  expect(isMassDeletion(10, 40)).toBe(true);
  expect(isMassDeletion(10, 41)).toBe(false);
  expect(isMassDeletion(99, 1000)).toBe(false);
  expect(isMassDeletion(100, 1000)).toBe(true);
});

describe('remote media garbage collection (P12)', () => {
  const PHOTO = 'c'.repeat(64);
  async function attachPhoto(target: Device, entryId: string, hash = PHOTO) {
    await addEntry(target, entryId, {
      assets: [
        { type: AssetType.IMAGE, uri: `photos/${entryId}.jpg`, assetId: `p-${entryId}` },
      ],
    });
    target.database.sqlite.run(
      'UPDATE media_assets SET blob_hash = ?, byte_size = 3 WHERE asset_id = ?',
      [hash, `p-${entryId}`],
    );
    await blobs.writeVerified(hash, new Uint8Array([1, 2, 3]));
  }
  const deleteOn = (target: Device, id: string) =>
    write(target, (tx) => repositories.deleteEntryInTransaction(tx, id, { now: clock }));
  /** Blobs some readable snapshot on the provider refers to. */
  async function referencedOnDrive() {
    const used = new Set<string>();
    for (const snapshotId of provider.snapshotIds(VAULT)) {
      const bytes = await provider.downloadSnapshot(VAULT, snapshotId);
      let state;
      try {
        state = decodeEnvelope(bytes!).state;
      } catch {
        continue; // A damaged snapshot a test put there.
      }
      for (const media of state.media.values()) used.add(media.blobHash);
    }
    return used;
  }
  /** Every blob a snapshot on the provider refers to is there. */
  async function expectNothingDangling() {
    const present = new Set(provider.mediaHashes(VAULT));
    for (const blobHash of await referencedOnDrive())
      expect(present.has(blobHash)).toBe(true);
  }
  /** `n` days, each device syncing once a day; returns the day the photo went. */
  async function days(n: number, targets: Device[], hash = PHOTO) {
    for (let day = 1; day <= n; day++) {
      clock += DAY;
      for (const target of targets) await sync(target);
      await expectNothingDangling();
      if (!provider.mediaHashes(VAULT).includes(hash)) return day;
    }
    return null;
  }

  test("a deleted entry's photo goes only once nothing has referred to it for 30 days", async () => {
    const [a, b] = [device(), device()];
    await attachPhoto(a, 'e1');
    for (const target of [a, b, a]) await sync(target);
    clock += 1000;
    await deleteOn(a, 'e1');
    await sync(a);
    await sync(b);
    // Both acknowledge the delete within a day and compact it.
    const compactedAt = clock;
    const gone = await days(120, [a, b]);
    expect(gone).not.toBeNull();
    // The snapshots that held it stay 30 days after their upload; after the
    // last one goes, 30 more days unreferenced.
    expect(clock - compactedAt).toBeGreaterThanOrEqual(60 * DAY);
    expect(clock - compactedAt).toBeLessThan(65 * DAY);
    expect(provider.mediaHashes(VAULT)).toEqual([]);
    // The same photo attached again later is uploaded again.
    clock += 1000;
    await attachPhoto(b, 'e2');
    await sync(b);
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
  });

  test('a photo some head still refers to is never collected', async () => {
    const [a, b] = [device(), device()];
    await attachPhoto(a, 'e1');
    for (const target of [a, b, a]) await sync(target);
    expect(await days(150, [a, b])).toBeNull();
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
  });

  test('an upload that never reached a backup is collected, and its device uploads it again on return', async () => {
    const [a, c] = [device(), device()];
    for (const target of [a, c, a]) await sync(target);
    // C uploads and stamps the photo, but its snapshot never makes it.
    clock += 1000;
    await attachPhoto(c, 'e1');
    provider.failNext(
      'upload-snapshot',
      new SnapshotProviderError('transient', 'offline'),
    );
    expect((await sync(c)).status).toBe('retry');
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
    // C stays away; A collects the orphan after 30 days' grace plus 30 unreferenced.
    const gone = await days(120, [a]);
    expect(gone).toBeGreaterThanOrEqual(60);
    expect(gone).toBeLessThan(63);
    // C comes back: its publication uploads the photo again, and A gets it.
    clock += 1000;
    expect((await sync(c)).status).toBe('published');
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
    await expectNothingDangling();
    clock += 1000;
    await sync(a);
    expect(
      a.database.sqlite.query('SELECT asset_id, download_state FROM media_assets').all(),
    ).toEqual([{ asset_id: 'p-e1', download_state: 'pending' }]);
  });

  test('a device whose provider cache missed the collection still uploads the blob again', async () => {
    const [a, c] = [device(), device()];
    for (const target of [a, c, a]) await sync(target);
    clock += 1000;
    await attachPhoto(c, 'e1');
    provider.failNext(
      'upload-snapshot',
      new SnapshotProviderError('transient', 'offline'),
    );
    expect((await sync(c)).status).toBe('retry');
    expect(await days(120, [a])).not.toBeNull();
    // C's cache did not hear of the delete: a cached look says it is there.
    provider.staleMedia.add(PHOTO);
    clock += 1000;
    expect((await sync(c)).status).toBe('published');
    expect(provider.staleMedia.has(PHOTO)).toBe(false);
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
    await expectNothingDangling();
    // Blobs its listed head already refers to are not asked again.
    clock += 1000;
    await addEntry(c, 'e2');
    provider.staleMedia.add('d'.repeat(64));
    const made = await requests(() => sync(c));
    expect(count(made, 'has-media')).toBe(1);
    provider.staleMedia.clear();
  });

  test('a collected blob whose file cannot be read for a while pauses instead of being published as present', async () => {
    const [a, c] = [device(), device()];
    for (const target of [a, c, a]) await sync(target);
    clock += 1000;
    await attachPhoto(c, 'e1');
    provider.failNext(
      'upload-snapshot',
      new SnapshotProviderError('transient', 'offline'),
    );
    expect((await sync(c)).status).toBe('retry');
    expect(await days(120, [a])).not.toBeNull();
    provider.staleMedia.add(PHOTO);
    // C's file cannot be read this pass (say, a locked phone).
    const bytes = blobs.media.get(PHOTO)!;
    blobs.media.delete(PHOTO);
    clock += 1000;
    expect(await sync(c)).toMatchObject({
      status: 'attention',
      reason: 'local-media-unreadable',
    });
    await expectNothingDangling();
    // Readable again: the next pass uploads it and publishes.
    blobs.media.set(PHOTO, bytes);
    c.stateStore.clearPause(VAULT, 'connection');
    clock += 1000;
    expect((await sync(c)).status).toBe('published');
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
    await expectNothingDangling();
  });

  test("a head of this device's own that a stale listing still shows is not trusted after 150 days", async () => {
    const [a, c] = [device(), device()];
    for (const target of [a, c, a]) await sync(target);
    clock += 1000;
    await attachPhoto(c, 'e1');
    await sync(c);
    const [stale] = provider
      .physicalHeads(VAULT)
      .filter(({ head }) => head?.deviceId === deviceIdOf(c));
    // An edit of C's that A will never see before deleting the entry.
    clock += 1000;
    await addEntry(c, 'e1', {
      text_content: 'Edited on C',
      assets: [{ type: AssetType.IMAGE, uri: 'photos/e1.jpg', assetId: 'p-e1' }],
    });
    // A deletes the entry; C goes quiet. After 180 days A prunes C's head,
    // compacts the delete and collects the photo. (Expiry counts from the
    // newest write A holds, so A writes again.)
    clock += 1000;
    await sync(a);
    await deleteOn(a, 'e1');
    await sync(a);
    expect(await days(200, [a])).toBeNull();
    await addEntry(a, 'keep-a-busy');
    expect(await days(100, [a])).not.toBeNull();
    // C's provider cache missed all of it: its old head and the blob.
    provider.injectPhysicalHead(stale.head!, stale.physicalId);
    provider.staleMedia.add(PHOTO);
    clock += 1000;
    // C is back after 180 days: its unseen state brings the entry back, and
    // its publication uploads the photo again rather than trusting the head.
    expect(await sync(c)).toMatchObject({ status: 'published', revivedEntries: ['e1'] });
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
    await expectNothingDangling();
    provider.staleMedia.clear();
  });

  test('a blob this pass uploaded is not looked up again before the snapshot', async () => {
    const a = device();
    await sync(a);
    clock += 1000;
    await attachPhoto(a, 'e1');
    // One look before the upload, one cached look in publish: no fresh one,
    // which a search lagging the new upload would answer with a duplicate.
    const made = await requests(() => sync(a));
    expect(count(made, 'upload-media')).toBe(1);
    expect(count(made, 'has-media')).toBe(2);
  });

  test('"Keep my entries" brings entries back with their photos', async () => {
    const [a, b] = [device(), device()];
    const ids = Array.from({ length: 12 }, (_, i) => `e${String(i).padStart(2, '0')}`);
    for (const [index, id] of ids.entries())
      await attachPhoto(a, id, index.toString(16).padStart(64, 'a'));
    for (const target of [a, b, a]) await sync(target);
    clock += 1000;
    for (const id of ids) await deleteOn(b, id);
    await sync(b);
    // A pauses for the mass deletion and stays paused for 90 days while B
    // syncs every day: A never acknowledged the deletes, so nothing compacts.
    for (let day = 0; day < 90; day++) {
      clock += DAY;
      expect((await sync(a)).status).toBe('attention');
      await sync(b);
      await expectNothingDangling();
    }
    expect(provider.mediaHashes(VAULT)).toHaveLength(12);
    a.stateStore.answerMassDeletion(VAULT, 'connection', 'keep');
    clock += 1000;
    expect((await sync(a)).status).toBe('published');
    clock += 1000;
    await sync(b);
    expect(texts(b)).toHaveLength(12);
    expect(
      b.database.sqlite.query('SELECT COUNT(*) AS n FROM media_assets').get(),
    ).toEqual({ n: 12 });
    expect(await days(60, [a, b], '0'.padStart(64, 'a'))).toBeNull();
    expect(provider.mediaHashes(VAULT)).toHaveLength(12);
  });

  test('"Keep my entries" on a device that only pulled them keeps their photos', async () => {
    const [a, b] = [device(), device()];
    // B joins first, so its own head never refers to A's photos.
    await sync(b);
    const ids = Array.from({ length: 12 }, (_, i) => `e${String(i).padStart(2, '0')}`);
    clock += 1000;
    for (const [index, id] of ids.entries())
      await attachPhoto(a, id, index.toString(16).padStart(64, 'b'));
    await sync(a);
    clock += 1000;
    expect((await sync(b)).status).toBe('pulled');
    // B has not downloaded them (`pending`), and has not published since.
    expect(
      b.database.sqlite
        .query("SELECT COUNT(*) AS n FROM media_assets WHERE download_state = 'pending'")
        .get(),
    ).toEqual({ n: 12 });
    clock += 1000;
    for (const id of ids) await deleteOn(a, id);
    await sync(a);
    for (let day = 0; day < 90; day++) {
      clock += DAY;
      expect((await sync(b)).status).toBe('attention');
      await sync(a);
      await expectNothingDangling();
    }
    // B never acknowledged the deletes, so nothing compacted: A's head
    // still refers to every photo.
    expect(provider.mediaHashes(VAULT)).toHaveLength(12);
    b.stateStore.answerMassDeletion(VAULT, 'connection', 'keep');
    clock += 1000;
    expect((await sync(b)).status).toBe('published');
    clock += 1000;
    await sync(a);
    expect(texts(a)).toHaveLength(12);
    expect(provider.mediaHashes(VAULT)).toHaveLength(12);
  });

  test('a gap of more than 14 days between checks restarts the count', async () => {
    const a = device();
    await sync(a);
    await provider.uploadMedia(VAULT, PHOTO, {
      byteLength: 3,
      contentHash: PHOTO,
      read: async () => new Uint8Array([1, 2, 3]),
    });
    // Old before the first check, so only the count holds it back.
    provider.setMediaCreatedAtForTest(VAULT, PHOTO, clock - 100 * DAY);
    expect(await days(20, [a])).toBeNull();
    clock += 20 * DAY;
    expect(await days(29, [a])).toBeNull();
    expect(await days(3, [a])).not.toBeNull();
  });

  test("the collecting device's own unpublished attachment keeps its blob", async () => {
    const a = device();
    await sync(a);
    // The same file was uploaded long ago and nothing refers to it any more.
    await provider.uploadMedia(VAULT, PHOTO, {
      byteLength: 3,
      contentHash: PHOTO,
      read: async () => new Uint8Array([1, 2, 3]),
    });
    provider.setMediaCreatedAtForTest(VAULT, PHOTO, clock - 100 * DAY);
    // A attaches it again on mobile data with Wi-Fi-only media: not published.
    provider.mediaTransfersAllowed = async () => false;
    clock += 1000;
    await attachPhoto(a, 'e1');
    expect(await days(60, [a])).toBeNull();
  });

  test('a head whose snapshot is not listed yet blocks the check', async () => {
    const { collectMedia } =
      await import('../../src/lib/cloudSync/snapshot/sync/mediaGc');
    const a = device();
    await sync(a);
    await provider.uploadMedia(VAULT, PHOTO, {
      byteLength: 3,
      contentHash: PHOTO,
      read: async () => new Uint8Array([1, 2, 3]),
    });
    provider.setMediaCreatedAtForTest(VAULT, PHOTO, clock - 100 * DAY);
    provider.injectPhysicalHead({
      format: 'tackbok-head',
      vaultId: VAULT,
      deviceId: 'other-device',
      deviceSequence: 1,
      snapshotId: 'f'.repeat(64),
      updatedAt: clock,
      ...{ major: 2, required: [] },
    });
    expect(
      await devices.on(a.database, clock, () =>
        collectMedia({ vaultId: VAULT, provider, now: clock }),
      ),
    ).toEqual({ status: 'blocked', reason: 'head-snapshot-not-listed' });
  });

  test('nothing is collected while a head or a snapshot cannot be read', async () => {
    for (const damage of ['head', 'snapshot'] as const) {
      provider = new FakeSnapshotProvider();
      clock = T;
      const a = device();
      await attachPhoto(a, 'e1');
      await sync(a);
      clock += 1000;
      await deleteOn(a, 'e1');
      await sync(a);
      if (damage === 'head') provider.injectUnreadableHead(VAULT, 'dead-device');
      // An old snapshot no head points to, which retention has not removed yet.
      else
        provider.injectSnapshot(VAULT, 'e'.repeat(64), new Uint8Array([31, 139]), clock);
      const gone = await days(100, [a]);
      if (damage === 'head') expect(gone).toBeNull();
      else {
        // Retention removes the damaged snapshot after 30 days; then the
        // 30-day count starts.
        expect(gone).toBeGreaterThanOrEqual(60);
      }
    }
  });

  test.each([
    ['jumps far ahead', 100 * DAY],
    ['is set far back', -100 * DAY],
  ])(
    'a device clock that %s neither shortens the 30 days nor stops collection',
    async (_name, jump) => {
      const a = device();
      await sync(a);
      let real = clock;
      provider.serverClock = () => real;
      await attachPhoto(a, 'e1');
      await sync(a);
      clock += 1000;
      real += 1000;
      await deleteOn(a, 'e1');
      await sync(a);
      const deletedAt = real;
      // Retention and collection count by Drive's clock (#185 P9), so a jump
      // of this device's clock after ten days changes nothing.
      let gone: number | null = null;
      for (let day = 1; day <= 90 && gone === null; day++) {
        clock += DAY + (day === 10 ? jump : 0);
        real += DAY;
        await sync(a);
        await expectNothingDangling();
        if (!provider.mediaHashes(VAULT).includes(PHOTO)) gone = real - deletedAt;
      }
      // The snapshots that held it stay 30 days, then 30 days unreferenced.
      expect(gone).not.toBeNull();
      expect(gone!).toBeGreaterThanOrEqual(60 * DAY);
      expect(gone!).toBeLessThan(65 * DAY);
    },
  );

  test('a snapshot that alone refers to a photo is not thinned: it stays 30 days', async () => {
    const a = device();
    await sync(a);
    // UTC midnight, so the day's snapshots are one history day.
    clock = Math.ceil(clock / DAY) * DAY + 60 * 60 * 1000;
    await attachPhoto(a, 'e1');
    await sync(a);
    const withPhoto = headSnapshot(a);
    clock += 1000;
    await deleteOn(a, 'e1');
    await sync(a);
    // A single device compacts the delete at once: later snapshots no
    // longer refer to the photo.
    clock += 1000;
    await addEntry(a, 'e2');
    await sync(a);
    const plain = headSnapshot(a);
    clock += 1000;
    await addEntry(a, 'e3');
    await sync(a);
    const dayEnd = headSnapshot(a);
    for (let day = 1; day <= 29; day++) {
      clock += DAY;
      await addEntry(a, `d${day}`);
      await sync(a);
      // Thinned: covered by the day's last snapshot. Kept: the photo.
      expect(provider.snapshotIds(VAULT)).not.toContain(plain);
      expect(provider.snapshotIds(VAULT)).toContain(dayEnd);
      expect(provider.snapshotIds(VAULT)).toContain(withPhoto);
      expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
    }
    clock += DAY;
    await addEntry(a, 'd30');
    await sync(a);
    expect(provider.snapshotIds(VAULT)).not.toContain(withPhoto);
  });

  test('a check reads at most 10 snapshots per pass, and a damaged cache row is read again', async () => {
    const { collectMedia } =
      await import('../../src/lib/cloudSync/snapshot/sync/mediaGc');
    const a = device();
    for (let index = 0; index < 12; index++) {
      clock += 1000;
      await addEntry(a, `e${index}`);
      await sync(a);
    }
    await provider.uploadMedia(VAULT, PHOTO, {
      byteLength: 3,
      contentHash: PHOTO,
      read: async () => new Uint8Array([1, 2, 3]),
    });
    provider.setMediaCreatedAtForTest(VAULT, PHOTO, clock - 31 * DAY);
    a.database.sqlite.run('DELETE FROM sync_snapshot_media');
    const check = () =>
      requests(async () => {
        outcome = await devices.on(a.database, clock, () =>
          collectMedia({ vaultId: VAULT, provider, now: clock }),
        );
      });
    let outcome: unknown;
    expect(count(await check(), 'download-snapshot')).toBe(10);
    expect(outcome).toEqual({ status: 'incomplete', deleted: [] });
    expect(count(await check(), 'download-snapshot')).toBe(2);
    expect(outcome).toEqual({ status: 'checked', deleted: [] });
    a.database.sqlite.run("UPDATE sync_snapshot_media SET blobs_json = 'not json'");
    expect(count(await check(), 'download-snapshot')).toBe(10);
    // Valid JSON that is not a list of blob hashes is damaged too.
    a.database.sqlite.run(
      "UPDATE sync_snapshot_media SET blobs_json = CASE WHEN rowid % 2 = 0 THEN 'null' ELSE '{}' END",
    );
    expect(count(await check(), 'download-snapshot')).toBe(10);
    expect(
      a.database.sqlite
        .query("SELECT COUNT(*) AS n FROM sync_snapshot_media WHERE blobs_json = '[]'")
        .get(),
    ).toEqual({ n: 10 });
  });

  test('a snapshot thinned while the check reads it makes the check incomplete, not blocked', async () => {
    const { collectMedia } =
      await import('../../src/lib/cloudSync/snapshot/sync/mediaGc');
    const a = device();
    await attachPhoto(a, 'e1');
    await sync(a);
    clock += 1000;
    await deleteOn(a, 'e1');
    await sync(a);
    clock += 40 * DAY;
    // A snapshot this device never read, which another device thins as
    // this check lists it.
    const extra = 'e'.repeat(64);
    provider.injectSnapshot(VAULT, extra, new Uint8Array([1]), clock - DAY);
    const download = provider.downloadSnapshot.bind(provider);
    provider.downloadSnapshot = async (vaultId, snapshotId) => {
      if (snapshotId === extra) await provider.deleteSnapshot(vaultId, extra);
      return download(vaultId, snapshotId);
    };
    const outcome = await devices.on(a.database, clock, () =>
      collectMedia({ vaultId: VAULT, provider, now: clock }),
    );
    expect(outcome).toEqual({ status: 'incomplete', deleted: [] });
  });

  test('a snapshot that appears before a delete stops it', async () => {
    const { collectMedia } =
      await import('../../src/lib/cloudSync/snapshot/sync/mediaGc');
    const a = device();
    await sync(a);
    // An upload no snapshot ever referred to, collected after 60 days.
    await provider.uploadMedia(VAULT, PHOTO, {
      byteLength: 3,
      contentHash: PHOTO,
      read: async () => new Uint8Array([1, 2, 3]),
    });
    provider.setMediaCreatedAtForTest(VAULT, PHOTO, clock);
    // Old enough at day 30; 30 days unreferenced by day 60.
    expect(await days(59, [a])).toBeNull();
    // A provider that lists one more snapshot once the check has read them.
    let lists = 0;
    const late = Object.create(provider) as Provider;
    late.listSnapshots = async (vaultId: string) => {
      const listed = await provider.listSnapshots(vaultId);
      return ++lists > 1
        ? [...listed, { snapshotId: 'f'.repeat(64), createdAt: clock, byteCount: 1 }]
        : listed;
    };
    clock += 2 * DAY;
    const outcome = await devices.on(a.database, clock, () =>
      collectMedia({ vaultId: VAULT, provider: late, now: clock }),
    );
    expect(outcome).toEqual({ status: 'incomplete', deleted: [] });
    expect(provider.mediaHashes(VAULT)).toEqual([PHOTO]);
  });
});
