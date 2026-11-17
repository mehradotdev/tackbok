/**
 * The 0008 migration (cloud sync v2 local schema, #185): additive only, a
 * device ID per install, and an initial stamp from this device on every
 * existing row. Run on an empty database, one created by the earliest
 * schema (0000) and a large one.
 */
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
);
const tags = journal.entries.map((entry) => entry.tag);
const V2 = tags.findIndex((tag) => tag.startsWith('0008_'));

/**
 * Applies migrations [from, to) the way drizzle's migrator does: every
 * pending file in one transaction, each breakpoint chunk as one statement.
 */
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

/** Every table's columns and rows, except the v2 additions. */
function dumpV1(sqlite: Database): string {
  const tables = sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sync_device', 'sync_records', 'sync_field_values', 'sync_deleted_records', '__drizzle_migrations') ORDER BY name",
    )
    .all();
  return JSON.stringify(
    tables.map(({ name }) => {
      const columns = sqlite
        .query<{ name: string }, []>(`PRAGMA table_info(\`${name}\`)`)
        .all()
        .map((column) => column.name)
        .filter((column) => column !== 'stamp_hlc' && column !== 'stamp_device');
      const rows = sqlite
        .query(
          `SELECT ${columns.map((c) => `\`${c}\``).join(', ')} FROM \`${name}\` ORDER BY ${columns.map((_, i) => i + 1).join(', ')}`,
        )
        .all();
      return { name, columns, rows };
    }),
  );
}

interface DeviceRow {
  device_id: string;
  ctx_json: string;
  roster_json: string;
  acks_json: string;
  floor_json: string | null;
  created_at: number;
}
const device = (sqlite: Database) =>
  sqlite.query<DeviceRow, []>("SELECT * FROM sync_device WHERE id = 'self'").get()!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('an empty database gets a device ID and nothing else', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, tags.length);
  const row = device(sqlite);
  expect(row.device_id).toMatch(UUID);
  expect(row.ctx_json).toBe('{}');
  expect(row.roster_json).toBe('{}');
  expect(row.acks_json).toBe('{}');
  expect(row.floor_json).toBeNull();
  expect(Math.abs(row.created_at - Date.now())).toBeLessThan(5_000);
  expect(sqlite.query('SELECT count(*) AS n FROM sync_records').get()).toEqual({ n: 0 });
  // Another install gets another ID.
  const other = new Database(':memory:');
  migrate(other, 0, tags.length);
  expect(device(other).device_id).not.toBe(row.device_id);
});

test('a journal from the earliest schema keeps every row and gets initial stamps', () => {
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
  migrate(sqlite, 1, V2);
  const before = dumpV1(sqlite);
  migrate(sqlite, V2, tags.length);
  expect(dumpV1(sqlite)).toBe(before);
  const { device_id: id, created_at: hlc, ctx_json, roster_json } = device(sqlite);
  expect(JSON.parse(ctx_json)).toEqual({ [id]: hlc });
  expect(JSON.parse(roster_json)).toEqual({ [id]: hlc });
  const records = sqlite
    .query<
      { entity_type: string; entity_id: string; vv_json: string; stamps_json: string },
      []
    >(
      'SELECT entity_type, entity_id, vv_json, stamps_json FROM sync_records ORDER BY 1, 2',
    )
    .all();
  expect(records.map((r) => `${r.entity_type}:${r.entity_id}`)).toEqual([
    'entry:n1',
    'entry:n2',
    'tag:t1',
  ]);
  for (const record of records) expect(JSON.parse(record.vv_json)).toEqual({ [id]: hlc });
  expect(JSON.parse(records[0].stamps_json)).toEqual({
    title: [hlc, id],
    text: [hlc, id],
    mood: [hlc, id],
    date: [hlc, id],
  });
  expect(JSON.parse(records[2].stamps_json)).toEqual({ title: [hlc, id] });
});

