import { afterAll, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from '../../src/db/schema';

// Expo's exclusive transactions each open a new connection and start with
// BEGIN. In WAL mode a reading transaction does not block another
// connection's commit, which the single-connection journal tests cannot show.
const directory = mkdtempSync(join(tmpdir(), 'tackbok-journal-wal-'));
const databasePath = join(directory, 'journal.sqlite');
const sqlite = new Database(databasePath);
sqlite.exec('PRAGMA journal_mode = WAL');
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
);
for (const { tag } of journal.entries) {
  sqlite.exec(
    readFileSync(
      join(import.meta.dir, `../../src/drizzle/${tag}.sql`),
      'utf8',
    ).replaceAll('--> statement-breakpoint', ''),
  );
}
const db = drizzle(sqlite, { schema });

// Pauses the rejected apply's cleanup after its reference reads have run.
let pauseCleanupReads = false;
const cleanupRead = Promise.withResolvers<void>();
const resumeCleanup = Promise.withResolvers<void>();

mock.module('../../src/db', () => ({
  ...schema,
  db,
  runExclusiveDbTransaction: async (operation: (tx: typeof db) => Promise<unknown>) => {
    const connection = new Database(databasePath);
    connection.exec('PRAGMA busy_timeout = 2000');
    connection.exec('BEGIN');
    const transaction = drizzle(connection, { schema });
    const tx = new Proxy(transaction, {
      get(target, key) {
        if (key !== 'select') return Reflect.get(target, key, target);
        return (...args: Parameters<typeof target.select>) => {
          const selected = target.select(...args);
          const fields = args[0] as Record<string, unknown> | undefined;
          if (!pauseCleanupReads || fields?.assets !== schema.entries.assets)
            return selected;
          return {
            from: (table: never) => ({
              where: (condition: never) =>
                selected
                  .from(table)
                  .where(condition)
                  .then(async (rows: unknown) => {
                    cleanupRead.resolve();
                    await resumeCleanup.promise;
                    return rows;
                  }),
            }),
          };
        };
      },
    });
    try {
      const result = await operation(tx);
      connection.exec('COMMIT');
      return result;
    } catch (error) {
      connection.exec('ROLLBACK');
      throw error;
    } finally {
      connection.close();
    }
  },
}));
mock.module('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
// Files listed here exist on the fake disk and hash to `fakeBlobHash`.
const existingFiles = new Set<string>();
const fakeBlobHash = 'a'.repeat(64);
const copiedMedia: string[] = [];
const uriOf = (part: unknown) =>
  typeof part === 'object' && part && 'uri' in part ? String(part.uri) : String(part);
mock.module('expo-file-system', () => ({
  Directory: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    get exists() {
      return existingFiles.has(this.uri);
    }
    delete() {
      existingFiles.delete(this.uri);
    }
  },
  Paths: { document: 'file:///documents' },
}));
mock.module('../../src/lib/cloudSync/snapshot/media', () => ({
  copyVerifiedMediaFile(_source: unknown, destination: { uri: string }) {
    copiedMedia.push(destination.uri);
    existingFiles.add(destination.uri);
  },
  createMediaPartialFileSink() {},
  openMediaUploadSource() {},
}));
mock.module('../../src/lib/cloudSync/media/streamingHash', () => ({
  inspectLocalMediaFile(uri: string) {
    if (!existingFiles.has(uri)) throw new Error('missing');
    return { sha256: fakeBlobHash, byteSize: 1 };
  },
}));
const { ProductionSnapshotJournalStore, ProductionSnapshotMediaStore } =
  await import('../../src/lib/cloudSync/snapshot/storage/productionJournal');
afterAll(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

test('a rejected apply cleanup never deletes a file another apply commits during its reads', async () => {
  existingFiles.add('file:///old.jpg');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'wal', device_id: 'device', updated_at: 1 })
    .run();
  db.insert(schema.mediaAssets)
    .values({
      asset_id: 'old-photo',
      owner_type: 'profile',
      owner_id: 'self',
      kind: 'profile-photo',
      local_uri: 'file:///old.jpg',
      blob_hash: fakeBlobHash,
      byte_size: 1,
      created_at: 1,
      updated_at: 1,
    })
    .run();
  db.insert(schema.userProfile)
    .values({
      profile_id: 'self',
      display_name: 'Mehra',
      photo_asset_id: 'old-photo',
      updated_at: 1,
    })
    .run();
  const loser = new ProductionSnapshotJournalStore(
    'wal',
    'device',
    new ProductionSnapshotMediaStore(),
  );
  const winner = new ProductionSnapshotJournalStore(
    'wal',
    'device',
    new ProductionSnapshotMediaStore(),
  );
  const { domain } = await loser.capture();
  domain.profile.photoAssetId = 'new-photo';
  domain.media[0].assetId = 'new-photo';

  // The loser copies a deterministic destination, then loses its generation.
  const materialized = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const materialize = Reflect.get(loser, 'materializeMedia') as (
    ...args: unknown[]
  ) => Promise<unknown>;
  Object.defineProperty(loser, 'materializeMedia', {
    value: async (...args: unknown[]) => {
      const result = await materialize.apply(loser, args);
      materialized.resolve();
      await released.promise;
      return result;
    },
  });
  const rejected = loser.applyMergedIfGeneration(domain, 0, { remoteDerived: true });
  await materialized.promise;
  const destination = copiedMedia.at(-1)!;
  sqlite.exec('UPDATE cloud_sync_state SET journal_generation = 1');

  const committed = winner.applyMergedIfGeneration(domain, 1, { remoteDerived: true });
  pauseCleanupReads = true;
  released.resolve();
  await cleanupRead.promise;
  pauseCleanupReads = false;
  // Give the winner every chance to commit while cleanup holds stale reads.
  await Promise.race([committed, Bun.sleep(50)]);
  resumeCleanup.resolve();

  expect(await rejected).toBe(false);
  expect(await committed).toBe(true);
  const row = db
    .select()
    .from(schema.mediaAssets)
    .all()
    .find((value) => value.asset_id === 'new-photo')!;
  expect(row.download_state).toBe('verified');
  expect(existingFiles.has(`file:///documents/${row.local_uri}`)).toBe(true);
  expect(`file:///documents/${row.local_uri}`).toBe(destination);
});
