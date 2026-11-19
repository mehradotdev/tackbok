/**
 * Backup history (#185 P9): an earlier snapshot, read back as the portable
 * model and restored through the ordinary import, against real SQLite and
 * the shared fake provider. A restore brings back what the backup had and
 * never deletes; the other devices take it in by the ordinary sync.
 */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expoFiles } from './sim/expoFiles';

import {
  BunSyncDatabase,
  installSqliteDevices,
  type SqliteDevice,
} from './sim/sqliteDevices';

const devices = installSqliteDevices();
// Real files under a temp directory: the archive and imported media.
const FILES = mkdtempSync(join(tmpdir(), 'tackbok-backup-history-'));
afterAll(() => rmSync(FILES, { recursive: true, force: true }));
mock.module('expo-file-system', () => expoFiles(FILES));
mock.module('../../src/lib/photoUtils', () => ({ deletePhotoFile: () => {} }));
mock.module('../../src/lib/voiceMemoUtils', () => ({ deleteVoiceMemoFile: () => {} }));

const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const { FakeSnapshotProvider, MemorySnapshotMediaStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/fakes');
const { SQLiteSyncStateStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/sqliteState');
const { V2SyncEngine } = await import('../../src/lib/cloudSync/snapshot/sync/v2Engine');
const { simMediaFiles } = await import('./sim/v2StoreAdapter');
const { decodeEnvelope } = await import('../../src/lib/cloudSync/v2/codec');
const { snapshotToPortable } =
  await import('../../src/lib/backupExport/snapshotPortable');
const { importPortableEntries, upsertPortableTags } =
  await import('../../src/lib/backupImport/portable');
const { createBackupImportSummary } = await import('../../src/lib/backupImport/summary');
const { entries } = await import('../../src/db/schema');

const { AssetType } = await import('../../src/types');

const VAULT = 'vault-history';
const T = 1_790_000_000_000;

interface Device {
  database: SqliteDevice;
  engine: InstanceType<typeof V2SyncEngine>;
}

let provider: InstanceType<typeof FakeSnapshotProvider>;
let blobs: InstanceType<typeof MemorySnapshotMediaStore>;
let opened: Device[] = [];
let clock = T;

function device(): Device {
  const database = devices.create();
  const engine = new V2SyncEngine({
    vaultId: VAULT,
    stateKey: 'connection',
    stateStore: new SQLiteSyncStateStore(new BunSyncDatabase(database.sqlite)),
    provider,
    mediaStore: blobs,
    files: simMediaFiles,
  });
  const created = { database, engine };
  opened.push(created);
  return created;
}

const sync = (target: Device) =>
  devices.on(target.database, clock, () => target.engine.sync());
const write = <R>(
  target: Device,
  operation: (
    tx: Parameters<Parameters<typeof repositories.runInCloudSyncTransaction>[0]>[0],
  ) => Promise<R>,
) =>
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
const headSnapshot = (target: Device) => {
  const deviceId = (
    target.database.sqlite
      .query("SELECT device_id FROM sync_device WHERE id = 'self'")
      .get() as { device_id: string }
  ).device_id;
  return provider.physicalHeads(VAULT).find((head) => head.head?.deviceId === deviceId)!
    .head!.snapshotId;
};

/** As `importFromTackbokBackup` does with the archive's entries and tags. */
async function restore(
  target: Device,
  snapshotId: string,
  mode: 'skip' | 'overwrite',
  options: {
    history?: boolean;
    /** As the archive builder does when media is gone everywhere. */
    dropMedia?: boolean;
  } = { history: true },
) {
  const bytes = provider.snapshotBytesForTest(VAULT, snapshotId)!;
  const portable = snapshotToPortable(decodeEnvelope(bytes, snapshotId).state, null);
  if (options.dropMedia)
    portable.entries = portable.entries.map((entry) =>
      entry.assets.length ? { ...entry, assets: [], mediaIncomplete: true } : entry,
    );
  const summary = createBackupImportSummary();
  await write(target, async (tx) => {
    const tagMap = await upsertPortableTags(tx, portable.tags, summary, 'batch');
    const existing = new Set(
      (await tx.select({ note_id: entries.note_id }).from(entries)).map(
        (row) => row.note_id,
      ),
    );
    await importPortableEntries(
      tx,
      portable.entries,
      existing,
      tagMap,
      summary,
      mode,
      {} as never,
      [],
      'tackbok',
      undefined,
      'batch',
      { history: options.history },
    );
  });
  return { portable, summary };
}

beforeEach(() => {
  provider = new FakeSnapshotProvider();
  blobs = new MemorySnapshotMediaStore();
  clock = T;
});
afterEach(() => {
  for (const { database } of opened) database.sqlite.close();
  opened = [];
});

describe('backup history (P9)', () => {
  test('a snapshot reads back as the journal it showed', async () => {
    const a = device();
    await write(a, (tx) => repositories.createTagInTransaction(tx, 'Family'));
    const tagId = (
      a.database.sqlite.query('SELECT tag_id FROM tags').get() as { tag_id: string }
    ).tag_id;
    await addEntry(a, 'e1', {
      text_title: 'Title',
      text_content: 'Body',
      mood: 'HAPPY',
      tags: tagId,
      created_at: T - 5000,
    });
    await addEntry(a, 'e2');
    await sync(a);
    const bytes = provider.snapshotBytesForTest(VAULT, headSnapshot(a))!;
    const portable = snapshotToPortable(decodeEnvelope(bytes).state, 'me@example.com');
    expect(portable.entries.map((entry) => entry.noteId)).toEqual(['e2', 'e1']);
    expect(portable.entries[1]).toMatchObject({
      textTitle: 'Title',
      textContent: 'Body',
      mood: 'HAPPY',
      tagIds: [tagId],
      tagTitles: ['Family'],
      createdAt: T - 5000,
      assets: [],
    });
    expect(portable.tags).toMatchObject([{ tagId, title: 'Family' }]);
    expect(portable.profile).toMatchObject({ email: 'me@example.com', imagePath: null });
    expect(portable.media).toEqual([]);
  });

  test('restoring brings back deleted entries, keeps later ones, and reaches other devices', async () => {
    const [a, b] = [device(), device()];
    await addEntry(a, 'e1', { text_content: 'Original one' });
    await addEntry(a, 'e2', { text_content: 'Original two' });
    for (const target of [a, b, a]) await sync(target);
    const backup = headSnapshot(a);
    // A bad but valid change: e1 deleted, e2 rewritten; and a new entry.
    clock += 1000;
    await write(a, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: clock }),
    );
    await addEntry(a, 'e2', { text_content: 'Garbled' });
    await addEntry(a, 'e3', { text_content: 'Written later' });
    await sync(a);
    await sync(b);
    expect(texts(b)).toEqual(['e2:Garbled', 'e3:Written later']);

    // "Skip": e1 comes back; e2 keeps its current text; e3 stays.
    clock += 1000;
    const skipped = await restore(b, backup, 'skip');
    expect(skipped.summary).toMatchObject({ importedEntries: 1, skippedEntries: 1 });
    expect(texts(b)).toEqual(['e1:Original one', 'e2:Garbled', 'e3:Written later']);

    // "Overwrite": e2 takes the backup's text; still nothing is deleted.
    clock += 1000;
    await restore(b, backup, 'overwrite');
    expect(texts(b)).toEqual(['e1:Original one', 'e2:Original two', 'e3:Written later']);

    // The other device takes the restore in as ordinary edits.
    await sync(b);
    clock += 1000;
    await sync(a);
    expect(texts(a)).toEqual(['e1:Original one', 'e2:Original two', 'e3:Written later']);
  });

  test('restoring a deleted entry with a photo gives the photo a new ID, and both devices sync', async () => {
    const [a, b] = [device(), device()];
    const hash = 'c'.repeat(64);
    const photo = { type: AssetType.IMAGE, uri: 'photos/p.jpg', assetId: 'p-1' };
    await addEntry(a, 'e1', { assets: [photo] });
    a.database.sqlite.run(
      "UPDATE media_assets SET blob_hash = ?, byte_size = 3 WHERE asset_id = 'p-1'",
      [hash],
    );
    await blobs.writeVerified(hash, new Uint8Array([1, 2, 3]));
    for (const target of [a, b, a]) await sync(target);
    // Deleted on A; B still holds the photo's descriptor behind the delete.
    clock += 1000;
    await write(a, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: clock }),
    );
    await sync(a);
    await sync(b);
    // The import writes it again with the archive's asset ID, as a restore does.
    clock += 1000;
    await addEntry(a, 'e1', {
      assets: [{ ...photo, uri: 'photos/restored.jpg', blobHash: hash, byteSize: 3 }],
    });
    const ids = (target: Device) =>
      (
        target.database.sqlite
          .query("SELECT asset_id FROM media_assets WHERE owner_id = 'e1'")
          .all() as { asset_id: string }[]
      ).map((row) => row.asset_id);
    expect(ids(a)).toHaveLength(1);
    expect(ids(a)[0]).not.toBe('p-1');
    for (const target of [a, b, a, b])
      expect(['published', 'pulled', 'up-to-date']).toContain(
        (await sync(target)).status,
      );
    expect(ids(b)).toEqual(ids(a));
    expect(texts(b)).toEqual(['e1:Text e1']);
  });

  test('an entry sync does not know yet keeps the asset IDs it is imported with', async () => {
    const a = device();
    await addEntry(a, 'fresh', {
      assets: [{ type: AssetType.IMAGE, uri: 'photos/f.jpg', assetId: 'kept-id' }],
    });
    expect(
      a.database.sqlite
        .query("SELECT asset_id FROM media_assets WHERE owner_id = 'fresh'")
        .all(),
    ).toEqual([{ asset_id: 'kept-id' }]);
  });

  test('a deleted entry comes back though another entry has its date and text', async () => {
    const a = device();
    await addEntry(a, 'e1', { text_content: 'Same text' });
    await sync(a);
    const backup = headSnapshot(a);
    // A "Keep both" copy with the same date and text; then the original goes.
    clock += 1000;
    await addEntry(a, 'twin', { text_content: 'Same text', text_title: 'Copy' });
    await write(a, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: clock }),
    );
    // An ordinary import would take it for a duplicate from another app.
    await restore(a, backup, 'skip', { history: false });
    expect(texts(a)).toEqual(['twin:Same text']);
    await restore(a, backup, 'skip');
    expect(texts(a)).toEqual(['e1:Same text', 'twin:Same text']);
  });

  test("an overwrite whose backup media is gone keeps the entry's current attachments", async () => {
    const a = device();
    const old = { type: AssetType.IMAGE, uri: 'photos/old.jpg', assetId: 'old' };
    await addEntry(a, 'e1', { text_content: 'Before', assets: [old] });
    a.database.sqlite.run(
      "UPDATE media_assets SET blob_hash = ?, byte_size = 3 WHERE asset_id = 'old'",
      ['c'.repeat(64)],
    );
    await blobs.writeVerified('c'.repeat(64), new Uint8Array([1, 2, 3]));
    expect((await sync(a)).status).toBe('published');
    const backup = headSnapshot(a);
    clock += 1000;
    const added = { type: AssetType.IMAGE, uri: 'photos/new.jpg', assetId: 'new' };
    await addEntry(a, 'e1', { text_content: 'Edited', assets: [old, added] });
    await restore(a, backup, 'overwrite', { history: true, dropMedia: true });
    expect(texts(a)).toEqual(['e1:Before']);
    expect(
      (
        a.database.sqlite
          .query(
            "SELECT local_uri FROM media_assets WHERE owner_id = 'e1' ORDER BY local_uri",
          )
          .all() as { local_uri: string }[]
      ).map((row) => row.local_uri),
    ).toEqual(['photos/new.jpg', 'photos/old.jpg']);
  });

  test('an overwrite keeps the file of a photo this journal still has, without a second copy', async () => {
    const a = device();
    const photo = { type: AssetType.IMAGE, uri: 'photos/kept.jpg', assetId: 'kept' };
    await addEntry(a, 'e1', { text_content: 'Before', assets: [photo] });
    a.database.sqlite.run(
      "UPDATE media_assets SET blob_hash = ?, byte_size = 3 WHERE asset_id = 'kept'",
      ['c'.repeat(64)],
    );
    await blobs.writeVerified('c'.repeat(64), new Uint8Array([1, 2, 3]));
    expect((await sync(a)).status).toBe('published');
    const backup = headSnapshot(a);
    clock += 1000;
    await addEntry(a, 'e1', { text_content: 'Edited', assets: [photo] });
    // The archive here holds no files: only a kept photo can stay.
    await restore(a, backup, 'overwrite');
    expect(texts(a)).toEqual(['e1:Before']);
    expect(
      a.database.sqlite
        .query("SELECT asset_id, local_uri FROM media_assets WHERE owner_id = 'e1'")
        .all(),
    ).toEqual([{ asset_id: 'kept', local_uri: 'photos/kept.jpg' }]);
  });

  test("an attachment's photo and voice note are listed with their files", async () => {
    const a = device();
    await addEntry(a, 'e1', {
      assets: [
        { type: AssetType.IMAGE, uri: 'photos/a.jpg', assetId: 'p-1' },
        { type: AssetType.AUDIO, uri: 'voice/a.m4a', assetId: 'v-1' },
      ],
    });
    a.database.sqlite.run(
      "UPDATE media_assets SET blob_hash = ?, byte_size = 3, mime_type = 'image/png' WHERE asset_id = 'p-1'",
      ['c'.repeat(64)],
    );
    a.database.sqlite.run(
      "UPDATE media_assets SET blob_hash = ?, byte_size = 4 WHERE asset_id = 'v-1'",
      ['d'.repeat(64)],
    );
    await blobs.writeVerified('c'.repeat(64), new Uint8Array([1, 2, 3]));
    await blobs.writeVerified('d'.repeat(64), new Uint8Array([1, 2, 3, 4]));
    expect((await sync(a)).status).toBe('published');
    const state = decodeEnvelope(
      provider.snapshotBytesForTest(VAULT, headSnapshot(a))!,
    ).state;
    const { entries: portableEntries, media } = snapshotToPortable(state, null);
    expect(portableEntries[0].assets).toMatchObject([
      { type: AssetType.IMAGE, assetId: 'p-1', path: 'media/photos/1.png' },
      { type: AssetType.AUDIO, assetId: 'v-1', path: 'media/voice-memos/2.m4a' },
    ]);
    expect(media.map((file) => file.blobHash).sort()).toEqual([
      'c'.repeat(64),
      'd'.repeat(64),
    ]);
  });
});
