import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';

let sqlite: Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

function applyMigrations(database: Database): void {
  for (let index = 0; index <= 4; index++) {
    const name = [
      '0000_public_scrambler.sql',
      '0001_clammy_winter_soldier.sql',
      '0002_marvelous_avengers.sql',
      '0003_common_silhouette.sql',
      '0004_good_roulette.sql',
    ][index];
    const sql = readFileSync(join(import.meta.dir, '../../src/drizzle', name), 'utf8')
      .replaceAll('--> statement-breakpoint', '');
    database.exec(sql);
  }
  database.exec('PRAGMA foreign_keys = ON');
}

beforeEach(() => {
  sqlite = new Database(':memory:', { strict: true });
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  mock.module('~/db', () => ({ ...schema, db: testDb }));
  mock.module('~/lib/settings/store', () => ({
    hydrateProfileCache: () => undefined,
  }));
});

afterEach(() => {
  mock.restore();
  sqlite.close();
});

describe('Phase 1 transactional gate', () => {
  test('domain, normalized rows, generation, and outbox commit or roll back together', async () => {
    const repository = await import(
      `../../src/lib/cloudSync/storage/repositories.ts?case=atomic-${Date.now()}`
    );
    const tagId = await testDb.transaction((tx) =>
      repository.createTagInTransaction(tx, 'Family'),
    );
    await testDb.transaction((tx) =>
      repository.upsertEntryInTransaction(tx, {
        note_id: 'entry-1',
        text_title: 'First',
        text_content: 'body',
        assets: [{ type: 'IMAGE', uri: 'photos/first.jpg' }],
        tags: tagId,
        created_at: 10,
        updated_at: 10,
      }),
    );

    const [state1] = await testDb
      .select()
      .from(schema.syncEntityState)
      .where(eq(schema.syncEntityState.entity_id, 'entry-1'));
    expect(state1.local_generation).toBe(1);
    expect(await testDb.select().from(schema.syncChangeQueue)).toHaveLength(2);
    expect(await testDb.select().from(schema.entryTags)).toHaveLength(1);
    const [firstAsset] = await testDb.select().from(schema.mediaAssets);
    expect(firstAsset.local_uri).toBe('photos/first.jpg');

    await testDb.transaction((tx) =>
      repository.upsertEntryInTransaction(tx, {
        note_id: 'entry-1',
        text_title: 'Second',
        text_content: 'body',
        assets: [{ type: 'IMAGE', uri: 'photos/replacement.jpg' }],
        tags: '',
        created_at: 10,
        updated_at: 20,
      }),
    );
    const [state2] = await testDb
      .select()
      .from(schema.syncEntityState)
      .where(eq(schema.syncEntityState.entity_id, 'entry-1'));
    expect(state2.local_generation).toBe(2);
    expect(
      await testDb
        .select()
        .from(schema.syncChangeQueue)
        .where(eq(schema.syncChangeQueue.entity_id, 'entry-1')),
    ).toHaveLength(1);
    expect(await testDb.select().from(schema.syncRetainedMedia)).toHaveLength(1);
    expect(await testDb.select().from(schema.syncMediaObligations)).toHaveLength(1);

    sqlite.exec('BEGIN IMMEDIATE');
    try {
      await repository.upsertEntryInTransaction(
        testDb as unknown as Parameters<
          typeof repository.upsertEntryInTransaction
        >[0],
        {
          note_id: 'rolled-back',
          text_content: 'must not survive',
          tags: '',
          created_at: 30,
          updated_at: 30,
        },
      );
    } finally {
      sqlite.exec('ROLLBACK');
    }
    expect(
      await testDb
        .select()
        .from(schema.entries)
        .where(eq(schema.entries.note_id, 'rolled-back')),
    ).toHaveLength(0);
    expect(
      await testDb
        .select()
        .from(schema.syncChangeQueue)
        .where(eq(schema.syncChangeQueue.entity_id, 'rolled-back')),
    ).toHaveLength(0);
  });

  test('checkpoint restart and concurrent mutation preserve assigned IDs and newest state', async () => {
    const suffix = Date.now();
    const repository = await import(
      `../../src/lib/cloudSync/storage/repositories.ts?case=backfill-repo-${suffix}`
    );
    const backfill = await import(
      `../../src/lib/cloudSync/storage/backfill.ts?case=backfill-${suffix}`
    );
    await testDb.insert(schema.tags).values({
      tag_id: 'legacy-tag',
      title: 'Legacy',
      created_at: 1,
      updated_at: 1,
    });
    await testDb.insert(schema.entries).values([
      {
        note_id: 'a',
        text_content: 'a',
        assets: [{ type: 'IMAGE', uri: 'photos/a.jpg' }],
        tags: 'legacy-tag',
        created_at: 1,
        updated_at: 1,
      },
      {
        note_id: 'b',
        text_content: 'b-old',
        assets: [{ type: 'IMAGE', uri: 'photos/b-old.jpg' }],
        tags: 'legacy-tag',
        created_at: 2,
        updated_at: 2,
      },
      {
        note_id: 'c',
        text_content: 'c',
        tags: '',
        created_at: 3,
        updated_at: 3,
      },
    ]);

    const interrupted = await backfill.runNormalizedModelBackfill(
      { profileName: 'Before', profileEmail: null, profileImageUri: null },
      { batchSize: 1, stopAfterCommittedBatches: 1 },
    );
    expect(interrupted.status).toBe('interrupted');
    const [assetA1] = await testDb
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.owner_id, 'a'));

    await testDb.transaction((tx) =>
      repository.upsertEntryInTransaction(tx, {
        note_id: 'b',
        text_content: 'b-new',
        assets: [{ type: 'IMAGE', uri: 'photos/b-new.jpg' }],
        tags: '',
        created_at: 2,
        updated_at: 20,
      }),
    );
    await testDb.transaction((tx) =>
      repository.deleteEntryInTransaction(tx, 'c'),
    );
    await testDb.transaction((tx) =>
      repository.updateProfileInTransaction(tx, {
        displayName: 'After',
        photoUri: 'photos/profile.jpg',
      }),
    );

    const completed = await backfill.runNormalizedModelBackfill(
      { profileName: 'Before', profileEmail: null, profileImageUri: null },
      { batchSize: 1 },
    );
    expect(completed.status).toBe('complete');
    const [assetA2] = await testDb
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.owner_id, 'a'));
    expect(assetA2.asset_id).toBe(assetA1.asset_id);
    const [entryB] = await testDb
      .select()
      .from(schema.entries)
      .where(eq(schema.entries.note_id, 'b'));
    expect(entryB.text_content).toBe('b-new');
    expect(
      await testDb
        .select()
        .from(schema.mediaAssets)
        .where(
          and(
            eq(schema.mediaAssets.owner_id, 'b'),
            eq(schema.mediaAssets.local_uri, 'photos/b-new.jpg'),
          ),
        ),
    ).toHaveLength(1);
    expect(
      await testDb.select().from(schema.entries).where(eq(schema.entries.note_id, 'c')),
    ).toHaveLength(0);
    const [profile] = await testDb.select().from(schema.userProfile);
    expect(profile.display_name).toBe('After');

    await backfill.runNormalizedModelBackfill(
      { profileName: 'ignored', profileEmail: null, profileImageUri: null },
      { batchSize: 1 },
    );
    const [assetA3] = await testDb
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.owner_id, 'a'));
    expect(assetA3.asset_id).toBe(assetA1.asset_id);
  });
});
