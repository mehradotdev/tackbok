/**
 * The 0011 migration (#185, P6b): drops the cloud sync v1 tables and
 * columns. Run on an empty database, one created by the earliest schema
 * (0000) and a large one; every other table and column keeps its rows.
 */
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
);
const tags = journal.entries.map((entry) => entry.tag);
const REMOVAL = tags.findIndex((tag) => tag.startsWith('0011_'));

const DROPPED_TABLES = [
  'cloud_base_shadow',
  'cloud_conflicts',
  'cloud_pending_publication',
  'cloud_shadow_reaper',
  'cloud_tombstones',
  'profile_pristine_marker',
];
const DROPPED_COLUMNS: Record<string, string[]> = {
  entries: ['conflict_origin_id'],
  tags: ['conflict_origin_id'],
  custom_prompts: ['conflict_origin_id'],
  cloud_vault: ['restore_conflict_ids_json', 'conflicts_imported_at'],
};

/** Migrations [from, to) as drizzle's migrator runs them: one transaction. */
function migrate(sqlite: Database, from: number, to: number) {
  sqlite.transaction(() => {
    for (const tag of tags.slice(from, to)) {
      const sql = readFileSync(
        join(import.meta.dir, `../../src/drizzle/${tag}.sql`),
        'utf8',
      );
      for (const statement of sql.split('--> statement-breakpoint'))
        sqlite.exec(statement);
    }
  })();
}

const tableNames = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
    )
    .all()
    .map(({ name }) => name);
const columnNames = (sqlite: Database, table: string) =>
  sqlite
    .query<{ name: string }, []>(`PRAGMA table_info(\`${table}\`)`)
    .all()
    .map(({ name }) => name);

/** Every kept table's kept columns and rows, plus its indexes. */
function dumpKept(sqlite: Database): string {
  return JSON.stringify(
    tableNames(sqlite)
      .filter((name) => !DROPPED_TABLES.includes(name))
      .map((name) => {
        const columns = columnNames(sqlite, name).filter(
          (column) => !DROPPED_COLUMNS[name]?.includes(column),
        );
        const rows = sqlite
          .query(
            `SELECT ${columns.map((c) => `\`${c}\``).join(', ')} FROM \`${name}\` ORDER BY ${columns.map((_, i) => i + 1).join(', ')}`,
          )
          .all();
        const indexes = sqlite
          .query(
            `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name`,
          )
          .all(name);
        return { name, columns, rows, indexes };
      }),
  );
}

function expectRemoved(sqlite: Database) {
  const tables = tableNames(sqlite);
  for (const table of DROPPED_TABLES) expect(tables).not.toContain(table);
  for (const [table, columns] of Object.entries(DROPPED_COLUMNS))
    for (const column of columns)
      expect(columnNames(sqlite, table)).not.toContain(column);
  expect(sqlite.query('PRAGMA integrity_check').all()).toEqual([
    { integrity_check: 'ok' },
  ]);
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
}

/** Rows only v1 sync wrote, in the tables and columns 0011 drops. */
function writeV1Rows(sqlite: Database) {
  sqlite.exec(`
    INSERT INTO cloud_vault (vault_id, provider_kind, device_id, status, created_at, updated_at, restore_conflict_ids_json, conflicts_imported_at)
    VALUES ('vault', 'google-drive', 'device', 'idle', 1, 2, '["c1"]', 3);
    INSERT INTO cloud_conflicts (vault_id, conflict_id, conflict_json, created_at) VALUES ('vault', 'c1', '{}', 1);
    INSERT INTO cloud_tombstones (vault_id, entity_type, entity_id, deleted_state_hash, deleted_by_device_id, deletion_sequence, updated_at)
    VALUES ('vault', 'entry', 'gone', 'h', 'device', 1, 1);
    INSERT INTO cloud_base_shadow (vault_id, device_id, snapshot_id, file_name, canonical_sha256, byte_count, committed_generation, updated_at)
    VALUES ('vault', 'device', 's', 'f', 'h', 1, 1, 1);
    INSERT INTO cloud_shadow_reaper (file_name, queued_at) VALUES ('old', 1);
    INSERT INTO cloud_pending_publication (vault_id, device_id, snapshot_id, device_sequence, captured_generation, compressed_bytes, stage, created_at, updated_at)
    VALUES ('vault', 'device', 's', 1, 1, X'00', 'candidate-persisted', 1, 1);
    INSERT OR IGNORE INTO profile_pristine_marker (profile_id) VALUES ('self');
  `);
}

test('an empty database ends without the v1 tables and columns', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, tags.length);
  expectRemoved(sqlite);
  expect(tableNames(sqlite)).toContain('sync_records');
  expect(sqlite.query('SELECT count(*) AS n FROM sync_device').get()).toEqual({ n: 1 });
});

