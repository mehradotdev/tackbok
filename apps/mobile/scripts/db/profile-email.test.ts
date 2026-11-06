import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('email cleanup preserves the profile and database compatibility', () => {
  const sqlite = new Database(':memory:');
  try {
    const journal = JSON.parse(
      readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
    );
    for (const { tag } of journal.entries) {
      if (tag === '0005_clear_profile_email') {
        sqlite.exec(
          "INSERT INTO user_profile (profile_id, display_name, email, updated_at) VALUES ('self', 'Ada', 'legacy@example.com', 123)",
        );
      }
      sqlite.exec(
        readFileSync(
          join(import.meta.dir, `../../src/drizzle/${tag}.sql`),
          'utf8',
        ).replaceAll('--> statement-breakpoint', ''),
      );
    }
    expect(sqlite.query('SELECT * FROM user_profile').get()).toMatchObject({
      profile_id: 'self',
      display_name: 'Ada',
      email: null,
      updated_at: 123,
    });
  } finally {
    sqlite.close();
  }
});
