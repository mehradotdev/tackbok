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
    private readonly path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.map(uriOf).join('/');
    }
    // Like Expo's Android File, a scheme-less absolute path has no URI.
    get uri() {
      if (this.path.startsWith('/')) throw new Error('URI is not absolute');
      return this.path;
    }
    get exists() {
      return existingFiles.has(this.uri);
    }
    delete() {
      existingFiles.delete(this.uri);
    }
  },
  Paths: { document: 'file:///documents' },
}));
mock.module('../../src/lib/cloudSync/snapshot/media', () => ({
  copyVerifiedMediaFile(source: { uri: string }, destination: { uri: string }) {
    copiedMedia.push({ from: source.uri, to: destination.uri });
    existingFiles.add(destination.uri);
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
  expect(await store.applyMergedIfGeneration(domain, 0, { remoteDerived: true })).toBe(
    true,
  );
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
  expect(await store.applyMergedIfGeneration(domain, 0, { remoteDerived: true })).toBe(
    true,
  );
  console.log(
    `10,000-entry production SQLite restore: ${Math.round(performance.now() - started)} ms`,
  );
  expect((await store.capture()).domain).toEqual(domain);
  expect(sqlite.query('SELECT tags FROM entries LIMIT 1').get()).toEqual({ tags: 'tag' });
  const changes = () =>
    (sqlite.query('SELECT total_changes() AS count').get() as { count: number }).count;
  const before = changes();
  expect(await store.applyMergedIfGeneration(domain, 0, { remoteDerived: true })).toBe(
    true,
  );
  expect(changes()).toBe(before);
  let transactions = 0;
  beforeTransaction = () => {
    if (++transactions === 2)
      sqlite.exec('UPDATE cloud_sync_state SET journal_generation = 1');
  };
  expect(await store.applyMergedIfGeneration(domain, 0, { remoteDerived: true })).toBe(
    false,
  );
  beforeTransaction = null;
  // A failed later batch must roll back the deletes and all earlier batches.
  const invalid = structuredClone(domain);
  invalid.entries[1000].entryId = invalid.entries[0].entryId;
  await expect(
    store.applyMergedIfGeneration(invalid, 1, { remoteDerived: true }),
  ).rejects.toThrow();
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
      { remoteDerived: true },
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
      { remoteDerived: true },
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
  expect(await store.applyMergedIfGeneration(initial, 0, { remoteDerived: true })).toBe(
    true,
  );

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
  expect(await store.applyMergedIfGeneration(merged, 0, { remoteDerived: true })).toBe(
    true,
  );

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

test('an unchanged first apply completes the import, so later remote conflicts stay visible', async () => {
  sqlite.exec(
    'DELETE FROM cloud_conflicts; DELETE FROM cloud_vault; DELETE FROM user_profile; DELETE FROM entries',
  );
  db.insert(schema.cloudVault)
    .values({
      vault_id: 'equal',
      provider_kind: 'google-drive',
      device_id: 'd',
      status: 'restoring',
      created_at: 500,
      updated_at: 500,
    })
    .run();
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'equal', device_id: 'd', updated_at: 500 })
    .run();
  const store = new ProductionSnapshotJournalStore('equal', 'd', {} as never);
  const initial = (await store.capture()).domain;
  await store.rememberRemoteConflicts([]);
  expect(await store.applyMergedIfGeneration(initial, 0, { remoteDerived: true })).toBe(
    true,
  );
  const vault = db
    .select()
    .from(schema.cloudVault)
    .where(eq(schema.cloudVault.vault_id, 'equal'))
    .get()!;
  expect(vault.conflicts_imported_at).not.toBeNull();

  // The pass stops before `restoring` clears; a later pass sees a new remote conflict.
  const merged = structuredClone(initial);
  merged.profile.displayName = 'Current';
  merged.conflicts = [
    {
      conflictId: 'f'.repeat(64),
      entityType: 'profile',
      entityId: 'profile',
      field: 'displayName',
      baseValueHash: null,
      localValueHash: 'a'.repeat(64),
      remoteValueHash: 'b'.repeat(64),
      primaryValueHash: 'a'.repeat(64),
      alternates: [{ valueHash: 'b'.repeat(64), value: 'Later remote name' }],
      recoveredEntityIds: [],
    },
  ];
  await store.rememberRemoteConflicts(
    merged.conflicts.map((conflict) => conflict.conflictId),
  );
  expect(await store.applyMergedIfGeneration(merged, 0, { remoteDerived: true })).toBe(
    true,
  );
  const row = db
    .select()
    .from(schema.cloudConflicts)
    .where(eq(schema.cloudConflicts.vault_id, 'equal'))
    .get()!;
  expect(row.created_at).toBeGreaterThan(500);
});

// Models a fresh install: no profile row yet and the migration-seeded marker.
function resetToFreshProfile() {
  sqlite.exec(
    "DELETE FROM media_assets; DELETE FROM user_profile; INSERT OR IGNORE INTO profile_pristine_marker VALUES ('self')",
  );
}

const profilePhoto = (assetId: string) => ({
  assetId,
  ownerType: 'profile' as const,
  ownerId: 'profile',
  kind: 'profile-photo' as const,
  blobHash: 'a'.repeat(64),
  byteSize: 1,
  mimeType: 'image/jpeg',
  width: null,
  height: null,
  durationMs: null,
  createdAt: 1,
  updatedAt: 1,
});

test('only a provably fresh database starts with a pristine local profile', () => {
  const migrate = (prepare: (database: Database) => void) => {
    const fresh = new Database(':memory:');
    try {
      for (const { tag } of journal.entries) {
        if (tag.startsWith('0005_')) prepare(fresh);
        fresh.exec(
          readFileSync(
            join(import.meta.dir, `../../src/drizzle/${tag}.sql`),
            'utf8',
          ).replaceAll('--> statement-breakpoint', ''),
        );
      }
      return fresh.query('SELECT profile_id FROM profile_pristine_marker').all();
    } finally {
      fresh.close();
    }
  };
  expect(migrate(() => {})).toEqual([{ profile_id: 'self' }]);
  // Existing installs are conservatively touched: any profile row, even an
  // empty unstamped one, or any vault may carry an authored or synced clear.
  expect(
    migrate((database) =>
      database.exec(
        "INSERT INTO user_profile (profile_id, updated_at) VALUES ('self', 0)",
      ),
    ),
  ).toEqual([]);
  expect(
    migrate((database) =>
      database.exec(
        "INSERT INTO cloud_vault (vault_id, provider_kind, device_id, created_at, updated_at) VALUES ('vault', 'google-drive', 'device', 1, 1)",
      ),
    ),
  ).toEqual([]);
  // An install from before the normalized profile has journal data but no
  // profile row yet; its legacy profile may be a deliberate clear.
  for (const insert of [
    "INSERT INTO entries (note_id, text_content, created_at, updated_at) VALUES ('legacy', 'Existing journal', 1, 1)",
    "INSERT INTO tags (tag_id, title, created_at, updated_at) VALUES ('tag', 'Tag', 1, 1)",
    "INSERT INTO custom_prompts (prompt_id, title, created_at, updated_at) VALUES ('prompt', 'Prompt', 1, 1)",
  ]) {
    expect(migrate((database) => database.exec(insert))).toEqual([]);
  }
});

test('the legacy profile backfill keeps a pristine profile only on a fresh install', async () => {
  mock.module('../../src/lib/settings/store', () => ({
    hydrateProfileCache() {},
    markLegacyProfileMigrationComplete() {},
  }));
  const { runNormalizedModelBackfill } =
    await import('../../src/lib/cloudSync/storage/backfill');
  const { runExclusiveDbTransaction } = await import('../../src/db');
  const { isLocalProfilePristine } =
    await import('../../src/lib/cloudSync/storage/repositories');
  const backfill = async (
    legacy: Partial<Parameters<typeof runNormalizedModelBackfill>[0]>,
    prepare = '',
  ) => {
    resetToFreshProfile();
    sqlite.exec(
      `DELETE FROM entries; DELETE FROM tags; DELETE FROM custom_prompts; DELETE FROM cloud_sync_migration; DELETE FROM cloud_sync_migration_items; ${prepare}`,
    );
    const result = await runNormalizedModelBackfill({
      profileName: null,
      profileEmail: null,
      profileImageUri: null,
      priorAppUse: false,
      ...legacy,
    });
    expect(result.status).toBe('complete');
    return runExclusiveDbTransaction(isLocalProfilePristine);
  };

  // A fresh install: the empty first-launch profile is not a decision.
  expect(await backfill({})).toBe(true);
  // An earlier launch saved settings or completed onboarding: the empty
  // legacy profile may be a deliberate clear, even with no journal left.
  expect(await backfill({ priorAppUse: true })).toBe(false);
  expect(await backfill({ profileEmail: 'local@example.com' })).toBe(false);
  // Existing journal data is prior use even if the marker was seeded.
  expect(
    await backfill(
      {},
      "INSERT INTO entries (note_id, text_content, created_at, updated_at) VALUES ('legacy', 'Existing journal', 1, 1)",
    ),
  ).toBe(false);
  sqlite.exec(
    'DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM media_assets; DELETE FROM cloud_sync_migration; DELETE FROM cloud_sync_migration_items',
  );
});

test('profile updatedAt stays 0 and the profile stays pristine until a synced field is authored', async () => {
  resetToFreshProfile();
  const { runExclusiveDbTransaction } = await import('../../src/db');
  const { isLocalProfilePristine, updateProfileInTransaction } =
    await import('../../src/lib/cloudSync/storage/repositories');
  type Args = Parameters<typeof updateProfileInTransaction>;
  const write = (update: Args[1], context: Args[2]) =>
    runExclusiveDbTransaction((tx) => updateProfileInTransaction(tx, update, context));
  const profileUpdatedAt = () => db.select().from(schema.userProfile).get()?.updated_at;
  const pristine = () => runExclusiveDbTransaction(isLocalProfilePristine);

  // An empty legacy backfill and a skipped onboarding name leave it pristine.
  await write(
    { displayName: null, email: null, photoUri: null },
    { origin: 'migration', now: 10 },
  );
  await write({ displayName: null }, { now: 11 });
  await write({ email: 'local@example.com' }, { now: 12 });
  expect(profileUpdatedAt()).toBe(0);
  expect(await pristine()).toBe(true);

  await write({ displayName: 'Mehra' }, { now: 13 });
  expect(profileUpdatedAt()).toBe(13);
  expect(await pristine()).toBe(false);
  await write({ displayName: null }, { now: 14 });
  expect(profileUpdatedAt()).toBe(14);
  await write({ displayName: null }, { now: 15 });
  expect(profileUpdatedAt()).toBe(14);
  // Clearing again does not restore provenance.
  expect(await pristine()).toBe(false);

  // Imports and backfills write through the same path: a photo alone touches it.
  resetToFreshProfile();
  await write({ photoUri: 'file:///imported.jpg' }, { origin: 'migration', now: 16 });
  expect(await pristine()).toBe(false);
});

test('a fresh install that skipped onboarding adopts the remote profile on first join', async () => {
  resetToFreshProfile();
  sqlite.exec('DELETE FROM entries; DELETE FROM cloud_sync_state');
  const { mergeSnapshotDomains } = await import('../../src/lib/cloudSync/snapshot/merge');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'first-join', device_id: 'device', updated_at: 1 })
    .run();
  const store = new ProductionSnapshotJournalStore('first-join', 'device', {} as never);
  const captured = await store.capture();
  expect(captured.localProfilePristine).toBe(true);

  const remote = structuredClone(captured.domain);
  remote.profile = {
    profileId: 'profile',
    displayName: 'Mehra',
    photoAssetId: 'remote-photo',
    updatedAt: 10,
  };
  remote.media = [profilePhoto('remote-photo')];
  const merged = mergeSnapshotDomains(null, captured.domain, remote, {
    localProfilePristine: captured.localProfilePristine,
  });
  expect(merged.profile).toEqual(remote.profile);
  expect(merged.conflicts).toEqual([]);

  // Native file I/O is outside this real-SQLite projection test.
  Object.defineProperty(store, 'materializeMedia', {
    value: async () =>
      new Map([['remote-photo', { uri: 'file:///remote-photo', verified: true }]]),
  });
  expect(await store.applyMergedIfGeneration(merged, 0, { remoteDerived: true })).toBe(
    true,
  );
  expect((await store.capture()).localProfilePristine).toBe(false);
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
  expect(
    await store.applyMergedIfGeneration(domain, generation, { remoteDerived: true }),
  ).toBe(true);

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

test('a rejected apply removes the photo it copied unless a committed row uses it', async () => {
  sqlite.exec(
    'DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM sync_retained_media; DELETE FROM cloud_sync_state',
  );
  existingFiles.clear();
  existingFiles.add('file:///old.jpg');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'photo-race', device_id: 'device', updated_at: 1 })
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
    'photo-race',
    'device',
    new ProductionSnapshotMediaStore(),
  );
  const { domain, generation } = await store.capture();
  // A new asset ID needs its own file, copied before the generation check.
  domain.profile.photoAssetId = 'photo-new';
  domain.media[0].assetId = 'photo-new';
  const rejectApply = (commitWinner: boolean) => {
    let transactions = 0;
    beforeTransaction = () => {
      if (++transactions !== 2) return;
      db.update(schema.cloudSyncState)
        .set({ journal_generation: generation + 1 })
        .where(eq(schema.cloudSyncState.vault_id, 'photo-race'))
        .run();
      if (!commitWinner) return;
      // The apply that won the race committed a row for the same file.
      db.insert(schema.mediaAssets)
        .values({
          asset_id: 'photo-winner',
          owner_type: 'profile',
          owner_id: 'self',
          kind: 'profile-photo',
          local_uri: copiedMedia.at(-1)!.to.replace('file:///documents/', ''),
          blob_hash: fakeBlobHash,
          byte_size: 1,
          created_at: 1,
          updated_at: 1,
        })
        .run();
    };
  };

  rejectApply(false);
  expect(
    await store.applyMergedIfGeneration(domain, generation, { remoteDerived: true }),
  ).toBe(false);
  const copied = copiedMedia.at(-1)!.to;
  expect(copied).toContain(fakeBlobHash);
  expect(existingFiles.has(copied)).toBe(false);
  expect(existingFiles.has('file:///old.jpg')).toBe(true);

  db.update(schema.cloudSyncState)
    .set({ journal_generation: generation })
    .where(eq(schema.cloudSyncState.vault_id, 'photo-race'))
    .run();
  rejectApply(true);
  expect(
    await store.applyMergedIfGeneration(domain, generation, { remoteDerived: true }),
  ).toBe(false);
  beforeTransaction = null;
  expect(existingFiles.has(copied)).toBe(true);
});

