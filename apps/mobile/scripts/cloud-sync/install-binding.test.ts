/**
 * Install-bound device ID (#185, P13): the decision table, and the check
 * against real SQLite and the fake provider. A marker is a plain variable
 * here; on a phone it is a SecureStore item that backups leave out, so an OS
 * restore is a copied database with no marker (or another install's).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  BunSyncDatabase,
  installSqliteDevices,
  type SqliteDevice,
} from './sim/sqliteDevices';

const devices = installSqliteDevices();
const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const { decideInstallBinding, ensureInstallBinding } =
  await import('../../src/lib/cloudSync/storage/installBinding');
const { resetSyncIdentityInTransaction } =
  await import('../../src/lib/cloudSync/storage/syncStamps');
const { FakeSnapshotProvider, MemorySnapshotMediaStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/fakes');
const { SQLiteSyncStateStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/sqliteState');
const { V2SyncEngine } = await import('../../src/lib/cloudSync/snapshot/sync/v2Engine');
const { simMediaFiles } = await import('./sim/v2StoreAdapter');
type CloudSyncTransaction =
  import('../../src/lib/cloudSync/storage/repositories').CloudSyncTransaction;

const VAULT = 'vault-install';
const T = 1_790_000_000_000;

interface Install {
  database: SqliteDevice;
  engine: InstanceType<typeof V2SyncEngine>;
  /** The SecureStore marker: survives what the test says it survives. */
  marker: { value: string | null };
}

let provider: InstanceType<typeof FakeSnapshotProvider>;
let blobs: InstanceType<typeof MemorySnapshotMediaStore>;
let opened: SqliteDevice[] = [];
let clock = T;

function install(
  database: SqliteDevice = devices.create(),
  marker: string | null = null,
): Install {
  opened.push(database);
  const engine = new V2SyncEngine({
    vaultId: VAULT,
    stateKey: 'connection',
    stateStore: new SQLiteSyncStateStore(new BunSyncDatabase(database.sqlite)),
    provider,
    mediaStore: blobs,
    files: simMediaFiles,
  });
  return { database, engine, marker: { value: marker } };
}

const check = (target: Install) =>
  devices.on(target.database, clock, () =>
    ensureInstallBinding({
      marker: {
        read: async () => target.marker.value,
        write: async (value) => {
          target.marker.value = value;
        },
      },
      files: simMediaFiles,
      now: clock,
    }),
  );
const sync = (target: Install) =>
  devices.on(target.database, clock, () => target.engine.sync());
const write = <T>(target: Install, operation: (tx: CloudSyncTransaction) => Promise<T>) =>
  devices.on(target.database, clock, () =>
    repositories.runInCloudSyncTransaction(operation),
  );
const addEntry = (target: Install, id: string, text: string) =>
  write(target, (tx) =>
    repositories.upsertEntryInTransaction(
      tx,
      {
        note_id: id,
        text_title: null,
        text_content: text,
        mood: null,
        created_at: T,
        updated_at: T,
        tags: '',
        assets: [],
      },
      { now: clock },
    ),
  );
const row = (target: Install) =>
  target.database.sqlite
    .query("SELECT device_id, install_id, vault_id FROM sync_device WHERE id = 'self'")
    .get() as { device_id: string; install_id: string | null; vault_id: string | null };
const texts = (target: Install, id: string) =>
  [
    ...(
      target.database.sqlite
        .query('SELECT text_content AS v FROM entries WHERE note_id = ?')
        .all(id) as { v: string }[]
    ).map((r) => r.v),
    ...(
      target.database.sqlite
        .query(
          "SELECT value_json AS v FROM sync_field_values WHERE entity_id = ? AND field = 'text'",
        )
        .all(id) as { v: string }[]
    ).map((r) => JSON.parse(r.v) as string),
  ].sort();

beforeEach(() => {
  provider = new FakeSnapshotProvider();
  blobs = new MemorySnapshotMediaStore();
  clock = T;
});
afterEach(() => {
  for (const database of opened) database.sqlite.close();
  opened = [];
});

