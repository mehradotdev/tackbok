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
mock.module('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: {},
}));
mock.module('../../src/lib/cloudSync/snapshot/media', () => ({
  copyVerifiedMediaFile() {},
  createMediaPartialFileSink() {},
  openMediaUploadSource() {},
}));
mock.module('../../src/lib/cloudSync/media/streamingHash', () => ({
  inspectLocalMediaFile() {},
}));
const { ProductionSnapshotJournalStore } =
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

test('production journal keeps when this device first saw each conflict and dates initial-restore conflicts to the join', async () => {
  const conflict = (id: string) => ({
    conflictId: id.repeat(64),
    entityType: 'profile' as const,
    entityId: 'profile',
    field: 'displayName' as const,
    baseValueHash: null,
    localValueHash: 'b'.repeat(64),
    remoteValueHash: 'c'.repeat(64),
    primaryValueHash: 'b'.repeat(64),
    alternates: [{ valueHash: 'c'.repeat(64), value: 'Other' }],
    recoveredEntityIds: [],
  });
  const domain: SnapshotDomain = {
    entries: [],
    tags: [],
    entryTags: [],
    prompts: [],
    media: [],
    tombstones: [],
    conflicts: [conflict('1')],
    profile: {
      profileId: 'profile',
      displayName: 'Mine',
      photoAssetId: null,
      updatedAt: 1,
    },
  };
  db.insert(schema.cloudVault)
    .values({
      vault_id: 'joined',
      provider_kind: 'google-drive',
      device_id: 'device',
      status: 'restoring',
      created_at: 500,
      updated_at: 500,
    })
    .run();
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'joined', device_id: 'device', updated_at: 1 })
    .run();
  const store = new ProductionSnapshotJournalStore('joined', 'device', {} as never);
  const rows = () =>
    db
      .select()
      .from(schema.cloudConflicts)
      .where(eq(schema.cloudConflicts.vault_id, 'joined'))
      .orderBy(schema.cloudConflicts.conflict_id)
      .all();

  // The initial restore imports conflicts that predate this device joining.
  // Conflict 3 is created by this device's own merge, so it is new.
  await store.rememberRemoteConflicts([conflict('1').conflictId]);
  const restoredAt = Date.now();
  expect(
    await store.applyMergedIfGeneration(
      { ...domain, conflicts: [conflict('1'), conflict('3')] },
      0,
    ),
  ).toBe(true);
  const [imported, merged] = rows();
  expect(imported.created_at).toBe(500);
  expect(merged.created_at).toBeGreaterThanOrEqual(restoredAt);

  db.update(schema.cloudConflicts).set({ acknowledged_at: 600, archived_at: 700 }).run();
  db.update(schema.cloudVault).set({ status: 'idle' }).run();
  const before = Date.now();
  expect(
    await store.applyMergedIfGeneration(
      { ...domain, conflicts: [conflict('1'), conflict('2'), conflict('3')] },
      0,
    ),
  ).toBe(true);
  const [old, added] = rows();
  expect(old).toMatchObject({ created_at: 500, acknowledged_at: 600, archived_at: 700 });
  expect(added.acknowledged_at).toBeNull();
  expect(added.archived_at).toBeNull();
  expect(added.created_at).toBeGreaterThanOrEqual(before);
  sqlite.exec(
    'DELETE FROM cloud_conflicts; DELETE FROM cloud_vault; DELETE FROM user_profile',
  );
});

test('conflicts created after the first restore apply stay visible when the restore pass is retried', async () => {
  const { mergeSnapshotDomains } = await import('../../src/lib/cloudSync/snapshot/merge');
  const { deriveConflictItems, parseConflictRecord } =
    await import('../../src/lib/cloudSync/ui/conflictSummary');
  db.insert(schema.cloudVault)
    .values({
      vault_id: 'retried',
      provider_kind: 'google-drive',
      device_id: 'device',
      status: 'restoring',
      created_at: 500,
      updated_at: 500,
    })
    .run();
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'retried', device_id: 'device', updated_at: 500 })
    .run();
  const store = new ProductionSnapshotJournalStore('retried', 'device', {} as never);
  const initial: SnapshotDomain = {
    entries: [
      {
        entryId: 'entry',
        title: null,
        content: 'First',
        mood: null,
        createdAt: 501,
        updatedAt: 501,
        conflictOriginId: null,
      },
    ],
    tags: [],
    entryTags: [],
    prompts: [],
    media: [],
    tombstones: [],
    conflicts: [],
    profile: {
      profileId: 'profile',
      displayName: 'First',
      photoAssetId: null,
      updatedAt: 501,
    },
  };
  await store.rememberRemoteConflicts([]);
  expect(await store.applyMergedIfGeneration(initial, 0)).toBe(true);

  // The app stops before the pass marks the vault idle; both devices then edit
  // the restored name and entry, and the retried pass merges them.
  const left = structuredClone(initial);
  const right = structuredClone(initial);
  left.profile = { ...left.profile, displayName: 'Alice', updatedAt: 900 };
  right.profile = { ...right.profile, displayName: 'Bob', updatedAt: 901 };
  left.entries[0] = { ...left.entries[0], content: 'Left', updatedAt: 900 };
  right.entries[0] = { ...right.entries[0], content: 'Right', updatedAt: 901 };
  const merged = mergeSnapshotDomains(initial, left, right);
  await store.rememberRemoteConflicts(merged.conflicts.map((c) => c.conflictId));
  expect(await store.applyMergedIfGeneration(merged, 0)).toBe(true);

  const rows = db
    .select()
    .from(schema.cloudConflicts)
    .where(eq(schema.cloudConflicts.vault_id, 'retried'))
    .all();
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows.every((row) => row.created_at > 500)).toBe(true);
  const items = deriveConflictItems(
    rows.map((row) =>
      parseConflictRecord(row.conflict_id, row.conflict_json, row.created_at),
    ),
    {
      joinedAt: 500,
      currentName: merged.profile.displayName,
      currentPhotoAssetId: null,
      currentPhotoBlobHash: null,
      localPhotos: new Map(),
      existingEntryIds: new Set(merged.entries.map((entry) => entry.entryId)),
    },
  );
  expect(items.map((item) => item.kind).sort()).toEqual(['entries', 'name']);
  sqlite.exec(
    'DELETE FROM cloud_conflicts; DELETE FROM cloud_vault; DELETE FROM user_profile; DELETE FROM entries',
  );
});
