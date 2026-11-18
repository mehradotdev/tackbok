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
const { V2SyncEngine, ACK_INTERVAL_MS, NO_READABLE_HEAD, removeUnreadableHeads } =
  await import('../../src/lib/cloudSync/snapshot/sync/v2Engine');
const { SnapshotProviderError } =
  await import('../../src/lib/cloudSync/snapshot/sync/types');
const { simMediaFiles } = await import('./sim/v2StoreAdapter');
const { continueAsNewDevice } =
  await import('../../src/lib/cloudSync/snapshot/sync/newDevice');
const { AssetType } = await import('../../src/types');
type Provider = InstanceType<typeof FakeSnapshotProvider>;
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
    hooks: options.at ? { at: options.at } : undefined,
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

  test('only the head this device took in is pruned, not another file under that ID', async () => {
    const [a, b] = [device(), device()];
    await sync(a);
    await addEntry(b, 'from-b');
    await sync(b);
    // A leftover older head file under B's ID, pointing elsewhere (a race).
    const [bHead] = provider
      .physicalHeads(VAULT)
      .filter((listed) => listed.head?.deviceId === deviceIdOf(b));
    provider.injectPhysicalHead({
      ...bHead.head!,
      deviceSequence: 0,
      snapshotId: 'f'.repeat(64),
    });
    clock += 200 * DAY;
    await addEntry(a, 'e1');
    // A takes B's head in during this pass; B is expired against A's newest
    // time, so the cleanup after A's publication prunes that head only.
    expect((await sync(a)).status).toBe('published');
    expect(texts(a)).toEqual(['e1:Text e1', 'from-b:Text from-b']);
    const left = provider.physicalHeads(VAULT).map((listed) => listed.head!);
    expect(left.map((head) => head.deviceId).sort()).toEqual(
      [deviceIdOf(a), deviceIdOf(b)].sort(),
    );
    expect(left.find((head) => head.deviceId === deviceIdOf(b))!.snapshotId).toBe(
      'f'.repeat(64),
    );
    // B, back, takes the leftover for a stale listing and publishes.
    clock += 1000;
    expect((await sync(b)).status).toBe('published');
    expect(texts(b)).toEqual(['e1:Text e1', 'from-b:Text from-b']);
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
    expect(await removeUnreadableHeads(provider, VAULT, skipped)).toBe(0);
    clock += DAY + 1000;
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
