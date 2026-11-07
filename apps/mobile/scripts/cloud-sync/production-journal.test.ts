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