function setupPhotoSwitch(vault: string) {
  sqlite.exec(
    'DELETE FROM entries; DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM sync_retained_media; DELETE FROM cloud_sync_state',
  );
  existingFiles.clear();
  existingFiles.add('file:///old.jpg');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: vault, device_id: 'device', updated_at: 1 })
    .run();
  db.insert(schema.mediaAssets)
    .values({
      asset_id: 'old-photo',
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
      photo_asset_id: 'old-photo',
      updated_at: 1,
    })
    .run();
  return new ProductionSnapshotJournalStore(
    vault,
    'device',
    new ProductionSnapshotMediaStore(),
  );
}

/** Holds an apply after it materialized its media, before its transaction. */
function pauseAfterMaterializing(
  store: InstanceType<typeof ProductionSnapshotJournalStore>,
) {
  const { promise: ready, resolve: materialized } = Promise.withResolvers<void>();
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  const materialize = Reflect.get(store, 'materializeMedia') as (
    ...args: unknown[]
  ) => Promise<unknown>;
  Object.defineProperty(store, 'materializeMedia', {
    value: async (...args: unknown[]) => {
      const result = await materialize.apply(store, args);
      materialized();
      await released;
      return result;
    },
  });
  return { ready, release };
}

test.each([
  'live absolute',
  'live relative',
  'live bare',
  'retained original absolute',
  'retained staged absolute',
  'retained original relative',
  'retained original bare',
  'retained staged bare',
  'legacy absolute',
  'legacy bare',
])(
  'a rejected apply keeps its copied photo when a committed %s URI references it',
  async (kind) => {
    const store = setupPhotoSwitch('shared');
    const { domain } = await store.capture();
    domain.profile.photoAssetId = 'new-photo';
    domain.media[0].assetId = 'new-photo';
    const paused = pauseAfterMaterializing(store);
    const rejected = store.applyMergedIfGeneration(domain, 0, { remoteDerived: true });
    await paused.ready;
    const absolute = copiedMedia.at(-1)!.to;
    const uri = kind.endsWith('absolute')
      ? absolute
      : kind.endsWith('bare')
        ? absolute.replace('file://', '')
        : absolute.replace('file:///documents/', '');
    if (kind.startsWith('live')) {
      db.insert(schema.mediaAssets)
        .values({
          asset_id: 'shared',
          owner_type: 'profile',
          owner_id: 'self',
          kind: 'profile-photo',
          local_uri: uri,
          blob_hash: fakeBlobHash,
          byte_size: 1,
          created_at: 1,
          updated_at: 1,
        })
        .run();
    } else if (kind.startsWith('legacy')) {
      db.insert(schema.entries)
        .values({
          note_id: 'other-entry',
          assets: [{ type: AssetType.IMAGE, uri }],
          created_at: 1,
          updated_at: 1,
        })
        .run();
    } else {
      db.insert(schema.syncRetainedMedia)
        .values({
          ledger_id: 'shared',
          asset_id: 'shared',
          original_owner_type: 'profile',
          original_owner_id: 'self',
          original_uri: kind.includes('original') ? uri : 'photos/old.jpg',
          staged_uri: kind.includes('staged') ? uri : null,
          kind: 'profile-photo',
          state: 'staged',
          created_at: 1,
          updated_at: 1,
        })
        .run();
    }
    sqlite.exec('UPDATE cloud_sync_state SET journal_generation = 1');
    paused.release();
    expect(await rejected).toBe(false);
    expect(existingFiles.has(absolute)).toBe(true);
  },
);