test('a large journal upgrades quickly, keeps every row and stamps every record', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, V2);
  const ENTRIES = 10_000;
  sqlite.transaction(() => {
    const entry = sqlite.prepare(
      "INSERT INTO entries (note_id, text_title, text_content, mood, tags, created_at, updated_at) VALUES (?, ?, ?, 'OKAY', '', ?, ?)",
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
    for (let t = 0; t < 40; t++) tag.run(`t${t}`, `Tag ${t}`);
    for (let i = 0; i < ENTRIES; i++) {
      entry.run(`n${i}`, i % 3 ? `Title ${i}` : null, `Text ${i} `.repeat(50), i, i);
      entryTag.run(`n${i}`, `t${i % 40}`);
      if (i % 2) entryTag.run(`n${i}`, `t${(i + 7) % 40}`);
      if (i % 5 === 0) media.run(`a${i}`, `n${i}`, `photos/a${i}.jpg`);
    }
    sqlite.exec(`
      INSERT INTO custom_prompts (prompt_id, title, created_at, updated_at) VALUES ('p1', 'One good thing', 1, 1);
      INSERT INTO user_profile (profile_id, display_name, updated_at) VALUES ('self', 'Sam', 1);
    `);
  })();
  const before = dumpV1(sqlite);
  const started = performance.now();
  migrate(sqlite, V2, tags.length);
  const elapsed = performance.now() - started;
  expect(dumpV1(sqlite)).toBe(before);
  const count = (sql: string) => (sqlite.query(sql).get() as { n: number }).n;
  expect(
    count("SELECT count(*) AS n FROM sync_records WHERE entity_type = 'entry'"),
  ).toBe(ENTRIES);
  expect(count("SELECT count(*) AS n FROM sync_records WHERE entity_type = 'tag'")).toBe(
    40,
  );
  expect(
    count("SELECT count(*) AS n FROM sync_records WHERE entity_type = 'prompt'"),
  ).toBe(1);
  expect(
    count("SELECT count(*) AS n FROM sync_records WHERE entity_type = 'profile'"),
  ).toBe(1);
  const { device_id: id, created_at: hlc } = device(sqlite);
  expect(
    count(
      `SELECT count(*) AS n FROM entry_tags WHERE stamp_hlc = ${hlc} AND stamp_device = '${id}'`,
    ),
  ).toBe(ENTRIES * 1.5);
  // Attachments are stamped when first published (P6), not here.
  expect(
    count('SELECT count(*) AS n FROM media_assets WHERE stamp_hlc IS NOT NULL'),
  ).toBe(0);
  console.log(`0008 on ${ENTRIES} entries: ${elapsed.toFixed(0)} ms (desktop)`);
  expect(elapsed).toBeLessThan(5_000);
});

test('an empty profile gets no stamp; a profile name does, its missing photo does not', () => {
  for (const [name, expected] of [
    [null, null],
    ['Sam', ['name']],
  ] as const) {
    const sqlite = new Database(':memory:');
    migrate(sqlite, 0, V2);
    sqlite
      .query(
        "INSERT INTO user_profile (profile_id, display_name, updated_at) VALUES ('self', ?, 1)",
      )
      .run(name);
    migrate(sqlite, V2, tags.length);
    const row = sqlite
      .query<{ stamps_json: string }, []>(
        "SELECT stamps_json FROM sync_records WHERE entity_type = 'profile'",
      )
      .get();
    expect(row ? Object.keys(JSON.parse(row.stamps_json)) : null).toEqual(
      expected === null ? null : [...expected],
    );
  }
});

test('one stamp can hold several set members (a write adding two tags)', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, tags.length);
  const insert = sqlite.prepare(
    "INSERT INTO sync_field_values (entity_type, entity_id, field, stamp_hlc, stamp_device, value_json) VALUES ('entry', 'n1', 'tags', 5, 'd', ?)",
  );
  insert.run('"t1"');
  insert.run('"t2"');
  expect(sqlite.query('SELECT count(*) AS n FROM sync_field_values').get()).toEqual({
    n: 2,
  });
});

test('the migration only adds: no table or column is dropped or renamed', () => {
  const sql = readFileSync(
    join(import.meta.dir, `../../src/drizzle/${tags[V2]}.sql`),
    'utf8',
  );
  expect(sql).not.toMatch(/\b(DROP|RENAME|DELETE)\b/i);
  expect(sql).not.toMatch(/__new_/);
});
