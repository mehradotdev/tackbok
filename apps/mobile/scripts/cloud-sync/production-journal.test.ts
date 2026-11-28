import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema';
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
mock.module('../../src/db', () => ({
  ...schema,
  db,
  runExclusiveDbTransaction: async (operation: (tx: typeof db) => Promise<unknown>) => {
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
// Files whose existence check fails, like a passing I/O error.
const unreadableFiles = new Set<string>();
const fakeBlobHash = 'a'.repeat(64);
// Size and modification time of fake files; files without one are never cached.
const fileStats = new Map<string, { size: number; lastModified: number }>();
// Every file the fake hasher read, in order.
const hashReads: string[] = [];
const paths = { document: 'file:///documents' };
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
      if (unreadableFiles.has(this.uri)) throw new Error('I/O error');
      return existingFiles.has(this.uri);
    }
    get size() {
      return fileStats.get(this.uri)?.size;
    }
    get lastModified() {
      return fileStats.get(this.uri)?.lastModified;
    }
    delete() {
      existingFiles.delete(this.uri);
    }
  },
  Paths: paths,
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
  inspectLocalMediaFile(value: string) {
    // Like the real reader, a relative path is inside the document directory.
    const uri = value.startsWith('file:') ? value : `${paths.document}/${value}`;
    hashReads.push(uri);
    if (!existingFiles.has(uri)) throw new Error('missing');
    return { sha256: fakeBlobHash, byteSize: 1 };
  },
}));
const {
  ProductionSnapshotJournalStore,
  ProductionSnapshotMediaStore,
  clearMediaHashes,
  forgetMediaHashes,
  verifyLocalMediaFile,
} = await import('../../src/lib/cloudSync/snapshot/storage/productionJournal');
afterAll(() => sqlite.close());

test('the profile cache shows a restored photo only once it is downloaded', async () => {
  const reloads: { profileImageUri: string | null }[] = [];
  // A local profile write lands during the first read: that read is dropped
  // and the loader reads again.
  let drops = 1;
  let attempts = 0;
  mock.module('../../src/lib/settings/store', () => ({
    applyProfileCacheReload: (
      _revision: number,
      profile: { profileImageUri: string | null },
    ) => {
      attempts++;
      if (drops > 0) {
        drops--;
        return false;
      }
      reloads.push(profile);
      return true;
    },
    getProfileCacheRevision: () => 0,
    hydrateProfileCache() {},
    markLegacyProfileMigrationComplete() {},
  }));
  const { loadProfileCache } = await import('../../src/lib/cloudSync/storage/backfill');
  sqlite.exec('DELETE FROM user_profile; DELETE FROM media_assets');
  db.insert(schema.mediaAssets)
    .values({
      asset_id: 'avatar',
      owner_type: 'profile',
      owner_id: 'self',
      kind: 'photo',
      local_uri: 'photos/avatar.jpg',
      download_state: 'pending',
      blob_hash: fakeBlobHash,
      byte_size: 1,
      created_at: 1,
      updated_at: 1,
    })
    .run();
  sqlite.exec(
    "INSERT INTO user_profile (profile_id, display_name, photo_asset_id, updated_at) VALUES ('self', 'Restored', 'avatar', 1)",
  );
  expect(await loadProfileCache()).toBe(true);
  sqlite.exec("UPDATE media_assets SET download_state = 'verified'");
  expect(await loadProfileCache()).toBe(true);
  expect(reloads.map((profile) => profile.profileImageUri)).toEqual([
    null,
    'photos/avatar.jpg',
  ]);
  expect(attempts).toBe(3);
  // Local writes during every read: the loader gives up and says so.
  drops = 3;
  expect(await loadProfileCache()).toBe(false);
  expect(attempts).toBe(6);
  sqlite.exec('DELETE FROM user_profile; DELETE FROM media_assets');
});

test('profile updatedAt stays 0 until a synced field is authored', async () => {
  sqlite.exec('DELETE FROM media_assets; DELETE FROM user_profile');
  const { runExclusiveDbTransaction } = await import('../../src/db');
  const { updateProfileInTransaction } =
    await import('../../src/lib/cloudSync/storage/repositories');
  type Args = Parameters<typeof updateProfileInTransaction>;
  const write = (update: Args[1], context: Args[2]) =>
    runExclusiveDbTransaction((tx) => updateProfileInTransaction(tx, update, context));
  const profileUpdatedAt = () => db.select().from(schema.userProfile).get()?.updated_at;

  // An empty legacy backfill and a skipped onboarding name leave it at 0.
  await write({ displayName: null, photoUri: null }, { origin: 'migration', now: 10 });
  await write({ displayName: null }, { now: 11 });
  expect(profileUpdatedAt()).toBe(0);

  await write({ displayName: 'Mehra' }, { now: 13 });
  expect(profileUpdatedAt()).toBe(13);
  await write({ displayName: null }, { now: 14 });
  expect(profileUpdatedAt()).toBe(14);
  await write({ displayName: null }, { now: 15 });
  expect(profileUpdatedAt()).toBe(14);
});

/** A photo descriptor as the v2 apply hands it to `applyFiles().materialize`. */
const photoDescriptor = (assetId: string, blobHash = fakeBlobHash) => ({
  assetId,
  ownerType: 'profile' as const,
  ownerId: 'profile',
  kind: 'profile-photo' as const,
  blobHash,
  mimeType: 'image/jpeg',
  byteSize: 1,
  width: null,
  height: null,
  durationMs: null,
  createdAt: 1,
  ext: {},
});