test('a journal from the earliest schema keeps every other row', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, 1);
  // The 0000 shape: text_content required, tags as a column, no media table.
  sqlite.exec(`
    INSERT INTO entries (note_id, text_title, text_content, mood, assets, tags, created_at, updated_at)
    VALUES ('n1', 'First', 'Hello', 'HAPPY', NULL, 't1', 1700000000000, 1700000000001),
           ('n2', NULL, 'Second', NULL, '[]', '', 1700000100000, 1700000100000);
    INSERT INTO tags (tag_id, title, created_at, updated_at)
    VALUES ('t1', 'Work', 1700000000000, 1700000000000);
  `);
  migrate(sqlite, 1, REMOVAL);
  writeV1Rows(sqlite);
  sqlite.exec(`
    UPDATE entries SET conflict_origin_id = 'n1' WHERE note_id = 'n2';
    INSERT INTO custom_prompts (prompt_id, title, conflict_origin_id, created_at, updated_at)
    VALUES ('p1', 'One good thing', 'p0', 1, 1);
  `);
  const before = dumpKept(sqlite);
  migrate(sqlite, REMOVAL, REMOVAL + 1);
  expectRemoved(sqlite);
  expect(dumpKept(sqlite)).toBe(before);
});

test('with foreign keys on, entries keeps its tags and dependent rows', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, REMOVAL);
  sqlite.exec(`
    INSERT INTO entries (note_id, text_content, tags, conflict_origin_id, created_at, updated_at) VALUES ('n1', 'Hi', 't1', 'x', 1, 1);
    INSERT INTO tags (tag_id, title, conflict_origin_id, created_at, updated_at) VALUES ('t1', 'Work', 'y', 1, 1);
    INSERT INTO entry_tags (note_id, tag_id, created_at, updated_at) VALUES ('n1', 't1', 1, 1);
  `);
  sqlite.exec('PRAGMA foreign_keys = ON');
  const before = dumpKept(sqlite);
  migrate(sqlite, REMOVAL, REMOVAL + 1);
  expectRemoved(sqlite);
  expect(dumpKept(sqlite)).toBe(before);
});

test('a large journal upgrades quickly and keeps every other row', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, REMOVAL);
  const ENTRIES = 10_000;
  sqlite.transaction(() => {
    const entry = sqlite.prepare(
      "INSERT INTO entries (note_id, text_title, text_content, mood, tags, conflict_origin_id, created_at, updated_at) VALUES (?, ?, ?, 'OKAY', '', ?, ?, ?)",
    );
    const tag = sqlite.prepare(
      'INSERT INTO tags (tag_id, title, created_at, updated_at) VALUES (?, ?, 1, 1)',
    );
    const entryTag = sqlite.prepare(
      'INSERT INTO entry_tags (note_id, tag_id, created_at, updated_at) VALUES (?, ?, 1, 1)',
    );
    const media = sqlite.prepare(
      "INSERT INTO media_assets (asset_id, owner_type, owner_id, kind, local_uri, created_at, updated_at) VALUES (?, 'entry', ?, 'photo', ?, 1, 1)",
    );
    const tombstone = sqlite.prepare(
      "INSERT INTO cloud_tombstones (vault_id, entity_type, entity_id, deleted_by_device_id, deletion_sequence, updated_at) VALUES ('vault', 'entry', ?, 'device', 1, 1)",
    );
    for (let t = 0; t < 40; t++) tag.run(`t${t}`, `Tag ${t}`);
    for (let i = 0; i < ENTRIES; i++) {
      entry.run(
        `n${i}`,
        i % 3 ? `Title ${i}` : null,
        `Text ${i} `.repeat(50),
        i % 50 ? null : `n${i + 1}`,
        i,
        i,
      );
      entryTag.run(`n${i}`, `t${i % 40}`);
      if (i % 5 === 0) media.run(`a${i}`, `n${i}`, `photos/a${i}.jpg`);
      if (i % 4 === 0) tombstone.run(`deleted-${i}`);
    }
    sqlite.exec(`
      INSERT INTO custom_prompts (prompt_id, title, created_at, updated_at) VALUES ('p1', 'One good thing', 1, 1);
      INSERT INTO user_profile (profile_id, display_name, updated_at) VALUES ('self', 'Sam', 1);
    `);
    writeV1Rows(sqlite);
  })();
  const before = dumpKept(sqlite);
  const started = performance.now();
  migrate(sqlite, REMOVAL, REMOVAL + 1);
  const elapsed = performance.now() - started;
  expectRemoved(sqlite);
  expect(dumpKept(sqlite)).toBe(before);
  console.log(`0011 on ${ENTRIES} entries: ${elapsed.toFixed(0)} ms (desktop)`);
  expect(elapsed).toBeLessThan(5_000);
});

test('only the v1 tables and columns are dropped', () => {
  const sql = readFileSync(
    join(import.meta.dir, `../../src/drizzle/${tags[REMOVAL]}.sql`),
    'utf8',
  );
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
  expect(statements).toEqual([
    ...DROPPED_TABLES.map((table) => `DROP TABLE \`${table}\`;`),
    ...Object.entries(DROPPED_COLUMNS)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([table, columns]) =>
        columns.map((column) => `ALTER TABLE \`${table}\` DROP COLUMN \`${column}\`;`),
      ),
  ]);
});
