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
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expoFiles } from '../cloud-sync/sim/expoFiles';
import { sha256Bytes } from '../../src/lib/cloudSync/snapshot/sha256';

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
// The download sink, on disk: appends, then checks size and hash and
// promotes to `<hash>.bin`, as the native-backed one does.
mock.module('../../src/lib/cloudSync/snapshot/media', () => ({
  createMediaPartialFileSink: (directory: { uri: string }, blobHash: string) => {
    const dir = directory.uri.replace('file://', '');
    mkdirSync(dir, { recursive: true });
    const partial = join(dir, `${blobHash}.partial`);
    return {
      byteLength: async () =>
        existsSync(partial) ? readFileSync(partial).byteLength : 0,
      appendAndSync: async (bytes: Uint8Array) => appendFileSync(partial, bytes),
      reset: async () => rmSync(partial, { force: true }),
      verifyAndPromote: async (length: number, hash: string) => {
        const bytes = new Uint8Array(readFileSync(partial));
        if (bytes.byteLength !== length || sha256Bytes(bytes) !== hash)
          throw new Error('downloaded media does not match');
        renameSync(partial, join(dir, `${blobHash}.bin`));
      },
    };
  },
}));
mock.module('../../src/lib/cloudSync/ui/production', () => ({
  configuredDriveProvider: async () => {
    throw new Error('The test passes its provider');
  },
}));
mock.module('expo-document-picker', () => ({ getDocumentAsync: async () => null }));
// The native digest becomes pure JS here: same hashes, no expo-crypto.
mock.module('../../src/lib/cloudSync/snapshot/runtime/nativeSha256', () => ({
  nativeCodecWork: {
    hashBytes: async (bytes: Uint8Array) => sha256Bytes(bytes),
    pause: async () => {},
  },
}));
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
const { BackupHistoryError, buildBackupHistoryArchive } =
  await import('../../src/lib/cloudSync/ui/backupHistory');
const { importFromTackbokBackup } =
  await import('../../src/lib/backupImport/import/tackbok');