test('a rejected apply still removes its copy when only a bare path to another file shares its name', async () => {
  const store = setupPhotoSwitch('bare-other');
  const { domain } = await store.capture();
  domain.profile.photoAssetId = 'new-photo';
  domain.media[0].assetId = 'new-photo';
  const paused = pauseAfterMaterializing(store);
  const rejected = store.applyMergedIfGeneration(domain, 0, { remoteDerived: true });
  await paused.ready;
  const absolute = copiedMedia.at(-1)!.to;
  const name = absolute.slice(absolute.lastIndexOf('/') + 1);
  db.insert(schema.entries)
    .values({
      note_id: 'other-entry',
      assets: [{ type: AssetType.IMAGE, uri: `/elsewhere/${name}` }],
      created_at: 1,
      updated_at: 1,
    })
    .run();
  sqlite.exec('UPDATE cloud_sync_state SET journal_generation = 1');
  paused.release();
  expect(await rejected).toBe(false);
  expect(existingFiles.has(absolute)).toBe(false);
});

test('a concurrent apply waits for a rejected apply and its cleanup', async () => {
  const loser = setupPhotoSwitch('concurrent');
  const winner = new ProductionSnapshotJournalStore(
    'concurrent',
    'device',
    new ProductionSnapshotMediaStore(),
  );
  const { domain } = await loser.capture();
  domain.profile.photoAssetId = 'new-photo';
  domain.media[0].assetId = 'new-photo';
  const first = pauseAfterMaterializing(loser);
  const rejected = loser.applyMergedIfGeneration(domain, 0, { remoteDerived: true });
  await first.ready;
  const destination = copiedMedia.at(-1)!.to;
  sqlite.exec('UPDATE cloud_sync_state SET journal_generation = 1');
  const second = pauseAfterMaterializing(winner);
  const committed = winner.applyMergedIfGeneration(domain, 1, { remoteDerived: true });
  let winnerMaterialized = false;
  void second.ready.then(() => {
    winnerMaterialized = true;
  });
  await Bun.sleep(10);
  // The second apply cannot reuse the first apply's uncommitted copy.
  expect(winnerMaterialized).toBe(false);
  second.release();
  first.release();
  expect(await rejected).toBe(false);
  expect(await committed).toBe(true);
  const row = db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.asset_id, 'new-photo'))
    .get()!;
  expect(row.download_state).toBe('verified');
  expect(existingFiles.has(destination)).toBe(true);
});

