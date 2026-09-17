import { afterAll, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema';
import type { SnapshotDomain } from '../../src/lib/cloudSync/snapshot/types';
import { AssetType } from '../../src/types';
import { eq } from 'drizzle-orm';

const sqlite = new Database(':memory:');
const journal = JSON.parse(readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'));
for (const { tag } of journal.entries) {
  sqlite.exec(readFileSync(join(import.meta.dir, `../../src/drizzle/${tag}.sql`), 'utf8')
    .replaceAll('--> statement-breakpoint', ''));
}
const db = drizzle(sqlite, { schema });
let beforeTransaction: (() => void) | null = null;
mock.module('../../src/db', () => ({
  ...schema, db,
  runExclusiveDbTransaction: async (operation: (tx: typeof db) => Promise<unknown>) => {
    beforeTransaction?.();
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = await operation(db); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
}));
mock.module('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
mock.module('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));
mock.module('../../src/lib/cloudSync/snapshot/media', () => ({ copyVerifiedMediaFile() {}, createMediaPartialFileSink() {}, openMediaUploadSource() {} }));
mock.module('../../src/lib/cloudSync/media/streamingHash', () => ({ inspectLocalMediaFile() {} }));
const { ProductionSnapshotJournalStore } = await import('../../src/lib/cloudSync/snapshot/storage/productionJournal');
afterAll(() => sqlite.close());

test('production capture and restore preserve photo and voice order, including URI-only legacy assets', async () => {
  sqlite.exec('DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM tags; DELETE FROM media_assets; DELETE FROM user_profile');
  db.insert(schema.cloudSyncState).values({ vault_id: 'ordered', device_id: 'device', updated_at: 1 }).run();
  const ids = ['photo-z', 'photo-a', 'voice-z', 'voice-a'];
  const assets = ids.map((id) => ({ type: id.startsWith('photo') ? AssetType.IMAGE : AssetType.AUDIO, uri: `file:///${id}` }));
  db.insert(schema.entries).values({ note_id: 'ordered-entry', assets, created_at: 1, updated_at: 1 }).run();
  db.insert(schema.mediaAssets).values(ids.map((id) => ({ asset_id: id, owner_type: 'entry' as const,
    owner_id: 'ordered-entry', kind: id.startsWith('photo') ? 'photo' as const : 'voice' as const,
    local_uri: `file:///${id}`, blob_hash: 'a'.repeat(64), byte_size: 8, created_at: 1, updated_at: 1 }))).run();
  const store = new ProductionSnapshotJournalStore('ordered', 'device', {} as never);
  const { domain } = await store.capture();
  expect(domain.entries[0].attachmentOrder).toEqual(ids);
  expect(domain.media.map((asset) => asset.assetId)).toEqual([...ids].sort());
  // Simulate a receiving device whose existing attachments are in the wrong order.
  db.update(schema.entries).set({ assets: [...assets].reverse() }).where(eq(schema.entries.note_id, 'ordered-entry')).run();
  // Native file I/O is outside this real-SQLite projection test.
  Object.defineProperty(store, 'materializeMedia', { value: async () => new Map(ids.map((id) =>
    [id, { uri: `file:///${id}`, verified: true }])) });
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(true);
  const row = db.select().from(schema.entries).where(eq(schema.entries.note_id, 'ordered-entry')).get()!;
  expect(row.assets!.filter((asset) => asset.type === AssetType.IMAGE).map((asset) => asset.assetId))
    .toEqual(['photo-z', 'photo-a']);
  expect(row.assets!.filter((asset) => asset.type === AssetType.AUDIO).map((asset) => asset.assetId))
    .toEqual(['voice-z', 'voice-a']);
  expect((await store.capture()).domain.entries[0].attachmentOrder).toEqual(ids);
  sqlite.exec('DELETE FROM entries; DELETE FROM media_assets; DELETE FROM user_profile');
});

test('production journal applies 10,000 entries atomically, skips unchanged writes, and checks generations', async () => {
  db.insert(schema.cloudSyncState).values({ vault_id: 'large', device_id: 'device', updated_at: 1 }).run();
  const domain: SnapshotDomain = {
    entries: Array.from({ length: 10_000 }, (_, index) => ({ entryId: `entry-${String(index).padStart(5, '0')}`,
      title: null, content: 'Large restore', mood: null, createdAt: 1, updatedAt: 1, conflictOriginId: null })),
    tags: [{ tagId: 'tag', title: 'Tag', createdAt: 1, updatedAt: 1, conflictOriginId: null }],
    entryTags: [], prompts: [], media: [], tombstones: [], conflicts: [],
    profile: { profileId: 'profile', displayName: null, photoAssetId: null, updatedAt: 1 },
  };
  domain.entryTags = domain.entries.map((entry) => ({ entryId: entry.entryId, tagId: 'tag', createdAt: 1 }));
  const store = new ProductionSnapshotJournalStore('large', 'device', {} as never);
  const started = performance.now();
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(true);
  console.log(`10,000-entry production SQLite restore: ${Math.round(performance.now() - started)} ms`);
  expect((await store.capture()).domain).toEqual(domain);
  expect(sqlite.query('SELECT tags FROM entries LIMIT 1').get()).toEqual({ tags: 'tag' });
  const changes = () => (sqlite.query('SELECT total_changes() AS count').get() as { count: number }).count;
  const before = changes();
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(true);
  expect(changes()).toBe(before);
  let transactions = 0;
  beforeTransaction = () => {
    if (++transactions === 2) sqlite.exec('UPDATE cloud_sync_state SET journal_generation = 1');
  };
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(false);
  beforeTransaction = null;
  // A failed later batch must roll back the deletes and all earlier batches.
  const invalid = structuredClone(domain);
  invalid.entries[1000].entryId = invalid.entries[0].entryId;
  await expect(store.applyMergedIfGeneration(invalid, 1)).rejects.toThrow();
  expect((await store.capture()).domain).toEqual(domain);
});
