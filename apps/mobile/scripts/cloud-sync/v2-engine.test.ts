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
const { V2SyncEngine, ACK_INTERVAL_MS } =
  await import('../../src/lib/cloudSync/snapshot/sync/v2Engine');
const { SnapshotProviderError } =
  await import('../../src/lib/cloudSync/snapshot/sync/types');
const { simMediaFiles } = await import('./sim/v2StoreAdapter');
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
    await sync(b);
    expect(texts(b)).toEqual(['e1:Old']);
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
    const first = provider.physicalHeads(VAULT)[0].head.snapshotId;
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
  });

  test("a stale listing of this device's own older head is not taken for another install", async () => {
    const a = device();
    await addEntry(a, 'e1');
    await sync(a);
    const [first] = provider.physicalHeads(VAULT);
    clock += 1000;
    await addEntry(a, 'e2');
    await sync(a);
    provider.removeDeviceHeadForTest(VAULT, first.head.deviceId);
    provider.injectPhysicalHead(first.head);
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
    expect(result).toMatchObject({ status: 'published', refusedHeads: 1 });
    expect(texts(a)).toEqual(['mine:Text mine']);
    expect(a.stateStore.loadState(VAULT, 'connection').pauseReason).toBeNull();
    // Once its clock is within the bound, the head is read.
    clock += 31 * DAY;
    await sync(a);
    expect(texts(a)).toContain('ahead:From the future');
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
        provider.physicalHeads(VAULT).filter(({ head }) => head.deviceId !== undefined),
      ).toHaveLength(2);
    },
  );
});