test('applying only local state keeps a pristine profile; a remote apply ends it', async () => {
  resetToFreshProfile();
  sqlite.exec('DELETE FROM entries; DELETE FROM cloud_sync_state');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'solo', device_id: 'device', updated_at: 1 })
    .run();
  const store = new ProductionSnapshotJournalStore('solo', 'device', {} as never);
  const captured = await store.capture();
  expect(captured.localProfilePristine).toBe(true);

  // A solo publication re-applies its own captured state (unchanged path)...
  expect(
    await store.applyMergedIfGeneration(captured.domain, 0, { remoteDerived: false }),
  ).toBe(true);
  expect((await store.capture()).localProfilePristine).toBe(true);
  // ...or reconciles it with later local edits (full replacement path).
  const reconciled = structuredClone(captured.domain);
  reconciled.entries = [
    {
      entryId: 'solo-entry',
      title: null,
      content: 'Local only',
      mood: null,
      createdAt: 1,
      updatedAt: 1,
      conflictOriginId: null,
    },
  ];
  expect(
    await store.applyMergedIfGeneration(reconciled, 0, { remoteDerived: false }),
  ).toBe(true);
  expect((await store.capture()).localProfilePristine).toBe(true);

  // The same unchanged state received from another device ends provenance.
  expect(
    await store.applyMergedIfGeneration(reconciled, 0, { remoteDerived: true }),
  ).toBe(true);
  expect((await store.capture()).localProfilePristine).toBe(false);
  sqlite.exec('DELETE FROM entries');
});

