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
let beforeTransaction: (() => void) | null = null;
mock.module('../../src/db', () => ({
  ...schema,
  db,
  runExclusiveDbTransaction: async (operation: (tx: typeof db) => Promise<unknown>) => {
    beforeTransaction?.();
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
// Files listed here exist on the fake disk and hash to `fakeBlobHash`.
const existingFiles = new Set<string>();
const fakeBlobHash = 'a'.repeat(64);
const copiedMedia: { from: string; to: string }[] = [];
const uriOf = (part: unknown) =>
  typeof part === 'object' && part && 'uri' in part ? String(part.uri) : String(part);
mock.module('expo-file-system', () => ({
  Directory: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    get exists() {
      return existingFiles.has(this.uri);
    }
  },
  Paths: { document: 'file:///documents' },
}));
mock.module('../../src/lib/cloudSync/snapshot/media', () => ({
  copyVerifiedMediaFile(source: { uri: string }, destination: { uri: string }) {
    copiedMedia.push({ from: source.uri, to: destination.uri });
  },
  createMediaPartialFileSink() {},
  openMediaUploadSource() {},
}));
mock.module('../../src/lib/cloudSync/media/streamingHash', () => ({
  inspectLocalMediaFile(uri: string) {
    if (!existingFiles.has(uri)) throw new Error('missing');
    return { sha256: fakeBlobHash, byteSize: 1 };
  },
}));
const { ProductionSnapshotJournalStore, ProductionSnapshotMediaStore } =
  await import('../../src/lib/cloudSync/snapshot/storage/productionJournal');
afterAll(() => sqlite.close());

test('production capture and restore preserve photo and voice order, including URI-only legacy assets', async () => {
  sqlite.exec(
    'DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM tags; DELETE FROM media_assets; DELETE FROM user_profile',
  );
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'ordered', device_id: 'device', updated_at: 1 })
    .run();
  const ids = ['photo-z', 'photo-a', 'voice-z', 'voice-a'];
  const assets = ids.map((id) => ({
    type: id.startsWith('photo') ? AssetType.IMAGE : AssetType.AUDIO,
    uri: `file:///${id}`,
  }));
  db.insert(schema.entries)
    .values({ note_id: 'ordered-entry', assets, created_at: 1, updated_at: 1 })
    .run();
  db.insert(schema.mediaAssets)
    .values(
      ids.map((id) => ({
        asset_id: id,
        owner_type: 'entry' as const,
        owner_id: 'ordered-entry',
        kind: id.startsWith('photo') ? ('photo' as const) : ('voice' as const),
        local_uri: `file:///${id}`,
        blob_hash: 'a'.repeat(64),
        byte_size: 8,
        created_at: 1,
        updated_at: 1,
      })),
    )
    .run();
  const store = new ProductionSnapshotJournalStore('ordered', 'device', {} as never);
  const { domain } = await store.capture();
  expect(domain.entries[0].attachmentOrder).toEqual(ids);
  expect(domain.media.map((asset) => asset.assetId)).toEqual([...ids].sort());
  // Simulate a receiving device whose existing attachments are in the wrong order.
  db.update(schema.entries)
    .set({ assets: [...assets].reverse() })
    .where(eq(schema.entries.note_id, 'ordered-entry'))
    .run();
  // Native file I/O is outside this real-SQLite projection test.
  Object.defineProperty(store, 'materializeMedia', {
    value: async () =>
      new Map(ids.map((id) => [id, { uri: `file:///${id}`, verified: true }])),
  });
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(true);
  const row = db
    .select()
    .from(schema.entries)
    .where(eq(schema.entries.note_id, 'ordered-entry'))
    .get()!;
  expect(
    row
      .assets!.filter((asset) => asset.type === AssetType.IMAGE)
      .map((asset) => asset.assetId),
  ).toEqual(['photo-z', 'photo-a']);
  expect(
    row
      .assets!.filter((asset) => asset.type === AssetType.AUDIO)
      .map((asset) => asset.assetId),
  ).toEqual(['voice-z', 'voice-a']);
  expect((await store.capture()).domain.entries[0].attachmentOrder).toEqual(ids);
  sqlite.exec('DELETE FROM entries; DELETE FROM media_assets; DELETE FROM user_profile');
});

test('production journal applies 10,000 entries atomically, skips unchanged writes, and checks generations', async () => {
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'large', device_id: 'device', updated_at: 1 })
    .run();
  const domain: SnapshotDomain = {
    entries: Array.from({ length: 10_000 }, (_, index) => ({
      entryId: `entry-${String(index).padStart(5, '0')}`,
      title: null,
      content: 'Large restore',
      mood: null,
      createdAt: 1,
      updatedAt: 1,
      conflictOriginId: null,
    })),
    tags: [
      { tagId: 'tag', title: 'Tag', createdAt: 1, updatedAt: 1, conflictOriginId: null },
    ],
    entryTags: [],
    prompts: [],
    media: [],
    tombstones: [],
    conflicts: [],
    profile: {
      profileId: 'profile',
      displayName: null,
      photoAssetId: null,
      updatedAt: 1,
    },
  };
  domain.entryTags = domain.entries.map((entry) => ({
    entryId: entry.entryId,
    tagId: 'tag',
    createdAt: 1,
  }));
  const store = new ProductionSnapshotJournalStore('large', 'device', {} as never);
  const started = performance.now();
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(true);
  console.log(
    `10,000-entry production SQLite restore: ${Math.round(performance.now() - started)} ms`,
  );
  expect((await store.capture()).domain).toEqual(domain);
  expect(sqlite.query('SELECT tags FROM entries LIMIT 1').get()).toEqual({ tags: 'tag' });
  const changes = () =>
    (sqlite.query('SELECT total_changes() AS count').get() as { count: number }).count;
  const before = changes();
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(true);
  expect(changes()).toBe(before);
  let transactions = 0;
  beforeTransaction = () => {
    if (++transactions === 2)
      sqlite.exec('UPDATE cloud_sync_state SET journal_generation = 1');
  };
  expect(await store.applyMergedIfGeneration(domain, 0)).toBe(false);
  beforeTransaction = null;
  // A failed later batch must roll back the deletes and all earlier batches.
  const invalid = structuredClone(domain);
  invalid.entries[1000].entryId = invalid.entries[0].entryId;
  await expect(store.applyMergedIfGeneration(invalid, 1)).rejects.toThrow();
  expect((await store.capture()).domain).toEqual(domain);
});

