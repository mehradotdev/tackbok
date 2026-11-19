/**
 * Backup history end to end (#185 P9): an archive built from a backup by
 * `buildBackupHistoryArchive`, read back by `importFromTackbokBackup`, on
 * real SQLite, real files (a temp directory) and the fake provider.
 *
 * Its own `bun test` run (`test:integration`): it mocks modules (settings,
 * the production media store) that other suites need for real, and Bun's
 * module mocks are process-wide.
 */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expoFiles } from '../cloud-sync/sim/expoFiles';

import {
  BunSyncDatabase,
  installSqliteDevices,
  type SqliteDevice,
} from '../cloud-sync/sim/sqliteDevices';

const devices = installSqliteDevices();
// Real files under a temp directory: the archive and imported media.
const FILES = mkdtempSync(join(tmpdir(), 'tackbok-backup-history-e2e-'));
afterAll(() => rmSync(FILES, { recursive: true, force: true }));
mock.module('expo-file-system', () => expoFiles(FILES));
mock.module('../../src/lib/photoUtils', () => ({ deletePhotoFile: () => {} }));
mock.module('../../src/lib/voiceMemoUtils', () => ({ deleteVoiceMemoFile: () => {} }));
// Native-backed modules the archive builder and the import reach; the test
// passes the provider and the local media lookup itself.
mock.module('../../src/lib/settings', () => ({
  useSettingsStore: { getState: () => ({ profileEmail: null }) },
  hydrateProfileCache: () => {},
}));
mock.module('../../src/lib/cloudSync/snapshot/storage', () => ({
  ProductionSnapshotMediaStore: class {
    async verifiedLocalFile() {
      return null;
    }
  },
}));
mock.module('../../src/lib/cloudSync/snapshot/media', () => ({
  createMediaPartialFileSink: () => ({}),
}));
mock.module('../../src/lib/cloudSync/ui/production', () => ({
  configuredDriveProvider: async () => {
    throw new Error('The test passes its provider');
  },
}));
mock.module('expo-document-picker', () => ({ getDocumentAsync: async () => null }));
mock.module('../../src/lib/backupExport/utils', () => ({
  cleanupDeferredBackupZipFiles: () => {},
  generateTimestamp: () => 'now',
  saveOrShareZipFile: async () => 'delete-immediately',
}));