test('authored profile clears stay positive and win a no-base merge after a clock reset', async () => {
  resetToFreshProfile();
  sqlite.exec('DELETE FROM cloud_sync_state');
  const { runExclusiveDbTransaction } = await import('../../src/db');
  const { updateProfileInTransaction } =
    await import('../../src/lib/cloudSync/storage/repositories');
  const { mergeSnapshotDomains } = await import('../../src/lib/cloudSync/snapshot/merge');
  type Args = Parameters<typeof updateProfileInTransaction>;
  const write = (update: Args[1], context: Args[2]) =>
    runExclusiveDbTransaction((tx) => updateProfileInTransaction(tx, update, context));
  const profileUpdatedAt = () => db.select().from(schema.userProfile).get()?.updated_at;

  await write({ displayName: 'Mehra', photoUri: 'file:///profile.jpg' }, { now: 10 });
  // The clock resets: the name clear and the photo clear still move forward.
  await write({ displayName: null }, { now: 0 });
  expect(profileUpdatedAt()).toBe(11);
  await write({ photoUri: null }, { now: 0 });
  expect(profileUpdatedAt()).toBe(12);

  // A first authored write at clock zero is not mistaken for pristine either.
  resetToFreshProfile();
  await write({ displayName: 'Mehra' }, { now: 0 });
  expect(profileUpdatedAt()).toBe(1);
  await write({ displayName: null }, { now: 0 });
  expect(profileUpdatedAt()).toBe(2);

  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'clock', device_id: 'device', updated_at: 1 })
    .run();
  const store = new ProductionSnapshotJournalStore('clock', 'device', {} as never);
  const { domain, localProfilePristine } = await store.capture();
  expect(localProfilePristine).toBe(false);
  const remote = structuredClone(domain);
  remote.profile.displayName = 'Mehra';
  remote.profile.updatedAt = 1;
  const merged = mergeSnapshotDomains(null, domain, remote, { localProfilePristine });
  // The deliberate clear is not silently replaced by the remote name.
  expect(merged.conflicts.map((value) => value.field)).toEqual(['displayName']);
});

