import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema';

const sqlite = new Database(':memory:');
const migrations = (
  JSON.parse(
    readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] }
).entries.map(({ tag }) => ({
  tag,
  sql: readFileSync(
    join(import.meta.dir, `../../src/drizzle/${tag}.sql`),
    'utf8',
  ).replaceAll('--> statement-breakpoint', ''),
}));
const archiveMigration = migrations.findIndex(({ tag }) => tag.startsWith('0006_'));
// Stop before the archive so tests can seed rows from an older install.
for (const { sql } of migrations.slice(0, archiveMigration)) sqlite.exec(sql);
let upgraded = false;
const upgrade = () => {
  if (upgraded) return;
  for (const { sql } of migrations.slice(archiveMigration)) sqlite.exec(sql);
  upgraded = true;
};

// Bun's SQLite accepts far more bound variables than the app's Expo SQLite
// (32,766), so tests check how many a statement binds instead.
let mostParams = 0;
const db = drizzle(sqlite, {
  schema,
  logger: {
    logQuery: (_query, params) => {
      mostParams = Math.max(mostParams, params.length);
    },
  },
});
mock.module('../../src/db', () => ({
  ...schema,
  db,
  runExclusiveDbTransaction: async (operation: (tx: typeof db) => Promise<unknown>) => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await operation(db);
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
}));
mock.module('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
mock.module('../../src/lib/photoUtils', () => ({ photoFileExists: () => true }));
mock.module('../../src/lib/settings', () => ({
  hydrateProfileCache() {},
  useSettingsStore: { getState: () => ({}) },
}));
mock.module('../../src/lib/cloudSync/runtime/production', () => ({
  notifyProductionCloudSyncChanged() {},
}));
const { acknowledgeCloudConflicts, acknowledgeEntryConflicts, listCloudConflictItems } =
  await import('../../src/lib/cloudSync/ui/conflicts');
afterAll(() => sqlite.close());

const JOINED_AT = 500;
function conflict(
  id: string,
  fields: {
    entityType?: string;
    entityId?: string;
    field?: string;
    baseValueHash?: string | null;
    value?: string | null;
    recoveredEntityIds?: string[];
  },
  row: { acknowledged_at?: number } = {},
) {
  // Raw SQL: rows may be seeded before the upgrade adds columns.
  sqlite
    .query(
      'INSERT INTO cloud_conflicts (vault_id, conflict_id, conflict_json, acknowledged_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      'vault',
      id,
      JSON.stringify({
        conflictId: id,
        entityType: fields.entityType ?? 'profile',
        entityId: fields.entityId ?? 'profile',
        field: fields.field ?? 'displayName',
        baseValueHash: fields.baseValueHash ?? null,
        alternates: fields.value === undefined ? [] : [{ value: fields.value }],
        recoveredEntityIds: fields.recoveredEntityIds ?? [],
      }),
      row.acknowledged_at ?? null,
      JOINED_AT + 1,
    );
}

beforeEach(() => {
  sqlite.exec(
    'DELETE FROM cloud_conflicts; DELETE FROM cloud_vault; DELETE FROM user_profile; DELETE FROM media_assets; DELETE FROM entries',
  );
  sqlite
    .query(
      "INSERT INTO cloud_vault (vault_id, provider_kind, device_id, status, created_at, updated_at) VALUES ('vault', 'google-drive', 'device', 'idle', ?, ?)",
    )
    .run(JOINED_AT, JOINED_AT);
  mostParams = 0;
});

test('the upgrade archives only unreviewed no-base name conflicts and keeps them actionable', async () => {
  sqlite.exec(
    "INSERT INTO user_profile (profile_id, display_name, updated_at) VALUES ('self', 'Mehra', 1)",
  );
  conflict('legacy-artifact', { value: null });
  conflict('legacy-real', { value: 'Mehra A' });
  conflict('legacy-reviewed', { value: 'Old' }, { acknowledged_at: 600 });
  conflict('with-base', { baseValueHash: 'b'.repeat(64), value: 'Concurrent' });
  conflict('entry', {
    entityType: 'entry',
    field: 'content',
    recoveredEntityIds: ['gone'],
  });
  upgrade();

  const archived = sqlite
    .query(
      'SELECT conflict_id FROM cloud_conflicts WHERE archived_at IS NOT NULL ORDER BY 1',
    )
    .all();
  expect(archived).toEqual([
    { conflict_id: 'legacy-artifact' },
    { conflict_id: 'legacy-real' },
  ]);

  // Nothing is deleted: archived alternatives are still listed, marked as such.
  const items = await listCloudConflictItems();
  expect(items).toEqual([
    {
      kind: 'name',
      conflictIds: ['legacy-artifact'],
      current: 'Mehra',
      other: null,
      archived: true,
    },
    {
      kind: 'name',
      conflictIds: ['legacy-real'],
      current: 'Mehra',
      other: 'Mehra A',
      archived: true,
    },
    {
      kind: 'name',
      conflictIds: ['with-base'],
      current: 'Mehra',
      other: 'Concurrent',
      archived: false,
    },
  ]);
});

function photo(assetId: string, blobHash: string) {
  db.insert(schema.mediaAssets)
    .values({
      asset_id: assetId,
      owner_type: 'profile',
      owner_id: 'self',
      kind: 'profile-photo',
      local_uri: `photos/${assetId}.jpg`,
      download_state: 'verified',
      blob_hash: blobHash,
      created_at: 1,
      updated_at: 1,
    })
    .run();
}

test('a photo alternate with the same content as the current photo is not listed', async () => {
  upgrade();
  photo('current', 'a'.repeat(64));
  photo('same-content', 'a'.repeat(64));
  photo('different', 'b'.repeat(64));
  photo('different-copy', 'b'.repeat(64));
  db.insert(schema.userProfile)
    .values({ profile_id: 'self', photo_asset_id: 'current', updated_at: 1 })
    .run();
  conflict('same', { field: 'photoAssetId', value: 'same-content' });
  conflict('other', { field: 'photoAssetId', value: 'different' });
  conflict('other-copy', { field: 'photoAssetId', value: 'different-copy' });

  expect(await listCloudConflictItems()).toEqual([
    {
      kind: 'photo',
      conflictIds: ['other', 'other-copy'],
      otherAssetId: 'different',
      otherUri: 'photos/different.jpg',
    },
  ]);
});

test('a large journal stays within the SQLite variable limit', async () => {
  upgrade();
  const count = 33_000;
  const recovered = Array.from({ length: count }, (_, index) => `recovered-${index}`);
  sqlite.exec('BEGIN');
  const insert = sqlite.prepare(
    'INSERT INTO entries (note_id, conflict_origin_id, created_at, updated_at) VALUES (?, ?, 1, 1)',
  );
  for (const [index, id] of recovered.entries()) insert.run(id, `origin-${index}`);
  sqlite.exec('COMMIT');
  const conflictIds = Array.from({ length: 2_000 }, (_, index) => `entry-${index}`);
  for (const [index, id] of conflictIds.entries())
    conflict(id, {
      entityType: 'entry',
      field: 'content',
      recoveredEntityIds: index === 0 ? recovered : [],
    });

  const [item] = await listCloudConflictItems();
  expect(item).toMatchObject({ kind: 'entries', conflictIds: ['entry-0'] });
  expect(item.kind === 'entries' && item.recoveredEntryIds.length).toBe(count);

  await acknowledgeCloudConflicts(conflictIds);
  expect(
    sqlite
      .query('SELECT COUNT(*) AS n FROM cloud_conflicts WHERE acknowledged_at IS NULL')
      .get(),
  ).toEqual({ n: 0 });
  expect(mostParams).toBeLessThan(999);
});

function entry(noteId: string, fields: Partial<schema.NewEntry> = {}) {
  db.insert(schema.entries)
    .values({ note_id: noteId, created_at: 1, updated_at: 1, ...fields })
    .run();
}

test('an entry kept after a delete/edit race is listed with what identifies it', async () => {
  upgrade();
  entry('returned', { created_at: 7, text_title: 'Walk', text_content: 'x'.repeat(500) });
  entry('untouched');
  conflict('returned-1', {
    entityType: 'entry',
    entityId: 'returned',
    field: 'deleteEdit',
    baseValueHash: 'b'.repeat(64),
  });
  // Deleted on both sides: the entry is not in the journal.
  conflict('gone', { entityType: 'entry', entityId: 'deleted', field: 'deleteEdit' });
  conflict('tag', { entityType: 'tag', entityId: 'untouched', field: 'deleteEdit' });
  conflict(
    'dismissed',
    { entityType: 'entry', entityId: 'untouched', field: 'deleteEdit' },
    { acknowledged_at: 600 },
  );

  expect(await listCloudConflictItems()).toEqual([
    {
      kind: 'returnedEntry',
      conflictIds: ['returned-1'],
      entry: {
        entryId: 'returned',
        createdAt: 7,
        title: 'Walk',
        preview: 'x'.repeat(200),
      },
      edited: true,
    },
  ]);

  await acknowledgeCloudConflicts(['returned-1']);
  expect(await listCloudConflictItems()).toEqual([]);
});

test('keeping one version dismisses only the conflicts about its entries', async () => {
  upgrade();
  entry('origin');
  entry('copy', { conflict_origin_id: 'origin' });
  entry('other-copy', { conflict_origin_id: 'other-origin' });
  conflict('about-origin', {
    entityType: 'entry',
    entityId: 'origin',
    field: 'title',
    recoveredEntityIds: ['copy'],
  });
  conflict('about-other', {
    entityType: 'entry',
    entityId: 'other-origin',
    field: 'title',
    recoveredEntityIds: ['other-copy'],
  });
  conflict('profile', { value: 'Someone' });

  // The group still lists the original after "Keep this one" deleted it.
  await acknowledgeEntryConflicts(['origin', 'copy']);
  expect(
    sqlite
      .query(
        'SELECT conflict_id FROM cloud_conflicts WHERE acknowledged_at IS NULL ORDER BY 1',
      )
      .all(),
  ).toEqual([{ conflict_id: 'about-other' }, { conflict_id: 'profile' }]);
});
