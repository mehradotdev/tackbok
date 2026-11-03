import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema';

// Day boundaries are local time; pin a zone with DST before any Date use.
process.env.TZ = 'America/New_York';

const sqlite = new Database(':memory:');
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
mock.module('../../src/db', () => ({ ...schema, db, runExclusiveDbTransaction() {} }));
mock.module('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
const { getEntriesForDay, searchEntries } = await import('../../src/db/queries');
afterAll(() => sqlite.close());

function insertEntry(
  noteId: string,
  createdAt: number,
  fields: Partial<schema.NewEntry> = {},
) {
  db.insert(schema.entries)
    .values({ note_id: noteId, created_at: createdAt, updated_at: createdAt, ...fields })
    .run();
}

beforeEach(() => sqlite.exec('DELETE FROM entries'));

test('getEntriesForDay covers the full local day on 23- and 25-hour DST days', async () => {
  // 2026-03-08 springs forward (23h); 2026-11-01 falls back (25h).
  for (const [day, nextDay] of [
    [new Date(2026, 2, 8), new Date(2026, 2, 9)],
    [new Date(2026, 10, 1), new Date(2026, 10, 2)],
  ]) {
    sqlite.exec('DELETE FROM entries');
    insertEntry('late', nextDay.getTime() - 60_000);
    insertEntry('next-day', nextDay.getTime() + 30 * 60_000);
    expect((await getEntriesForDay(day.getTime())).map((entry) => entry.note_id)).toEqual(
      ['late'],
    );
  }
});

test('searchEntries matches whole tag ids, not substrings', async () => {
  insertEntry('one', 1, { tags: '1' });
  insertEntry('twelve', 2, { tags: '12,3' });
  insertEntry('spaced', 3, { tags: '3, 1' });
  expect((await searchEntries('', ['1'])).map((entry) => entry.note_id)).toEqual([
    'spaced',
    'one',
  ]);
  expect((await searchEntries('', ['12', '3'])).map((entry) => entry.note_id)).toEqual([
    'spaced',
    'twelve',
  ]);
});

test('searchEntries treats LIKE wildcards in the search text literally', async () => {
  insertEntry('percent', 1, { text_title: '100% grateful' });
  insertEntry('underscore', 2, { text_content: 'snake_case' });
  insertEntry('backslash', 3, { text_content: 'C:\\path' });
  insertEntry('plain', 4, { text_title: 'grateful', text_content: 'snakeXcase' });
  expect((await searchEntries('%')).map((entry) => entry.note_id)).toEqual(['percent']);
  expect((await searchEntries('e_c')).map((entry) => entry.note_id)).toEqual([
    'underscore',
  ]);
  expect((await searchEntries('\\')).map((entry) => entry.note_id)).toEqual([
    'backslash',
  ]);
  expect((await searchEntries('GRATEFUL')).map((entry) => entry.note_id)).toEqual([
    'plain',
    'percent',
  ]);
});