const { File: ExpoFile } = await import('expo-file-system');

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
    const work = await write(a, (tx) => repositories.createTagInTransaction(tx, 'Work'));
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
    await addEntry(a, 'e2', { text_content: 'Original two', tags: work });
    for (const target of [a, b, a]) await sync(target);
    const backup = headSnapshot(a);
    // Since the backup: e1 and its tag deleted, e2 rewritten and its tag
    // deleted, e3 written, the spare tag and the prompt deleted.
    clock += 1000;
    await write(a, async (tx) => {
      await repositories.deleteEntryInTransaction(tx, 'e1', { now: clock });
      for (const id of [tag, work, spare])
        await repositories.deleteTagInTransaction(tx, id, { now: clock });
      await repositories.deletePromptInTransaction(tx, prompt, { now: clock });
    });
    await addEntry(a, 'e2', { text_content: 'Garbled' });
    await addEntry(a, 'e3', { text_content: 'Written later' });
    for (const target of [a, b]) await sync(target);
    return { a, b, backup, tag, work };
  }

  async function restoreThroughArchive(
    target: Device,
    backup: string,
    mode: 'skip' | 'overwrite',
    /** No copy on this device: the photo is downloaded from the provider. */
    fromDrive = false,
  ) {
    // This device's verified copy of the photo, as the media store finds it.
    const local = join(FILES, `local-${PHOTO}`);
    writeFileSync(local, PHOTO_BYTES);
    return devices.on(target.database, clock, async () => {
      const archive = await buildBackupHistoryArchive(backup, 'restore', {
        provider,
        localFile: async (blobHash) =>
          !fromDrive && blobHash === PHOTO ? (new ExpoFile(local) as never) : null,
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
      const { a, b, backup, tag, work } = await journalWithHistory();
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
      // A tag deleted since the backup comes back with an entry the restore
      // writes that uses it; one only skipped entries or no entry use stays gone.
      expect(ids(a, 'SELECT title FROM tags ORDER BY title')).toEqual(
        mode === 'skip'
          ? [{ title: 'Family' }]
          : [{ title: 'Family' }, { title: 'Work' }],
      );
      expect(ids(a, "SELECT tags FROM entries WHERE note_id = 'e2'")).toEqual([
        { tags: mode === 'skip' ? '' : work },
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

  test('a photo this device lacks is downloaded from the provider into the archive', async () => {
    const { a, backup } = await journalWithHistory();
    clock += 1000;
    const { archive, summary } = await restoreThroughArchive(a, backup, 'skip', true);
    expect(archive.missingMedia).toBe(0);
    expect(summary.failedAssets).toBe(0);
    expect(ids(a, "SELECT blob_hash FROM media_assets WHERE owner_id = 'e1'")).toEqual([
      { blob_hash: PHOTO },
    ]);
    // The download went once it was in the archive.
    expect(existsSync(join(FILES, 'cache', 'backup-history-media'))).toBe(false);
  });

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

  describe('a backup a newer Tackbok has written to (#251)', () => {
    /** Another device's head, as a build with a feature this one lacks writes it. */
    const newerHead = (fields: Record<string, unknown>) =>
      provider.injectPhysicalHead({
        format: 'tackbok-head',
        major: 2,
        required: [],
        vaultId: VAULT,
        deviceId: 'newer-device',
        deviceSequence: 1,
        snapshotId: 'f'.repeat(64),
        updatedAt: clock,
        ...fields,
      } as never);
    const archives = () =>
      existsSync(join(FILES, 'cache'))
        ? readdirSync(join(FILES, 'cache')).filter((name) => name.endsWith('.zip'))
        : [];

    test.each([
      ['export', 'a required feature', { required: ['media-packs'] }],
      ['restore', 'a required feature', { required: ['media-packs'] }],
      ['restore', 'a newer major version', { major: 3 }],
    ] as const)(
      '%s of an older backup is refused, with %s on a head, before anything is downloaded',
      async (purpose, _name, fields) => {
        const { a, backup } = await journalWithHistory();
        newerHead(fields);
        clock += 1000;
        const before = texts(a);
        const made = provider.requests.length;
        const refused = await devices.on(a.database, clock, () =>
          buildBackupHistoryArchive(backup, purpose, {
            provider,
            localFile: async () => null,
          }).then(
            () => null,
            (error: unknown) => error,
          ),
        );
        expect(refused).toBeInstanceOf(BackupHistoryError);
        expect((refused as InstanceType<typeof BackupHistoryError>).reason).toBe(
          'update-required',
        );
        const requested = provider.requests.slice(made);
        expect(requested).not.toContain('download-snapshot');
        expect(requested).not.toContain('download-media');
        // No archive, so nothing for the import to read: the journal is untouched.
        expect(archives()).toEqual([]);
        expect(texts(a)).toEqual(before);
      },
    );

    test('a pause for an update refuses it too, before anything is downloaded', async () => {
      const { a, backup } = await journalWithHistory();
      a.database.sqlite.run(
        `INSERT INTO cloud_sync_state (vault_id, device_id, pause_reason, updated_at)
           VALUES (?, 'unused', 'unsupported-format', ?)
         ON CONFLICT (vault_id, device_id) DO UPDATE SET pause_reason = excluded.pause_reason`,
        [VAULT, T],
      );
      const made = provider.requests.length;
      await expect(
        devices.on(a.database, clock, () =>
          buildBackupHistoryArchive(backup, 'export', {
            provider,
            localFile: async () => null,
          }),
        ),
      ).rejects.toMatchObject({ reason: 'update-required' });
      expect(provider.requests.slice(made)).not.toContain('download-snapshot');
    });

    test('a readable head beside it changes nothing: an optional feature is not required', async () => {
      const { a, backup } = await journalWithHistory();
      newerHead({ required: [] });
      clock += 1000;
      const { archive, summary } = await restoreThroughArchive(a, backup, 'skip');
      expect(archive.missingMedia).toBe(0);
      expect(summary.failedAssets).toBe(0);
      expect(texts(a)).toContain('e1:With a photo');
    });
  });
});
