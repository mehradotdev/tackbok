/**
 * The 0012 migration (#185, P8): pauses only the v1 engine set are cleared,
 * every other pause stays as it was.
 */
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
);
const tags = journal.entries.map((entry) => entry.tag);
const RETIRE = tags.findIndex((tag) => tag.startsWith('0012_'));

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

test('retired v1 pause reasons are cleared and others are kept', () => {
  const sqlite = new Database(':memory:');
  migrate(sqlite, 0, RETIRE);
  const insert = sqlite.prepare(
    `INSERT INTO cloud_sync_state (vault_id, device_id, journal_generation,
       settled_generation, next_device_sequence, pause_reason, pause_context_json,
       last_error_class, updated_at)
     VALUES (?, ?, 3, 1, 4, ?, ?, ?, 1)`,
  );
  const reasons = [
    'frontier-too-wide',
    'derived-id-collision',
    'cleanup-inconsistent',
    'merge-failed',
    'unsupported-format',
    null,
  ];
  reasons.forEach((reason, index) =>
    insert.run(
      'vault',
      `device-${index}`,
      reason,
      reason ? '"ctx"' : null,
      reason ? 'class' : null,
    ),
  );
  migrate(sqlite, RETIRE, RETIRE + 1);
  const rows = sqlite
    .query<
      {
        device_id: string;
        pause_reason: string | null;
        pause_context_json: string | null;
        last_error_class: string | null;
        journal_generation: number;
        next_device_sequence: number;
      },
      []
    >('SELECT * FROM cloud_sync_state ORDER BY device_id')
    .all();
  expect(rows.map((row) => row.pause_reason)).toEqual([
    null,
    null,
    null,
    'merge-failed',
    'unsupported-format',
    null,
  ]);
  for (const row of rows.slice(0, 3)) {
    expect(row.pause_context_json).toBeNull();
    expect(row.last_error_class).toBeNull();
  }
  expect(rows[3].pause_context_json).toBe('"ctx"');
  // Nothing but the pause changes: queued work still publishes.
  expect(rows.every((row) => row.journal_generation === 3)).toBe(true);
  expect(rows.every((row) => row.next_device_sequence === 4)).toBe(true);
});