/** A profile photo `old-photo` at file:///old.jpg, and the apply files over it. */
function setupPhotoSwitch() {
  sqlite.exec(
    'DELETE FROM entries; DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM sync_retained_media',
  );
  existingFiles.clear();
  existingFiles.add('file:///old.jpg');
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
  return new ProductionSnapshotJournalStore(
    'vault',
    new ProductionSnapshotMediaStore(),
  ).applyFiles();
}

/**
 * Runs an apply's file work the way `applySyncState` does: materialize, then
 * `commit` (a transaction), and discard the copies unless it committed.
 * `beforeCommit` runs between the two, while the apply holds the media lock.
 */
function applyMedia(
  files: ReturnType<typeof setupPhotoSwitch>,
  media: ReturnType<typeof photoDescriptor>[],
  {
    beforeCommit,
    commit,
  }: {
    beforeCommit?: () => Promise<void> | void;
    commit: (uris: Map<string, { uri: string; verified: boolean }>) => boolean;
  },
) {
  return files.serialize(async () => {
    const created: string[] = [];
    let applied = false;
    try {
      const uris = await files.materialize(media, created);
      await beforeCommit?.();
      applied = commit(uris);
      return applied;
    } finally {
      if (!applied) await files.discard(created);
    }
  });
}

test('a same-blob photo ID switch copies the local file instead of downloading', async () => {
  const files = setupPhotoSwitch();
  const uris = await files.materialize([photoDescriptor('photo-a')], []);
  expect(uris.get('photo-a')).toEqual({
    uri: expect.stringContaining(fakeBlobHash),
    verified: true,
  });
  expect(copiedMedia.at(-1)).toEqual({
    from: 'file:///old.jpg',
    to: expect.stringContaining(fakeBlobHash),
  });
  // A blob held nowhere on this device waits for a download.
  expect(await files.materialize([photoDescriptor('other', 'b'.repeat(64))], [])).toEqual(
    new Map([
      ['other', { uri: expect.stringContaining('b'.repeat(64)), verified: false }],
    ]),
  );
});

test('a rejected apply removes the photo it copied unless a committed row uses it', async () => {
  const files = setupPhotoSwitch();
  const media = [photoDescriptor('photo-new')];
  expect(await applyMedia(files, media, { commit: () => false })).toBe(false);
  const copied = copiedMedia.at(-1)!.to;
  expect(copied).toContain(fakeBlobHash);
  expect(existingFiles.has(copied)).toBe(false);
  expect(existingFiles.has('file:///old.jpg')).toBe(true);

  // Another apply committed a row for the same file before this one gave up.
  const rejected = applyMedia(files, media, {
    beforeCommit: () => {
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
    },
    commit: () => false,
  });
  expect(await rejected).toBe(false);
  expect(existingFiles.has(copied)).toBe(true);
});

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
    const files = setupPhotoSwitch();
    let absolute = '';
    const rejected = applyMedia(files, [photoDescriptor('new-photo')], {
      beforeCommit: () => {
        absolute = copiedMedia.at(-1)!.to;
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
      },
      commit: () => false,
    });
    expect(await rejected).toBe(false);
    expect(existingFiles.has(absolute)).toBe(true);
  },
);

test('a rejected apply still removes its copy when only a bare path to another file shares its name', async () => {
  const files = setupPhotoSwitch();
  let absolute = '';
  const rejected = applyMedia(files, [photoDescriptor('new-photo')], {
    beforeCommit: () => {
      absolute = copiedMedia.at(-1)!.to;
      const name = absolute.slice(absolute.lastIndexOf('/') + 1);
      db.insert(schema.entries)
        .values({
          note_id: 'other-entry',
          assets: [{ type: AssetType.IMAGE, uri: `/elsewhere/${name}` }],
          created_at: 1,
          updated_at: 1,
        })
        .run();
    },
    commit: () => false,
  });
  expect(await rejected).toBe(false);
  expect(existingFiles.has(absolute)).toBe(false);
});

