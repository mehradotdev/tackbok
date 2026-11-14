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
mock.module('../../src/db', () => ({ ...schema, db, runExclusiveDbTransaction() {} }));
mock.module('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
const { getEntriesForDay, getOtherVersionGroups, getOtherVersionCount, searchEntries } =
  await import('../../src/db/queries');
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

test('getEntriesForDay ends at the next local midnight when DST starts at midnight', async () => {
  // America/Santiago skips 2026-09-06 00:00, so that day starts at 01:00.
  process.env.TZ = 'America/Santiago';
  try {
    const day = new Date(2026, 8, 6);
    const nextDay = new Date(2026, 8, 7);
    expect(day.getHours()).toBe(1);
    insertEntry('late', nextDay.getTime() - 60_000);
    insertEntry('next-day', nextDay.getTime() + 30 * 60_000);
    expect((await getEntriesForDay(day.getTime())).map((entry) => entry.note_id)).toEqual(
      ['late'],
    );
  } finally {
    process.env.TZ = 'America/New_York';
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

test('searchEntries keeps spaces inside tag ids significant', async () => {
  insertEntry('spaced-id', 1, { tags: 'a,work focus' });
  insertEntry('joined-id', 2, { tags: 'workfocus' });
  expect((await searchEntries('', ['work focus'])).map((entry) => entry.note_id)).toEqual(
    ['spaced-id'],
  );
  expect((await searchEntries('', ['workfocus'])).map((entry) => entry.note_id)).toEqual([
    'joined-id',
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

const ids = (groups: Awaited<ReturnType<typeof getOtherVersionGroups>>) =>
  groups.map((group) => ({
    original: group.original?.note_id ?? null,
    versions: group.versions.map((entry) => entry.note_id),
  }));

test('getOtherVersionGroups pairs each other version with its original', async () => {
  insertEntry('plain', 50);
  insertEntry('origin-old', 10);
  insertEntry('origin-new', 20);
  insertEntry('recovered-old', 30, { conflict_origin_id: 'origin-old' });
  insertEntry('recovered-new', 40, { conflict_origin_id: 'origin-new' });
  expect(ids(await getOtherVersionGroups())).toEqual([
    { original: 'origin-new', versions: ['recovered-new'] },
    { original: 'origin-old', versions: ['recovered-old'] },
  ]);
});

test('getOtherVersionGroups groups versions whose original was deleted', async () => {
  insertEntry('orphan', 35, { conflict_origin_id: 'deleted-origin' });
  insertEntry('orphan-sibling', 36, { conflict_origin_id: 'deleted-origin' });
  insertEntry('other-orphan', 30, { conflict_origin_id: 'other-deleted-origin' });
  expect(ids(await getOtherVersionGroups())).toEqual([
    { original: null, versions: ['orphan-sibling', 'orphan'] },
    { original: null, versions: ['other-orphan'] },
  ]);
});

test('getOtherVersionGroups keeps several versions of one original together', async () => {
  insertEntry('origin', 10);
  insertEntry('copy-a', 30, { conflict_origin_id: 'origin' });
  insertEntry('copy-b', 20, { conflict_origin_id: 'origin' });
  expect(ids(await getOtherVersionGroups())).toEqual([
    { original: 'origin', versions: ['copy-a', 'copy-b'] },
  ]);
});

test('getOtherVersionGroups follows a version copied from another version', async () => {
  insertEntry('origin', 10);
  insertEntry('copy', 20, { conflict_origin_id: 'origin' });
  insertEntry('copy-of-copy', 30, { conflict_origin_id: 'copy' });
  // Its middle link deleted: the chain starts at the remaining version.
  insertEntry('orphan-chain-copy', 5, { conflict_origin_id: 'deleted-origin' });
  insertEntry('orphan-chain-copy-of-copy', 6, {
    conflict_origin_id: 'orphan-chain-copy',
  });
  // A cycle cannot come from sync, but must not hang the screen.
  insertEntry('loop-a', 1, { conflict_origin_id: 'loop-b' });
  insertEntry('loop-b', 2, { conflict_origin_id: 'loop-a' });
  expect(ids(await getOtherVersionGroups())).toEqual([
    { original: 'origin', versions: ['copy-of-copy', 'copy'] },
    { original: null, versions: ['orphan-chain-copy-of-copy', 'orphan-chain-copy'] },
    { original: null, versions: ['loop-b', 'loop-a'] },
  ]);
});

test('getOtherVersionCount counts only entries kept as another version', async () => {
  expect(await getOtherVersionCount()).toBe(0);
  insertEntry('origin', 10);
  insertEntry('recovered', 20, { conflict_origin_id: 'origin' });
  insertEntry('recovered-orphan', 30, { conflict_origin_id: 'deleted-origin' });
  expect(await getOtherVersionCount()).toBe(2);
});

test('getOtherVersionGroups binds no ID list on a large journal', async () => {
  const count = 33_000;
  sqlite.exec('BEGIN');
  const insert = sqlite.prepare(
    'INSERT INTO entries (note_id, conflict_origin_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
  );
  for (let index = 0; index < count; index += 1) {
    insert.run(`origin-${index}`, null, index, index);
    insert.run(`recovered-${index}`, `origin-${index}`, count + index, count + index);
  }
  sqlite.exec('COMMIT');
  mostParams = 0;
  const groups = await getOtherVersionGroups();
  expect(groups).toHaveLength(count);
  expect(ids(groups.slice(0, 1))).toEqual([
    { original: `origin-${count - 1}`, versions: [`recovered-${count - 1}`] },
  ]);
  expect(mostParams).toBeLessThan(999);
});