test('profile updatedAt stays 0 until a synced profile field is authored', async () => {
  sqlite.exec('DELETE FROM media_assets; DELETE FROM user_profile');
  const { runExclusiveDbTransaction } = await import('../../src/db');
  const { updateProfileInTransaction } =
    await import('../../src/lib/cloudSync/storage/repositories');
  type Args = Parameters<typeof updateProfileInTransaction>;
  const write = (update: Args[1], context: Args[2]) =>
    runExclusiveDbTransaction((tx) => updateProfileInTransaction(tx, update, context));
  const profileUpdatedAt = () => db.select().from(schema.userProfile).get()?.updated_at;

  // An empty legacy backfill and a skipped onboarding name leave it pristine.
  await write(
    { displayName: null, email: null, photoUri: null },
    { origin: 'migration', now: 10 },
  );
  await write({ displayName: null }, { now: 11 });
  await write({ email: 'local@example.com' }, { now: 12 });
  expect(profileUpdatedAt()).toBe(0);

  await write({ displayName: 'Mehra' }, { now: 13 });
  expect(profileUpdatedAt()).toBe(13);
  await write({ displayName: null }, { now: 14 });
  expect(profileUpdatedAt()).toBe(14);
  await write({ displayName: null }, { now: 15 });
  expect(profileUpdatedAt()).toBe(14);
});

test('a same-blob profile photo ID switch reuses the local file instead of downloading', async () => {
  sqlite.exec(
    'DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM sync_retained_media',
  );
  existingFiles.clear();
  existingFiles.add('file:///old.jpg');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'photo-switch', device_id: 'device', updated_at: 1 })
    .run();
  db.insert(schema.mediaAssets)
    .values({
      asset_id: 'photo-b',
      owner_type: 'profile',
      owner_id: 'self',
      kind: 'profile-photo',
      local_uri: 'file:///old.jpg',
      blob_hash: fakeBlobHash,
      byte_size: 1,
      created_at: 1,
      updated_at: 1,
    })
    .run();
  db.insert(schema.userProfile)
    .values({
      profile_id: 'self',
      display_name: 'Mehra',
      photo_asset_id: 'photo-b',
      updated_at: 1,
    })
    .run();

  const store = new ProductionSnapshotJournalStore(
    'photo-switch',
    'device',
    new ProductionSnapshotMediaStore(),
  );
  const { domain, generation } = await store.capture();
  domain.profile.photoAssetId = 'photo-a';
  domain.media[0].assetId = 'photo-a';
  expect(await store.applyMergedIfGeneration(domain, generation)).toBe(true);

  const [row] = db.select().from(schema.mediaAssets).all();
  expect(row.asset_id).toBe('photo-a');
  expect(row.download_state).not.toBe('pending');
  expect(copiedMedia.at(-1)).toEqual({
    from: 'file:///old.jpg',
    to: expect.stringContaining(fakeBlobHash),
  });
  let downloads = 0;
  await store.hydratePendingMedia(
    {
      downloadMedia: async () => {
        downloads += 1;
        return null;
      },
    } as never,
    2,
  );
  expect(downloads).toBe(0);
});