test('a concurrent apply waits for a rejected apply and its cleanup', async () => {
  const files = setupPhotoSwitch();
  const media = [photoDescriptor('new-photo')];
  const { promise: loserReady, resolve: loserMaterialized } =
    Promise.withResolvers<void>();
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  const rejected = applyMedia(files, media, {
    beforeCommit: async () => {
      loserMaterialized();
      await released;
    },
    commit: () => false,
  });
  await loserReady;
  const destination = copiedMedia.at(-1)!.to;
  let winnerMaterialized = false;
  const committed = applyMedia(files, media, {
    beforeCommit: () => {
      winnerMaterialized = true;
    },
    commit: (uris) => {
      db.insert(schema.mediaAssets)
        .values({
          asset_id: 'new-photo',
          owner_type: 'profile',
          owner_id: 'self',
          kind: 'profile-photo',
          local_uri: uris.get('new-photo')!.uri,
          download_state: uris.get('new-photo')!.verified ? 'verified' : 'pending',
          blob_hash: fakeBlobHash,
          byte_size: 1,
          created_at: 1,
          updated_at: 1,
        })
        .run();
      return true;
    },
  });
  await Bun.sleep(10);
  // The second apply cannot reuse the first apply's uncommitted copy.
  expect(winnerMaterialized).toBe(false);
  release();
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

/** Media rows as an apply leaves them before hydration: text first, files pending. */
function insertPendingMedia(
  rows: { assetId: string; ownerType: 'entry' | 'profile'; uri: string }[],
) {
  db.insert(schema.mediaAssets)
    .values(
      rows.map(({ assetId, ownerType, uri }) => ({
        asset_id: assetId,
        owner_type: ownerType,
        owner_id: ownerType === 'profile' ? 'self' : 'entry',
        kind: ownerType === 'profile' ? ('profile-photo' as const) : ('photo' as const),
        local_uri: uri,
        download_state: 'pending' as const,
        mime_type: 'image/jpeg',
        blob_hash: fakeBlobHash,
        byte_size: 1,
        created_at: 1,
        updated_at: 1,
      })),
    )
    .run();
}

function stagingMediaStore() {
  // Nothing is staged or local until the provider delivers the blob.
  const staging = { staged: false };
  const store = new ProductionSnapshotJournalStore('text-first', {
    stagedFile: () => (staging.staged ? { uri: 'file:///staged.jpg' } : null),
    verifiedLocalFile: async () => null,
    openDownloadSink: async () => ({}),
    deleteStaged: () => {
      staging.staged = false;
    },
  } as never);
  return { store, staging };
}

test('hydration downloads a pending photo to the path its entry uses', async () => {
  sqlite.exec('DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM media_assets');
  existingFiles.clear();
  const photoUri = `photos/${'e'.repeat(64)}-${fakeBlobHash}.jpg`;
  insertPendingMedia([{ assetId: 'photo', ownerType: 'entry', uri: photoUri }]);
  const { store, staging } = stagingMediaStore();

  const downloaded: string[] = [];
  expect(
    await store.hydratePendingMedia(
      {
        downloadMedia: async (_vaultId: string, blobHash: string) => {
          downloaded.push(blobHash);
          staging.staged = true;
          return true;
        },
      } as never,
      2,
    ),
  ).toEqual({ hydrated: 1, missing: 0, unavailable: 0, profilePhoto: false });
  expect(downloaded).toEqual([fakeBlobHash]);
  const [hydrated] = db.select().from(schema.mediaAssets).all();
  expect(hydrated).toMatchObject({ download_state: 'verified', local_uri: photoUri });
  expect(copiedMedia.at(-1)).toEqual({
    from: 'file:///staged.jpg',
    to: expect.stringContaining(photoUri),
  });
  // The staged download is gone once nothing waits for it.
  expect(staging.staged).toBe(false);
});

test('hydration downloads several files at once, but one blob only once at a time', async () => {
  sqlite.exec('DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM media_assets');
  existingFiles.clear();
  const hashes = ['1', '2', '3', '4', '5', '1'].map((c) => c.repeat(64));
  db.insert(schema.mediaAssets)
    .values(
      hashes.map((hash, index) => ({
        asset_id: `asset-${index}`,
        owner_type: 'entry' as const,
        owner_id: 'entry',
        kind: 'photo' as const,
        local_uri: `photos/${index}.jpg`,
        download_state: 'pending' as const,
        blob_hash: hash,
        byte_size: 1,
        created_at: 1,
        updated_at: 1,
      })),
    )
    .run();
  const { store } = stagingMediaStore();
  let inFlight = 0;
  let most = 0;
  const active = new Set<string>();
  const download = {
    downloadMedia: async (_vaultId: string, blobHash: string) => {
      // Rows that share a blob share its staged download.
      expect(active.has(blobHash)).toBe(false);
      active.add(blobHash);
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      active.delete(blobHash);
      // Not on the provider: no file work, only the row's state.
      return false;
    },
  } as never;
  expect(await store.hydratePendingMedia(download, 10, undefined, 3)).toEqual({
    hydrated: 0,
    missing: 0,
    unavailable: 6,
    profilePhoto: false,
  });
  expect(most).toBe(3);
});

test('rows that share a blob download it once', async () => {
  sqlite.exec('DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM media_assets');
  existingFiles.clear();
  insertPendingMedia([
    { assetId: 'first', ownerType: 'entry', uri: `photos/first-${fakeBlobHash}.jpg` },
    { assetId: 'second', ownerType: 'entry', uri: `photos/second-${fakeBlobHash}.jpg` },
  ]);
  const { store, staging } = stagingMediaStore();
  let downloads = 0;
  const download = {
    downloadMedia: async () => {
      downloads += 1;
      staging.staged = true;
      return true;
    },
  } as never;
  expect(await store.hydratePendingMedia(download, 10, undefined, 4)).toMatchObject({
    hydrated: 2,
  });
  expect(downloads).toBe(1);
  expect(
    db
      .select()
      .from(schema.mediaAssets)
      .all()
      .map((row) => row.download_state),
  ).toEqual(['verified', 'verified']);
  expect(staging.staged).toBe(false);
});

test('a failed download reports only after the others finish', async () => {
  sqlite.exec('DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM media_assets');
  existingFiles.clear();
  db.insert(schema.mediaAssets)
    .values(
      ['1', '2', '3'].map((c, index) => ({
        asset_id: `asset-${index}`,
        owner_type: 'entry' as const,
        owner_id: 'entry',
        kind: 'photo' as const,
        local_uri: `photos/${index}.jpg`,
        download_state: 'pending' as const,
        blob_hash: c.repeat(64),
        byte_size: 1,
        created_at: 1,
        updated_at: 1,
      })),
    )
    .run();
  const { store } = stagingMediaStore();
  let settledAfterFailure = 0;
  let failed = false;
  const download = {
    downloadMedia: async (_vaultId: string, blobHash: string) => {
      if (blobHash === '1'.repeat(64)) {
        failed = true;
        throw new Error('connection lost');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (failed) settledAfterFailure += 1;
      return false;
    },
  } as never;
  await expect(store.hydratePendingMedia(download, 10, undefined, 3)).rejects.toThrow(
    'connection lost',
  );
  // The others were already running; they finished and wrote before the
  // error came back, and nothing is left to write after it.
  expect(settledAfterFailure).toBe(2);
  const states = db
    .select()
    .from(schema.mediaAssets)
    .all()
    .map((row) => row.download_state);
  expect(states.sort()).toEqual(['missing', 'missing', 'pending']);
});

test('hydration reports when it downloaded the profile photo', async () => {
  sqlite.exec('DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM media_assets');
  existingFiles.clear();
  insertPendingMedia([
    { assetId: 'avatar', ownerType: 'profile', uri: `photos/avatar-${fakeBlobHash}.jpg` },
  ]);
  const { store, staging } = stagingMediaStore();
  const download = {
    downloadMedia: async () => {
      staging.staged = true;
      return true;
    },
  } as never;
  expect(await store.hydratePendingMedia(download, 2)).toEqual({
    hydrated: 1,
    missing: 0,
    unavailable: 0,
    profilePhoto: true,
  });
  // Nothing left: no profile photo in an empty batch.
  expect(await store.hydratePendingMedia(download, 2)).toEqual({
    hydrated: 0,
    missing: 0,
    unavailable: 0,
    profilePhoto: false,
  });
});

test('a file the backup no longer has is unavailable, not missing, and is looked for again', async () => {
  sqlite.exec('DELETE FROM entries; DELETE FROM entry_tags; DELETE FROM media_assets');
  existingFiles.clear();
  insertPendingMedia([
    { assetId: 'gone', ownerType: 'entry', uri: `photos/gone-${fakeBlobHash}.jpg` },
  ]);
  // A row without a hash cannot be downloaded at all: that still counts as missing.
  db.insert(schema.mediaAssets)
    .values({
      asset_id: 'unhashed',
      owner_type: 'entry',
      owner_id: 'entry',
      kind: 'photo',
      local_uri: 'photos/unhashed.jpg',
      download_state: 'pending',
      mime_type: 'image/jpeg',
      blob_hash: null,
      byte_size: null,
      created_at: 1,
      updated_at: 1,
    })
    .run();
  const { store } = stagingMediaStore();
  const absent = { downloadMedia: async () => false } as never;
  expect(await store.hydratePendingMedia(absent, 2)).toEqual({
    hydrated: 0,
    missing: 1,
    unavailable: 1,
    profilePhoto: false,
  });
  const states = () =>
    Object.fromEntries(
      db
        .select()
        .from(schema.mediaAssets)
        .all()
        .map((row) => [row.asset_id, row.download_state]),
    );
  expect(states()).toEqual({ gone: 'missing', unhashed: 'pending' });
  // Not looked for again within the pass.
  sqlite.exec("DELETE FROM media_assets WHERE asset_id = 'unhashed'");
  expect(await store.hydratePendingMedia(absent, 2)).toMatchObject({ unavailable: 0 });
  // A local file that went missing (no hash) stays missing; this one is pending again.
  sqlite.exec(
    "INSERT INTO media_assets (asset_id, owner_type, owner_id, kind, local_uri, download_state, created_at, updated_at) VALUES ('lost-local', 'entry', 'entry', 'photo', 'photos/lost.jpg', 'missing', 1, 1)",
  );
  await store.requeueUnavailableMedia();
  expect(states()).toEqual({ gone: 'pending', 'lost-local': 'missing' });
  // A file that is there but whose bytes fail their check still counts as missing.
  const { MediaIntegrityError } =
    await import('../../src/lib/cloudSync/snapshot/sync/types');
  const corrupt = {
    downloadMedia: async () => {
      throw new MediaIntegrityError('downloaded-media-hash-mismatch');
    },
  } as never;
  expect(await store.hydratePendingMedia(corrupt, 2)).toEqual({
    hydrated: 0,
    missing: 1,
    unavailable: 0,
    profilePhoto: false,
  });
  expect(states()).toEqual({ gone: 'missing', 'lost-local': 'missing' });
});

test('downloaded attachments whose file vanished are queued for download again', async () => {
  sqlite.exec('DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM entries');
  existingFiles.clear();
  unreadableFiles.clear();
  existingFiles.add('file:///documents/photos/kept.jpg');
  existingFiles.add('file:///documents/voice_memos/kept.m4a');
  unreadableFiles.add('file:///documents/photos/unreadable.jpg');
  const row = (
    assetId: string,
    localUri: string,
    downloadState: 'verified' | 'n/a',
    kind: 'photo' | 'voice' = 'photo',
  ) => ({
    asset_id: assetId,
    owner_type: 'entry' as const,
    owner_id: 'entry',
    kind,
    local_uri: localUri,
    download_state: downloadState,
    blob_hash: fakeBlobHash,
    byte_size: 1,
    created_at: 1,
    updated_at: 1,
  });
  db.insert(schema.mediaAssets)
    .values([
      row('kept', 'photos/kept.jpg', 'verified'),
      row('kept-voice', 'voice_memos/kept.m4a', 'verified', 'voice'),
      row('vanished', 'photos/vanished.jpg', 'verified'),
      row('vanished-voice', 'voice_memos/vanished.m4a', 'verified', 'voice'),
      // Hydration cannot write these paths back, so they are left as they are.
      row('absolute', '/abs/photos/absolute.jpg', 'verified'),
      row('scheme', 'file:///abs/photos/scheme.jpg', 'verified'),
      row('wrong-folder', 'voice_memos/photo.jpg', 'verified'),
      row('nested', 'photos/nested/photo.jpg', 'verified'),
      // Created on this device: it may not be in the backup, so it is never
      // queued for download; the upload path reports it instead.
      row('local', 'photos/local.jpg', 'n/a'),
      // The existence check itself fails: leave the row alone.
      row('unreadable', 'photos/unreadable.jpg', 'verified'),
    ])
    .run();
  const store = new ProductionSnapshotJournalStore('requeue', {} as never);

  expect(await store.requeueMissingVerifiedMedia()).toBe(2);
  const states = Object.fromEntries(
    db
      .select()
      .from(schema.mediaAssets)
      .all()
      .map((asset) => [asset.asset_id, asset.download_state]),
  );
  expect(states).toEqual({
    kept: 'verified',
    'kept-voice': 'verified',
    vanished: 'pending',
    'vanished-voice': 'pending',
    absolute: 'verified',
    scheme: 'verified',
    'wrong-folder': 'verified',
    nested: 'verified',
    local: 'n/a',
    unreadable: 'verified',
  });
  // Nothing new to queue on a second look.
  expect(await store.requeueMissingVerifiedMedia()).toBe(0);
  unreadableFiles.clear();
});

test('a repaired attachment is downloaded back to the path its entry uses', async () => {
  sqlite.exec(
    'DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM entries; DELETE FROM cloud_sync_state',
  );
  existingFiles.clear();
  db.insert(schema.cloudSyncState)
    .values({ vault_id: 'repair', device_id: 'device', updated_at: 1 })
    .run();
  // A legacy attachment, without an asset ID, at a path the app no longer uses.
  db.insert(schema.entries)
    .values({
      note_id: 'entry',
      text_content: 'Text',
      assets: [
        { type: AssetType.IMAGE, uri: 'photos/other.jpg', assetId: 'other' },
        { type: AssetType.IMAGE, uri: 'photos/original.jpg' },
      ],
      created_at: 1,
      updated_at: 1,
    })
    .run();
  existingFiles.add('file:///documents/photos/other.jpg');
  const media = (assetId: string, localUri: string) => ({
    asset_id: assetId,
    owner_type: 'entry' as const,
    owner_id: 'entry',
    kind: 'photo' as const,
    local_uri: localUri,
    download_state: 'verified' as const,
    blob_hash: assetId === 'other' ? 'b'.repeat(64) : fakeBlobHash,
    byte_size: 1,
    created_at: 1,
    updated_at: 1,
  });
  db.insert(schema.mediaAssets)
    .values([
      media('other', 'photos/other.jpg'),
      media('original', 'photos/original.jpg'),
    ])
    .run();
  let staged = false;
  const store = new ProductionSnapshotJournalStore('repair', {
    stagedFile: () => (staged ? { uri: 'file:///staged.jpg' } : null),
    verifiedLocalFile: async () => null,
    openDownloadSink: async () => ({}),
    deleteStaged: () => {
      staged = false;
    },
  } as never);
  expect(await store.requeueMissingVerifiedMedia()).toBe(1);
  expect(
    await store.hydratePendingMedia(
      {
        downloadMedia: async () => {
          staged = true;
          return true;
        },
      } as never,
      2,
    ),
  ).toEqual({ hydrated: 1, missing: 0, unavailable: 0, profilePhoto: false });

  const repaired = db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.asset_id, 'original'))
    .all()[0];
  expect(repaired).toMatchObject({
    download_state: 'verified',
    local_uri: 'photos/original.jpg',
  });
  expect(existingFiles.has('file:///documents/photos/original.jpg')).toBe(true);
  // The entry's list, which screens and an open editor read, is untouched.
  const [entryRow] = db.select().from(schema.entries).all();
  expect(entryRow.assets!.map((asset) => asset.uri)).toEqual([
    'photos/other.jpg',
    'photos/original.jpg',
  ]);
});

describe('saved media hashes', () => {
  const store = () => new ProductionSnapshotJournalStore('hashes', {} as never);
  const fileUri = (path: string) => `${paths.document}/${path}`;
  const verify = (path: string) => verifyLocalMediaFile(path, fakeBlobHash, 1);
  const savedRows = () =>
    db
      .select()
      .from(schema.cloudSyncMediaHashCache)
      .all()
      .sort((left, right) => left.path.localeCompare(right.path));
  /** A new process: memory is empty and the table is read again. */
  const restart = () => forgetMediaHashes();

  function addPhoto(assetId: string, path: string) {
    db.insert(schema.mediaAssets)
      .values({
        asset_id: assetId,
        owner_type: 'entry',
        owner_id: 'entry',
        kind: 'photo',
        local_uri: path,
        download_state: 'verified',
        blob_hash: fakeBlobHash,
        byte_size: 1,
        created_at: 1,
        updated_at: 1,
      })
      .run();
    existingFiles.add(fileUri(path));
    fileStats.set(fileUri(path), { size: 1, lastModified: 1_000 });
  }

  function saveRow(path: string, values: { hashedAt?: number; version?: number } = {}) {
    db.insert(schema.cloudSyncMediaHashCache)
      .values({
        path,
        size: 1,
        modified_at: 1_000,
        sha256: fakeBlobHash,
        hashed_at: values.hashedAt ?? Date.now(),
        format_version: values.version ?? 1,
      })
      .run();
  }

  beforeEach(() => {
    sqlite.exec(
      'DELETE FROM media_assets; DELETE FROM sync_retained_media; DELETE FROM cloud_sync_media_hash_cache',
    );
    paths.document = 'file:///documents';
    existingFiles.clear();
    fileStats.clear();
    hashReads.length = 0;
    restart();
  });

  test('a saved hash is used after a restart, under a moved document directory', async () => {
    addPhoto('photo', 'photos/a.jpg');
    // A legacy absolute URI and the relative path are one file and one row.
    expect(await verify(fileUri('photos/a.jpg'))).toBe(true);
    await store().persistMediaHashes();
    expect(savedRows()).toEqual([
      {
        path: 'photos/a.jpg',
        size: 1,
        modified_at: 1_000,
        sha256: fakeBlobHash,
        hashed_at: expect.any(Number),
        format_version: 1,
      },
    ]);

    restart();
    expect(await verify('photos/a.jpg')).toBe(true);
    expect(hashReads).toHaveLength(1);

    // An iOS update or restore can move the app container.
    paths.document = 'file:///moved';
    restart();
    existingFiles.add(fileUri('photos/a.jpg'));
    fileStats.set(fileUri('photos/a.jpg'), { size: 1, lastModified: 1_000 });
    expect(await verify('photos/a.jpg')).toBe(true);
    expect(hashReads).toHaveLength(1);
  });

  test.each([
    ['size', { size: 2, lastModified: 1_000 }],
    ['modification time', { size: 1, lastModified: 2_000 }],
  ])('a new %s re-reads the file and replaces its row', async (_, stamp) => {
    addPhoto('photo', 'photos/a.jpg');
    saveRow('photos/a.jpg');
    fileStats.set(fileUri('photos/a.jpg'), stamp);
    expect(await verify('photos/a.jpg')).toBe(true);
    expect(hashReads).toEqual([fileUri('photos/a.jpg')]);
    await store().persistMediaHashes();
    // The fake hasher reads one byte, so a two-byte stamp is not cached.
    expect(savedRows().map((row) => row.modified_at)).toEqual(
      stamp.size === 1 ? [2_000] : [],
    );
  });

  test('mightHold: blobs with a local copy, not ones still waiting for their download', async () => {
    const hash = (c: string) => c.repeat(64);
    const row = (
      assetId: string,
      blob: string,
      state: 'n/a' | 'verified' | 'pending' | 'downloading' | 'missing',
      path: string | null,
    ) =>
      db
        .insert(schema.mediaAssets)
        .values({
          asset_id: assetId,
          owner_type: 'entry',
          owner_id: 'entry',
          kind: 'photo',
          local_uri: path,
          download_state: state,
          blob_hash: blob,
          byte_size: 1,
          created_at: 1,
          updated_at: 1,
        })
        .run();
    row('authored', hash('1'), 'n/a', 'photos/1.jpg');
    row('downloaded', hash('2'), 'verified', 'photos/2.jpg');
    row('waiting', hash('3'), 'pending', 'photos/3.jpg');
    row('staged', hash('4'), 'pending', 'photos/4.jpg');
    existingFiles.add(fileUri(`cloud-sync-media/${hash('4')}.bin`));
    row('file-there', hash('5'), 'missing', 'photos/5.jpg');
    existingFiles.add(fileUri('photos/5.jpg'));
    row('no-path', hash('6'), 'pending', null);
    db.insert(schema.syncRetainedMedia)
      .values({
        ledger_id: 'retained',
        asset_id: 'removed',
        original_owner_type: 'entry',
        original_owner_id: 'entry',
        original_uri: 'photos/7.jpg',
        kind: 'photo',
        blob_hash: hash('7'),
        state: 'staged',
        created_at: 1,
        updated_at: 1,
      })
      .run();
    // A staged file with no row at all, and a row still downloading.
    existingFiles.add(fileUri(`cloud-sync-media/${hash('9')}.bin`));
    row('downloading', hash('a'), 'downloading', 'file:///var/legacy/a.jpg');
    existingFiles.add('file:///var/legacy/a.jpg');
    const asked = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'a'].map(hash);
    expect(
      [...(await new ProductionSnapshotMediaStore().mightHold(asked))].sort(),
    ).toEqual(['1', '2', '4', '5', '7', '9', 'a'].map(hash));
  });

  test('upload sources and a missing file ignore saved rows; the missing one loses its row', async () => {
    addPhoto('photo', 'photos/a.jpg');
    saveRow('photos/a.jpg');
    await new ProductionSnapshotMediaStore().openVerifiedSource(fakeBlobHash);
    expect(hashReads).toEqual([fileUri('photos/a.jpg')]);

    existingFiles.delete(fileUri('photos/a.jpg'));
    expect(await verify('photos/a.jpg')).toBe(false);
    await store().persistMediaHashes();
    expect(savedRows()).toEqual([]);
  });

  test('rows for files no media row references are removed', async () => {
    addPhoto('kept', 'photos/kept.jpg');
    addPhoto('removed', 'photos/removed.jpg');
    // A row an earlier launch left for an attachment deleted since.
    saveRow('photos/gone.jpg');
    expect(await verify('photos/kept.jpg')).toBe(true);
    expect(await verify('photos/removed.jpg')).toBe(true);
    await store().persistMediaHashes();
    expect(savedRows().map((row) => row.path)).toEqual([
      'photos/kept.jpg',
      'photos/removed.jpg',
    ]);

    db.delete(schema.mediaAssets).where(eq(schema.mediaAssets.asset_id, 'removed')).run();
    // Pruning runs with the next save of a change.
    existingFiles.delete(fileUri('photos/removed.jpg'));
    expect(await verify('photos/removed.jpg')).toBe(false);
    await store().persistMediaHashes();
    expect(savedRows().map((row) => row.path)).toEqual(['photos/kept.jpg']);
  });

  test('an unreadable table falls back to hashing', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    addPhoto('photo', 'photos/a.jpg');
    saveRow('photos/a.jpg');
    sqlite.exec('ALTER TABLE cloud_sync_media_hash_cache RENAME TO hash_cache_away');
    try {
      expect(await verify('photos/a.jpg')).toBe(true);
      expect(await verify('photos/a.jpg')).toBe(true);
      // Hashed once, then served from memory; saving fails quietly.
      expect(hashReads).toHaveLength(1);
      await expect(store().persistMediaHashes()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      sqlite.exec('ALTER TABLE hash_cache_away RENAME TO cloud_sync_media_hash_cache');
      warn.mockRestore();
    }
  });

  test('a file that goes missing while the table is unreadable still loses its row', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    addPhoto('photo', 'photos/a.jpg');
    saveRow('photos/a.jpg');
    sqlite.exec('ALTER TABLE cloud_sync_media_hash_cache RENAME TO hash_cache_away');
    try {
      existingFiles.delete(fileUri('photos/a.jpg'));
      expect(await verify('photos/a.jpg')).toBe(false);
    } finally {
      sqlite.exec('ALTER TABLE hash_cache_away RENAME TO cloud_sync_media_hash_cache');
      warn.mockRestore();
    }
    await store().persistMediaHashes();
    expect(savedRows()).toEqual([]);
  });

  test('a failed load is retried at the end of the pass', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    addPhoto('photo', 'photos/a.jpg');
    saveRow('photos/a.jpg');
    sqlite.exec('ALTER TABLE cloud_sync_media_hash_cache RENAME TO hash_cache_away');
    try {
      expect(await verify('photos/a.jpg')).toBe(true);
    } finally {
      sqlite.exec('ALTER TABLE hash_cache_away RENAME TO cloud_sync_media_hash_cache');
      warn.mockRestore();
    }
    await store().persistMediaHashes();
    // Loaded now: a missing staging copy no longer makes a pass write.
    expect(await new ProductionSnapshotMediaStore().hasVerified(fakeBlobHash)).toBe(
      false,
    );
    const writes = spyOn(sqlite, 'exec');
    try {
      await store().persistMediaHashes();
      expect(writes).not.toHaveBeenCalledWith('BEGIN IMMEDIATE');
    } finally {
      writes.mockRestore();
    }
  });

  test('Delete all empties the table and the memory', async () => {
    addPhoto('photo', 'photos/a.jpg');
    expect(await verify('photos/a.jpg')).toBe(true);
    await store().persistMediaHashes();
    await clearMediaHashes(db as never);
    forgetMediaHashes();
    expect(savedRows()).toEqual([]);
    expect(await verify('photos/a.jpg')).toBe(true);
    expect(hashReads).toHaveLength(2);
  });

  test('a rolled-back Delete all keeps reads the table does not hold yet', async () => {
    addPhoto('photo', 'photos/a.jpg');
    saveRow('photos/a.jpg', { hashedAt: 1 });
    // A newer read replaces the saved row in memory only.
    fileStats.set(fileUri('photos/a.jpg'), { size: 1, lastModified: 2_000 });
    expect(await verify('photos/a.jpg')).toBe(true);
    sqlite.exec('BEGIN IMMEDIATE');
    await clearMediaHashes(db as never);
    sqlite.exec('ROLLBACK');
    expect(savedRows().map((row) => row.modified_at)).toEqual([1_000]);
    expect(await verify('photos/a.jpg')).toBe(true);
    expect(hashReads).toHaveLength(1);
    await store().persistMediaHashes();
    expect(savedRows().map((row) => row.modified_at)).toEqual([2_000]);
  });

  test('a missing staging copy alone does not make a pass write', async () => {
    addPhoto('photo', 'photos/a.jpg');
    expect(await new ProductionSnapshotMediaStore().hasVerified(fakeBlobHash)).toBe(
      false,
    );
    await store().persistMediaHashes();
    const writes = spyOn(sqlite, 'exec');
    try {
      expect(await new ProductionSnapshotMediaStore().hasVerified(fakeBlobHash)).toBe(
        false,
      );
      await store().persistMediaHashes();
      // No transaction began: nothing changed since the last save.
      expect(writes).not.toHaveBeenCalledWith('BEGIN IMMEDIATE');
    } finally {
      writes.mockRestore();
    }
    expect(hashReads).toHaveLength(1);
  });

  test('rows from another format version are deleted unread', async () => {
    addPhoto('photo', 'photos/a.jpg');
    saveRow('photos/a.jpg', { version: 0 });
    expect(await verify('photos/a.jpg')).toBe(true);
    expect(hashReads).toHaveLength(1);
    expect(savedRows()).toEqual([]);
    await store().persistMediaHashes();
    expect(savedRows().map((row) => row.format_version)).toEqual([1]);
  });

  test('hashes saved over 30 days ago are read again, a few per pass', async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const files = Array.from({ length: 5 }, (_, index) => `photos/${index}.jpg`);
    for (const [index, path] of files.entries()) {
      addPhoto(`photo-${index}`, path);
      saveRow(path, { hashedAt: old });
    }
    for (const path of files) expect(await verify(path)).toBe(true);
    expect(hashReads).toHaveLength(4);
    await store().persistMediaHashes();
    for (const path of files) expect(await verify(path)).toBe(true);
    expect(hashReads).toHaveLength(5);
    await store().persistMediaHashes();
    expect(savedRows().every((row) => row.hashed_at > old)).toBe(true);
  });
});