test('a restored profile authored at updatedAt 0 is not treated as pristine', async () => {
  resetToFreshProfile();
  sqlite.exec('DELETE FROM entries; DELETE FROM cloud_sync_state');
  const { mergeSnapshotDomains } = await import('../../src/lib/cloudSync/snapshot/merge');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'remote-zero', device_id: 'device', updated_at: 1 })
    .run();
  const store = new ProductionSnapshotJournalStore('remote-zero', 'device', {} as never);
  const { domain } = await store.capture();
  // An older client (or a backup restored from one) can write a name at 0.
  domain.profile.displayName = 'Authored at clock zero';
  expect(await store.applyMergedIfGeneration(domain, 0, { remoteDerived: true })).toBe(
    true,
  );
  const restored = await store.capture();
  expect(restored.domain.profile.updatedAt).toBe(0);
  expect(restored.localProfilePristine).toBe(false);

  const other = structuredClone(restored.domain);
  other.profile.photoAssetId = 'other-photo';
  other.profile.updatedAt = 10;
  other.media = [profilePhoto('other-photo')];
  for (const [local, remote] of [
    [restored.domain, other],
    [other, restored.domain],
  ]) {
    const merged = mergeSnapshotDomains(null, local, remote, {
      localProfilePristine: restored.localProfilePristine,
    });
    expect(merged.conflicts.map((value) => value.field)).toEqual(['photoAssetId']);
  }
});