describe('decision', () => {
  const fresh = () => 'new-marker';
  test('fresh install or upgrade: no marker, no binding → bind a new marker, keep the ID', () => {
    expect(decideInstallBinding(null, null, fresh)).toEqual({
      kind: 'bind',
      installId: 'new-marker',
      writeMarker: true,
    });
  });
  test('iPhone reinstall: the old keychain marker, a new database → adopt it, keep the ID', () => {
    expect(decideInstallBinding('kept', null, fresh)).toEqual({
      kind: 'bind',
      installId: 'kept',
      writeMarker: false,
    });
  });
  test('same install: marker and binding match → nothing', () => {
    expect(decideInstallBinding('m', 'm', fresh)).toEqual({ kind: 'bound' });
  });
  test('restored or transferred copy: a binding but no marker → new device, new marker', () => {
    expect(decideInstallBinding(null, 'm', fresh)).toEqual({
      kind: 'new-device',
      installId: 'new-marker',
      writeMarker: true,
    });
  });
  test("another install's database: the markers differ → new device, keep this marker", () => {
    expect(decideInstallBinding('mine', 'theirs', fresh)).toEqual({
      kind: 'new-device',
      installId: 'mine',
      writeMarker: false,
    });
  });
});

describe('check', () => {
  test('upgrade: a synced journal with no marker yet keeps its ID and syncs on', async () => {
    const a = install();
    await addEntry(a, 'e1', 'Before the upgrade');
    await sync(a);
    const before = row(a);
    expect(before.install_id).toBeNull();
    expect(await check(a)).toBe('bind');
    expect(row(a).device_id).toBe(before.device_id);
    expect(row(a).install_id).toBe(a.marker.value!);
    expect(await check(a)).toBe('bound');
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
  });

  test('a restored copy takes a new ID before syncing: no pause, both edits kept everywhere', async () => {
    const a = install();
    await check(a);
    await addEntry(a, 'e1', 'Before the copy');
    await sync(a);
    // An OS restore onto another phone: the database, not the marker.
    const copy = install(devices.clone(a.database));
    clock += 1000;
    await addEntry(a, 'e1', 'Edited on the original');
    // Edits made on the copy before the check (it runs before any pass) move too.
    await addEntry(copy, 'e1', 'Edited on the copy');
    await sync(a);

    const original = row(a).device_id;
    expect(await check(copy)).toBe('new-device');
    expect(row(copy).device_id).not.toBe(original);
    expect(row(copy).install_id).toBe(copy.marker.value!);
    expect(copy.marker.value).not.toBe(a.marker.value);
    expect(await check(copy)).toBe('bound');
    expect(await check(a)).toBe('bound');
    expect(row(a).device_id).toBe(original);

    clock += 1000;
    expect((await sync(copy)).status).toBe('published');
    clock += 1000;
    expect((await sync(a)).status).not.toBe('attention');
    clock += 1000;
    expect((await sync(copy)).status).not.toBe('attention');
    for (const target of [a, copy])
      expect(texts(target, 'e1')).toEqual([
        'Edited on the copy',
        'Edited on the original',
      ]);
    expect(
      provider
        .physicalHeads(VAULT)
        .map((head) => head.head?.deviceId)
        .sort(),
    ).toEqual([original, row(copy).device_id].sort());
  });

  test('a database restored onto an install with its own marker takes a new ID and keeps that marker', async () => {
    const a = install();
    await check(a);
    await sync(a);
    const other = install(devices.clone(a.database), 'other-install');
    expect(await check(other)).toBe('new-device');
    expect(other.marker.value).toBe('other-install');
    expect(row(other).install_id).toBe('other-install');
    expect(row(other).device_id).not.toBe(row(a).device_id);
  });

  test('a copy never bound to a vault keeps its ID: binding to one rebuilds it under a new ID', async () => {
    const a = install();
    await check(a);
    await addEntry(a, 'e1', 'Local only');
    const copy = install(devices.clone(a.database));
    const id = row(copy).device_id;
    expect(row(copy).vault_id).toBeNull();
    expect(await check(copy)).toBe('unbound-copy');
    expect(row(copy).device_id).toBe(id);
    expect(row(copy).install_id).toBe(copy.marker.value!);
    expect(await check(copy)).toBe('bound');
    await sync(copy);
    expect(row(copy).device_id).not.toBe(id);
    expect(row(copy).install_id).toBe(copy.marker.value!);
  });

  test('iPhone reinstall: a new database adopts the marker the keychain kept', async () => {
    const a = install();
    await check(a);
    const reinstalled = install(devices.create(), a.marker.value);
    expect(await check(reinstalled)).toBe('bind');
    expect(row(reinstalled).install_id).toBe(a.marker.value!);
    expect(row(reinstalled).device_id).not.toBe(row(a).device_id);
  });

  test('an interruption after the marker write repeats the same decision', async () => {
    const a = install();
    await check(a);
    await sync(a);
    const copy = install(devices.clone(a.database));
    // As if the app died after writing the marker, before the database.
    copy.marker.value = 'written-before-dying';
    expect(await check(copy)).toBe('new-device');
    expect(row(copy).install_id).toBe('written-before-dying');
    expect(row(copy).device_id).not.toBe(row(a).device_id);
  });

  test('"Delete all" takes a new ID but keeps the install binding', async () => {
    const a = install();
    await check(a);
    const id = row(a).device_id;
    await write(a, (tx) => resetSyncIdentityInTransaction(tx, clock));
    expect(row(a).device_id).not.toBe(id);
    expect(row(a).install_id).toBe(a.marker.value!);
    expect(await check(a)).toBe('bound');
  });

  test('a copy made while paused for another install comes out unpaused, its vault dirty', async () => {
    const a = install();
    await check(a);
    await sync(a);
    a.database.sqlite
      .exec(`INSERT INTO cloud_vault (vault_id, provider_kind, remote_root_id,
      device_id, status, created_at, updated_at) VALUES
      ('${VAULT}', 'google-drive', 'appDataFolder', 'connection', 'idle', ${T}, ${T})`);
    a.database.sqlite.exec(
      `UPDATE cloud_sync_state SET pause_reason = 'ambiguous-device-head' WHERE vault_id = '${VAULT}'`,
    );
    const copy = install(devices.clone(a.database));
    expect(await check(copy)).toBe('new-device');
    expect(
      copy.database.sqlite
        .query('SELECT pause_reason FROM cloud_sync_state WHERE vault_id = ?')
        .all(VAULT),
    ).toEqual([{ pause_reason: null }]);
    expect(copy.database.sqlite.query('SELECT status FROM cloud_vault').get()).toEqual({
      status: 'dirty',
    });
  });

  test('a marker write that fails leaves the database as it was', async () => {
    const a = install();
    await check(a);
    await sync(a);
    const copy = install(devices.clone(a.database));
    const before = row(copy);
    await expect(
      devices.on(copy.database, clock, () =>
        ensureInstallBinding({
          marker: {
            read: async () => null,
            write: () => Promise.reject(new Error('keychain full')),
          },
          files: simMediaFiles,
          now: clock,
        }),
      ),
    ).rejects.toThrow('keychain full');
    expect(row(copy)).toEqual(before);
  });

  test('a marker that cannot be read changes nothing', async () => {
    const a = install();
    await check(a);
    await sync(a);
    const before = row(a);
    await expect(
      devices.on(a.database, clock, () =>
        ensureInstallBinding({
          marker: {
            read: () => Promise.reject(new Error('locked')),
            write: () => Promise.reject(new Error('unexpected')),
          },
          files: simMediaFiles,
          now: clock,
        }),
      ),
    ).rejects.toThrow('locked');
    expect(row(a)).toEqual(before);
  });
});