/**
 * This device and another each set a profile photo: the shown photo and the
 * other version, each with its media row.
 */
function setupPhotoVersions() {
  sqlite.exec(
    'DELETE FROM entries; DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM sync_field_values',
  );
  existingFiles.clear();
  unreadableFiles.clear();
  db.insert(schema.mediaAssets)
    .values(
      [
        ['local-photo', 'a'],
        ['remote-photo', 'b'],
      ].map(([assetId, hash]) => ({
        asset_id: assetId,
        owner_type: 'profile' as const,
        owner_id: 'self',
        kind: 'profile-photo' as const,
        local_uri: `${paths.document}/photos/${assetId}.jpg`,
        download_state: 'verified' as const,
        blob_hash: hash.repeat(64),
        byte_size: 1,
        created_at: 1,
        updated_at: 1,
      })),
    )
    .run();
  for (const assetId of ['local-photo', 'remote-photo'])
    existingFiles.add(`${paths.document}/photos/${assetId}.jpg`);
  db.insert(schema.userProfile)
    .values({ profile_id: 'self', photo_asset_id: 'remote-photo', updated_at: 20 })
    .run();
  db.insert(schema.syncFieldValues)
    .values({
      entity_type: 'profile',
      entity_id: 'profile',
      field: 'photo',
      stamp_hlc: 1,
      stamp_device: 'device-x',
      value_json: JSON.stringify('local-photo'),
    })
    .run();
  const photoRows = () =>
    db
      .select({ id: schema.mediaAssets.asset_id })
      .from(schema.mediaAssets)
      .all()
      .map(({ id }) => id)
      .sort();
  expect(photoRows()).toEqual(['local-photo', 'remote-photo']);
  return { photoRows };
}

