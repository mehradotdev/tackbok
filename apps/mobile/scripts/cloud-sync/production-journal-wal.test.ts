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
const { runExclusiveDbTransaction } = await import('../../src/db');
afterAll(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

test('a rejected apply cleanup never deletes a file another apply commits during its reads', async () => {
  existingFiles.add('file:///old.jpg');
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
  const files = new ProductionSnapshotJournalStore(
    'wal',
    new ProductionSnapshotMediaStore(),
  ).applyFiles();
  const media = [
    {
      assetId: 'new-photo',
      ownerType: 'profile' as const,
      ownerId: 'profile',
      kind: 'profile-photo' as const,
      blobHash: fakeBlobHash,
      mimeType: 'image/jpeg',
      byteSize: 1,
      width: null,
      height: null,
      durationMs: null,
      createdAt: 1,
      ext: {},
    },
  ];

  // The loser copies a deterministic destination, then its transaction is
  // rejected, as when the journal changed after its capture.
  const materialized = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const rejected = files.serialize(async () => {
    const created: string[] = [];
    await files.materialize(media, created);
    materialized.resolve();
    await released.promise;
    await files.discard(created);
    return false;
  });
  await materialized.promise;
  const destination = copiedMedia.at(-1)!;

  const committed = files.serialize(async () => {
    const created: string[] = [];
    const uris = await files.materialize(media, created);
    await runExclusiveDbTransaction((tx) =>
      tx.insert(schema.mediaAssets).values({
        asset_id: 'new-photo',
        owner_type: 'profile',
        owner_id: 'self',
        kind: 'profile-photo',
        local_uri: uris.get('new-photo')!.uri,
        download_state: uris.get('new-photo')!.verified ? 'verified' : 'pending',
        blob_hash: fakeBlobHash,
        byte_size: 1,
        created_at: 1,
        updated_at: 1,
      }),
    );
    return true;
  });
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
