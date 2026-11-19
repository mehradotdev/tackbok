/**
 * The 0017 migration (#185, P14): drops `sync_records.updated_at`, which was
 * written but never read. Every row and every other column stays.
 */
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
);
const tags = journal.entries.map((entry) => entry.tag);
const DROP = tags.findIndex((tag) => tag.startsWith('0017_'));

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

const columns = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>('PRAGMA table_info(`sync_records`)')
    .all()
    .map(({ name }) => name);

test('0017 drops sync_records.updated_at and keeps every row', () => {
  expect(DROP).toBeGreaterThan(0);
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, DROP);
  expect(columns(sqlite)).toContain('updated_at');
  const insert = sqlite.prepare(
    `INSERT INTO sync_records (entity_type, entity_id, vv_json, known_json, stamps_json, del_json, ext_json, split_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '{"f":[]}', ?, 1)`,
  );
  sqlite.transaction(() => {
    for (let i = 0; i < 1000; i++)
      insert.run(
        'entry',
        `e${i}`,
        `{"d":${i}}`,
        i % 7 === 0 ? `{"vv":{"d":${i}},"extra":[]}` : null,
        '{}',
        i % 10 === 0 ? '{"at":[1,"d"]}' : null,
        i % 13 === 0 ? `{"from":"e0","field":"text","s":[${i},"d"]}` : null,
      );
    insert.run('profile', 'profile', '{"d":1}', null, '{"name":[1,"d"]}', null, null);
  })();
  const kept =
    'SELECT entity_type, entity_id, vv_json, known_json, stamps_json, del_json, ext_json, split_json FROM sync_records ORDER BY 1, 2';
  const before = sqlite.query(kept).all();

  migrate(sqlite, DROP, tags.length);

  expect(columns(sqlite)).not.toContain('updated_at');
  expect(sqlite.query(kept).all()).toEqual(before);
  // Writes without the column work, as the app's now are.
  sqlite.run(
    "INSERT INTO sync_records (entity_type, entity_id, vv_json) VALUES ('tag', 't1', '{}')",
  );
  expect(sqlite.query('SELECT count(*) AS n FROM sync_records').get()).toEqual({
    n: 1002,
  });
});