test('an older client full clear at updatedAt 0 conflicts after a restore', async () => {
  resetToFreshProfile();
  sqlite.exec('DELETE FROM entries; DELETE FROM cloud_sync_state');
  const { mergeSnapshotDomains } = await import('../../src/lib/cloudSync/snapshot/merge');
  const { decodeSnapshot, encodeSnapshot } =
    await import('../../src/lib/cloudSync/snapshot/codec');
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'old-clear', device_id: 'device', updated_at: 1 })
    .run();
  const store = new ProductionSnapshotJournalStore('old-clear', 'device', {} as never);
  // Older writers stamped a deliberate clear of both fields with `now`, which
  // can be 0. It encodes exactly like an untouched profile.
  const oldClear = (await store.capture()).domain;
  oldClear.profile = {
    profileId: 'profile',
    displayName: null,
    photoAssetId: null,
    updatedAt: 0,
  };
  const encoded = encodeSnapshot({
    format: 'tackbok-snapshot',
    vaultId: 'old-clear',
    parentSnapshotIds: [],
    observedDeviceHeads: [],
    authorDeviceId: 'old-device',
    deviceSequence: 1,
    createdAt: 1,
    ...oldClear,
  });
  const decoded = decodeSnapshot(encoded.compressedBytes, encoded.snapshotId);
  // The restore matches the empty local state, so it takes the unchanged path.
  expect(
    await store.applyMergedIfGeneration(decoded.payload, 0, { remoteDerived: true }),
  ).toBe(true);
  const restored = await store.capture();
  expect(restored.domain.profile).toEqual(oldClear.profile);
  expect(restored.localProfilePristine).toBe(false);

  const other = structuredClone(restored.domain);
  other.profile = {
    profileId: 'profile',
    displayName: 'Another device',
    photoAssetId: 'remote-photo',
    updatedAt: 10,
  };
  other.media = [profilePhoto('remote-photo')];
  for (const [local, remote] of [
    [restored.domain, other],
    [other, restored.domain],
  ]) {
    const merged = mergeSnapshotDomains(null, local, remote, {
      localProfilePristine: restored.localProfilePristine,
    });
    expect(merged.conflicts.map((value) => value.field).sort()).toEqual([
      'displayName',
      'photoAssetId',
    ]);
  }

  // The same restore through a full replacement also ends provenance.
  resetToFreshProfile();
  sqlite.exec(
    "INSERT INTO user_profile (profile_id, display_name, updated_at) VALUES ('self', 'Local', 1)",
  );
  expect(
    await store.applyMergedIfGeneration(decoded.payload, 0, { remoteDerived: true }),
  ).toBe(true);
  expect((await store.capture()).localProfilePristine).toBe(false);
});