test('Delete journal everywhere leaves no profile photos for the next backup (#178)', async () => {
  const { wipeLocalJournalInTransaction } =
    await import('../../src/lib/cloudSync/storage/localWipe');
  const { photoRows } = setupPhotoVersions();

  const { runExclusiveDbTransaction } = await import('../../src/db');
  db.insert(schema.cloudSyncMediaHashCache)
    .values({
      path: 'photos/local-photo.jpg',
      size: 1,
      modified_at: 1,
      sha256: 'a'.repeat(64),
      hashed_at: 1,
      format_version: 1,
    })
    .run();
  const deviceBefore = db.select().from(schema.syncDevice).get()!.device_id;
  await runExclusiveDbTransaction(wipeLocalJournalInTransaction);
  expect(db.select().from(schema.cloudSyncMediaHashCache).all()).toEqual([]);
  // Local state is gone, so the install takes a new device ID.
  const deviceAfter = db.select().from(schema.syncDevice).get()!;
  expect(deviceAfter.device_id).not.toBe(deviceBefore);
  expect(deviceAfter.ctx_json).toBe('{}');
  expect(db.select().from(schema.syncRecords).all()).toEqual([]);
  expect(db.select().from(schema.syncFieldValues).all()).toEqual([]);
  // The next backup publishes no media, so it needs no file.
  expect(photoRows()).toEqual([]);
  expect(db.select().from(schema.userProfile).get()?.photo_asset_id ?? null).toBeNull();
});