const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const { FakeSnapshotProvider, MemorySnapshotMediaStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/fakes');
const { SQLiteSyncStateStore } =
  await import('../../src/lib/cloudSync/snapshot/sync/sqliteState');
const { V2SyncEngine } = await import('../../src/lib/cloudSync/snapshot/sync/v2Engine');
const { simMediaFiles } = await import('../cloud-sync/sim/v2StoreAdapter');
const { buildBackupHistoryArchive } =
  await import('../../src/lib/cloudSync/ui/backupHistory');
const { importFromTackbokBackup } =
  await import('../../src/lib/backupImport/import/tackbok');
const { File: ExpoFile } = await import('expo-file-system');
const { sha256Bytes } = await import('../../src/lib/cloudSync/snapshot/sha256');

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

beforeEach(() => {
  provider = new FakeSnapshotProvider();
  blobs = new MemorySnapshotMediaStore();
  clock = T;
});
afterEach(() => {
  for (const { database } of opened) database.sqlite.close();
  opened = [];
});

describe('end to end: an archive built from a backup, read back by the import', () => {
  const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
  // The import hashes what it reads: the real hash, as on Drive.
  const PHOTO = sha256Bytes(PHOTO_BYTES);
  const ids = (target: Device, sql: string) =>
    target.database.sqlite.query(sql).all() as Record<string, unknown>[];

  /** A journal with a tagged entry with a photo, a plain one, a spare tag and a prompt. */
  async function journalWithHistory() {
    const [a, b] = [device(), device()];
    a.database.sqlite.run(
      `INSERT INTO cloud_vault (vault_id, provider_kind, remote_root_id, device_id, status, created_at, updated_at)
         VALUES (?, 'google-drive', 'root', 'unused', 'enabled', ?, ?)`,
      [VAULT, T, T],
    );
    const tag = await write(a, (tx) => repositories.createTagInTransaction(tx, 'Family'));
    const spare = await write(a, (tx) =>
      repositories.createTagInTransaction(tx, 'Spare'),
    );
    const prompt = await write(a, (tx) =>
      repositories.createPromptInTransaction(tx, 'An old prompt'),
    );
    await addEntry(a, 'e1', {
      text_content: 'With a photo',
      tags: tag,
      assets: [{ type: AssetType.IMAGE, uri: 'photos/p.jpg', assetId: 'p-1' }],
    });
    a.database.sqlite.run(
      "UPDATE media_assets SET blob_hash = ?, byte_size = 4, mime_type = 'image/jpeg' WHERE asset_id = 'p-1'",
      [PHOTO],
    );
    await blobs.writeVerified(PHOTO, PHOTO_BYTES);
    await addEntry(a, 'e2', { text_content: 'Original two' });
    for (const target of [a, b, a]) await sync(target);
    const backup = headSnapshot(a);
    // Since the backup: e1 deleted, e2 rewritten, e3 written, the spare tag
    // and the prompt deleted.
    clock += 1000;
    await write(a, async (tx) => {
      await repositories.deleteEntryInTransaction(tx, 'e1', { now: clock });
      await repositories.deleteTagInTransaction(tx, spare, { now: clock });
      await repositories.deletePromptInTransaction(tx, prompt, { now: clock });
    });
    await addEntry(a, 'e2', { text_content: 'Garbled' });
    await addEntry(a, 'e3', { text_content: 'Written later' });
    for (const target of [a, b]) await sync(target);
    return { a, b, backup, tag };
  }

  async function restoreThroughArchive(
    target: Device,
    backup: string,
    mode: 'skip' | 'overwrite',
  ) {
    // This device's verified copy of the photo, as the media store finds it.
    const local = join(FILES, `local-${PHOTO}`);
    writeFileSync(local, PHOTO_BYTES);
    return devices.on(target.database, clock, async () => {
      const archive = await buildBackupHistoryArchive(backup, 'restore', {
        provider,
        localFile: async (blobHash) =>
          blobHash === PHOTO ? (new ExpoFile(local) as never) : null,
      });
      try {
        const summary = await importFromTackbokBackup(
          archive.file.uri,
          mode,
          undefined,
          'fill-empty',
        );
        return { archive, summary };
      } finally {
        archive.file.delete();
      }
    });
  }

  test.each(['skip', 'overwrite'] as const)(
    '%s: the journal matches, with no deleted tag or prompt back',
    async (mode) => {
      const { a, b, backup, tag } = await journalWithHistory();
      clock += 1000;
      const { archive, summary } = await restoreThroughArchive(a, backup, mode);
      expect(archive.missingMedia).toBe(0);
      expect(summary.failedAssets).toBe(0);
      expect(texts(a)).toEqual([
        'e1:With a photo',
        `e2:${mode === 'skip' ? 'Garbled' : 'Original two'}`,
        'e3:Written later',
      ]);
      // e1's tag and photo came back; the photo under a new ID, same bytes.
      expect(ids(a, "SELECT tags FROM entries WHERE note_id = 'e1'")).toEqual([
        { tags: tag },
      ]);
      const [photo] = ids(
        a,
        "SELECT asset_id, blob_hash FROM media_assets WHERE owner_id = 'e1'",
      );
      expect(photo.blob_hash).toBe(PHOTO);
      expect(photo.asset_id).not.toBe('p-1');
      // Deleted since the backup, and not used by a restored entry: still gone.
      expect(ids(a, 'SELECT title FROM tags ORDER BY title')).toEqual([
        { title: 'Family' },
      ]);
      expect(ids(a, 'SELECT title FROM custom_prompts')).toEqual([]);
      // Both devices sync on and agree.
      for (const target of [a, b, a, b])
        expect(['published', 'pulled', 'up-to-date']).toContain(
          (await sync(target)).status,
        );
      expect(texts(b)).toEqual(texts(a));
      expect(ids(b, 'SELECT title FROM custom_prompts')).toEqual([]);
    },
  );

  test('a photo gone everywhere is counted and left out; the entry still comes back', async () => {
    const { a, backup } = await journalWithHistory();
    provider.removeMediaForTest(VAULT, PHOTO);
    clock += 1000;
    const { archive } = await devices.on(a.database, clock, async () => {
      const built = await buildBackupHistoryArchive(backup, 'restore', {
        provider,
        localFile: async () => null,
      });
      try {
        await importFromTackbokBackup(built.file.uri, 'skip', undefined, 'fill-empty');
      } finally {
        built.file.delete();
      }
      return { archive: built };
    });
    expect(archive.missingMedia).toBe(1);
    expect(texts(a)).toContain('e1:With a photo');
    expect(ids(a, "SELECT asset_id FROM media_assets WHERE owner_id = 'e1'")).toEqual([]);
  });
});