test('a backup prunes only unused media rows whose file is confirmed gone', async () => {
  const { pruneMissingUnusedMedia } =
    await import('../../src/lib/cloudSync/snapshot/storage/productionJournal');
  const { photoRows } = setupPhotoVersions();
  const row = (assetId: string, ownerType: 'entry' | 'profile' = 'profile') => ({
    asset_id: assetId,
    owner_type: ownerType,
    owner_id: ownerType === 'profile' ? 'self' : 'entry',
    kind: ownerType === 'profile' ? ('profile-photo' as const) : ('photo' as const),
    local_uri: `${paths.document}/photos/${assetId}.jpg`,
    blob_hash: 'c'.repeat(64),
    byte_size: 1,
    created_at: 1,
    updated_at: 1,
  });
  db.insert(schema.entries)
    .values({ note_id: 'entry', created_at: 1, updated_at: 1 })
    .run();
  db.insert(schema.mediaAssets)
    .values([
      row('unused-missing'),
      { ...row('unused-no-uri'), local_uri: null },
      row('unused-present'),
      row('unused-unreadable'),
      row('entry-missing', 'entry'),
      // Photos are saved with a path relative to the documents directory.
      { ...row('unused-relative'), local_uri: 'photos/unused-relative.jpg' },
      { ...row('used-relative', 'entry'), local_uri: 'photos/used-relative.jpg' },
      // An attachment whose entry is gone is unused.
      { ...row('deleted-entry-missing', 'entry'), owner_id: 'deleted-entry' },
    ])
    .run();
  // Only one unused file is still there. The shown photo and the other
  // version are gone too (one still downloading), but in use.
  existingFiles.clear();
  existingFiles.add(`${paths.document}/photos/unused-present.jpg`);
  unreadableFiles.add(`${paths.document}/photos/unused-unreadable.jpg`);

  expect(await pruneMissingUnusedMedia()).toBe(4);
  expect(photoRows()).toEqual([
    'entry-missing',
    'local-photo',
    'remote-photo',
    'unused-present',
    'unused-unreadable',
    'used-relative',
  ]);
  expect(await pruneMissingUnusedMedia()).toBe(0);

  // Media still in use keeps stopping the backup: no verified copy of its
  // file exists to upload.
  expect(
    await new ProductionSnapshotMediaStore().openVerifiedSource('b'.repeat(64)),
  ).toBeNull();
  sqlite.exec(
    'DELETE FROM entries; DELETE FROM media_assets; DELETE FROM user_profile; DELETE FROM sync_field_values',
  );
  unreadableFiles.clear();
});
