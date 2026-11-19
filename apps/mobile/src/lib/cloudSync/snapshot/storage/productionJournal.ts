import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';

import {
  syncFieldValues,
  cloudSyncMediaHashCache,
  db,
  type DbTransaction,
  entries,
  mediaAssets,
  runExclusiveDbTransaction,
  syncRetainedMedia,
  userProfile,
} from '~/db';
import { sha256Text } from '../sha256';
import { writeBatches } from './writeBatches';
import {
  copyVerifiedMediaFile,
  createMediaPartialFileSink,
  openMediaUploadSource,
} from '../media';
import { inspectLocalMediaFile } from '../../media/streamingHash';
import {
  MediaIntegrityError,
  type SnapshotProvider,
  type SnapshotMediaStore,
} from '../sync/types';
import type { ApplyMediaFiles } from '../../storage/v2State';
import type { MediaDescriptor } from '../../v2/types';

const STAGING_DIRECTORY = 'cloud-sync-media';
const PHOTO_DIRECTORY = 'photos';
const VOICE_DIRECTORY = 'voice_memos';

/** Blob hashes per `IN (...)` query, under SQLite's variable limit. */
const IDS_PER_QUERY = 500;

function fileForLocalUri(uri: string): File {
  return uri.startsWith('file:') || uri.startsWith('/')
    ? new File(uri)
    : new File(Paths.document, uri);
}

function fileExists(uri: string | null): uri is string {
  if (!uri) return false;
  try {
    return fileForLocalUri(uri).exists;
  } catch {
    return false;
  }
}

interface FileStamp {
  key: string;
  size: number;
  lastModified: number;
}

/** Identity and change stamp of a file, or null when either is unavailable. */
function fileStamp(uri: string): FileStamp | null {
  const key = canonicalFileUri(uri);
  if (key === null) return null;
  try {
    const file = new File(key);
    const { size, lastModified } = file;
    if (!file.exists || typeof size !== 'number' || typeof lastModified !== 'number')
      return null;
    return { key, size, lastModified };
  } catch {
    return null;
  }
}

interface InspectedFile extends FileStamp {
  sha256: string;
  hashedAt: number;
}

// Hashes of local media files, valid while a file keeps the size and
// modification time it had when hashed. Sync passes and remote applies check
// every attachment; without this, each pass re-reads the whole library. The
// table `cloud_sync_media_hash_cache` keeps them across launches.
const inspectedFiles = new Map<string, InspectedFile>();
// Changes the table does not hold yet; null removes the row.
const unsavedInspections = new Map<string, InspectedFile | null>();
let persistedHashesLoad: Promise<void> | null = null;
// Whether memory holds every saved row, so a path absent from both maps has none.
let persistedHashesLoaded = false;
let prunedPersistedHashes = false;

// Bump when the hashing or the row key changes: older rows are then deleted.
const MEDIA_HASH_CACHE_VERSION = 1;
// A saved hash cannot notice bytes corrupted without a stamp change, so old
// ones are read again, a few files per pass.
const REHASH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const REHASHES_PER_PASS = 4;
let rehashBudget = REHASHES_PER_PASS;

let documentPrefixValue: string | null = null;

/** The document directory's URI, with a trailing slash. */
function documentPrefix(): string | null {
  if (documentPrefixValue === null) {
    try {
      const uri = new Directory(Paths.document).uri;
      documentPrefixValue = uri.endsWith('/') ? uri : `${uri}/`;
    } catch {
      return null;
    }
  }
  return documentPrefixValue;
}

/**
 * A saved row's key: the path relative to the document directory, since the
 * iOS container path can change after an app update or device restore. Files
 * outside that directory are cached in memory only.
 */
function persistedHashPath(key: string): string | null {
  const prefix = documentPrefix();
  return prefix !== null && key.startsWith(prefix) && key.length > prefix.length
    ? key.slice(prefix.length)
    : null;
}

function rememberHash(key: string, value: InspectedFile): void {
  inspectedFiles.set(key, value);
  unsavedInspections.set(key, value);
}

function forgetHash(key: string): void {
  // Only a path that may have a saved row needs a removal, so a missing
  // staging copy probed on every check does not make each pass write.
  if (inspectedFiles.delete(key) || unsavedInspections.has(key) || !persistedHashesLoaded)
    unsavedInspections.set(key, null);
}

/**
 * Reads saved hashes into memory once per process; a failed read is retried
 * at the end of the next pass. An unreadable table only means files are
 * hashed again.
 */
function loadPersistedHashes(): Promise<void> {
  persistedHashesLoad ??= (async () => {
    const prefix = documentPrefix();
    if (prefix === null) return;
    try {
      await db
        .delete(cloudSyncMediaHashCache)
        .where(ne(cloudSyncMediaHashCache.format_version, MEDIA_HASH_CACHE_VERSION));
      const rows = await db.select().from(cloudSyncMediaHashCache);
      for (const row of rows) {
        const key = prefix + row.path;
        // A read or a removal in this process is newer than the table.
        if (inspectedFiles.has(key) || unsavedInspections.has(key)) continue;
        inspectedFiles.set(key, {
          key,
          size: row.size,
          lastModified: row.modified_at,
          sha256: row.sha256,
          hashedAt: row.hashed_at,
        });
      }
      persistedHashesLoaded = true;
    } catch (error) {
      console.warn('Cloud sync could not load saved media hashes', error);
    }
  })();
  return persistedHashesLoad;
}

/**
 * Saves the hashes this process changed in one transaction, and removes rows
 * for files no media row references. Runs at the end of a sync pass; a
 * failure leaves the changes for the next pass.
 */
async function persistMediaHashes(): Promise<void> {
  rehashBudget = REHASHES_PER_PASS;
  // Retry a failed load once per pass, not on every file check.
  if (!persistedHashesLoaded) persistedHashesLoad = null;
  await loadPersistedHashes();
  if (documentPrefix() === null) return;
  if (unsavedInspections.size === 0 && prunedPersistedHashes) return;
  const batch = new Map(unsavedInspections);
  try {
    await runExclusiveDbTransaction(async (tx) => {
      const [live, retained, saved] = await Promise.all([
        tx.select({ uri: mediaAssets.local_uri }).from(mediaAssets),
        tx
          .select({
            original: syncRetainedMedia.original_uri,
            staged: syncRetainedMedia.staged_uri,
          })
          .from(syncRetainedMedia),
        tx.select({ path: cloudSyncMediaHashCache.path }).from(cloudSyncMediaHashCache),
      ]);
      const referenced = new Set<string>();
      for (const uri of [
        ...live.map((row) => row.uri),
        ...retained.flatMap((row) => [row.original, row.staged]),
      ]) {
        const key = uri === null ? null : canonicalFileUri(uri);
        const path = key === null ? null : persistedHashPath(key);
        if (path !== null) referenced.add(path);
      }
      const upserts: (typeof cloudSyncMediaHashCache.$inferInsert)[] = [];
      const removals = new Set(
        saved.map((row) => row.path).filter((path) => !referenced.has(path)),
      );
      for (const [key, value] of batch) {
        const path = persistedHashPath(key);
        if (path === null) continue;
        if (value === null || !referenced.has(path)) {
          removals.add(path);
          continue;
        }
        upserts.push({
          path,
          size: value.size,
          modified_at: value.lastModified,
          sha256: value.sha256,
          hashed_at: value.hashedAt,
          format_version: MEDIA_HASH_CACHE_VERSION,
        });
      }
      await writeBatches([...removals], (paths) =>
        tx
          .delete(cloudSyncMediaHashCache)
          .where(inArray(cloudSyncMediaHashCache.path, paths)),
      );
      await writeBatches(upserts, (rows) =>
        tx
          .insert(cloudSyncMediaHashCache)
          .values(rows)
          .onConflictDoUpdate({
            target: cloudSyncMediaHashCache.path,
            set: {
              size: sql`excluded.size`,
              modified_at: sql`excluded.modified_at`,
              sha256: sql`excluded.sha256`,
              hashed_at: sql`excluded.hashed_at`,
              format_version: sql`excluded.format_version`,
            },
          }),
      );
    });
    prunedPersistedHashes = true;
    for (const [key, value] of batch)
      if (unsavedInspections.get(key) === value) unsavedInspections.delete(key);
  } catch (error) {
    console.warn('Cloud sync could not save media hashes', error);
  }
}

/** Whether an old cached hash should be read again; spends this pass's budget. */
function dueForRehash(cached: InspectedFile): boolean {
  if (Date.now() - cached.hashedAt < REHASH_AFTER_MS || rehashBudget <= 0) return false;
  rehashBudget -= 1;
  return true;
}

/**
 * Hashes a local file, or returns the hash of an unchanged earlier read. Not
 * for upload sources: those must hash the bytes they are about to stream.
 */
async function inspectUnchangedLocalMediaFile(
  uri: string,
): Promise<{ sha256: string; byteSize: number }> {
  const before = fileStamp(uri);
  const cached = before && inspectedFiles.get(before.key);
  if (
    before &&
    cached &&
    cached.size === before.size &&
    cached.lastModified === before.lastModified &&
    !dueForRehash(cached)
  ) {
    return { sha256: cached.sha256, byteSize: cached.size };
  }
  return inspectAndRemember(before, uri);
}

/** Hashes a file and caches the result; a failed read forgets its old hash. */
async function inspectAndRemember(
  before: FileStamp | null,
  uri: string,
): Promise<{ sha256: string; byteSize: number }> {
  let inspected;
  try {
    inspected = await inspectLocalMediaFile(uri);
  } catch (error) {
    const key = before?.key ?? canonicalFileUri(uri);
    if (key !== null) forgetHash(key);
    throw error;
  }
  rememberInspection(before, uri, inspected);
  return inspected;
}

/** Caches a hash only if the file did not change while it was read. */
function rememberInspection(
  before: FileStamp | null,
  uri: string,
  inspected: { sha256: string; byteSize: number },
): void {
  const after = fileStamp(uri);
  if (
    before &&
    after &&
    after.key === before.key &&
    after.size === before.size &&
    after.lastModified === before.lastModified &&
    after.size === inspected.byteSize
  ) {
    rememberHash(after.key, { ...after, sha256: inspected.sha256, hashedAt: Date.now() });
    return;
  }
  // The file changed or disappeared while it was read: forget its old hash.
  const key = after?.key ?? before?.key ?? canonicalFileUri(uri);
  if (key !== null) forgetHash(key);
}

/** A recreated file must be read again, even with an identical stamp. */
function localMediaFileExists(uri: string | null): uri is string {
  if (fileExists(uri)) return true;
  const key = uri === null ? null : canonicalFileUri(uri);
  if (key !== null) forgetHash(key);
  return false;
}

/**
 * Forgets every hash held in memory; the next lookup reads the table again.
 * "Delete all" calls it once its wipe has committed; tests use it to simulate
 * an app restart.
 */
export function forgetMediaHashes(): void {
  inspectedFiles.clear();
  unsavedInspections.clear();
  persistedHashesLoad = null;
  persistedHashesLoaded = false;
  prunedPersistedHashes = false;
  documentPrefixValue = null;
  rehashBudget = REHASHES_PER_PASS;
}

/**
 * Empties the saved hashes in the caller's transaction, for "Delete all".
 * Call `forgetMediaHashes` after it commits: on a rollback, memory keeps
 * newer reads the table does not hold yet.
 */
export async function clearMediaHashes(tx: DbTransaction): Promise<void> {
  await tx.delete(cloudSyncMediaHashCache);
}

/** Hashes a file, reusing an unchanged earlier read only if `reuseHashes`. */
async function inspectMediaFile(
  uri: string,
  reuseHashes: boolean,
): Promise<{ sha256: string; byteSize: number }> {
  await loadPersistedHashes();
  if (reuseHashes) return inspectUnchangedLocalMediaFile(uri);
  return inspectAndRemember(fileStamp(uri), uri);
}

export async function verifyLocalMediaFile(
  uri: string | null,
  expectedSha256: string,
  expectedByteSize: number | null,
  reuseHashes = true,
): Promise<boolean> {
  await loadPersistedHashes();
  if (!localMediaFileExists(uri)) return false;
  try {
    const inspected = await inspectMediaFile(uri, reuseHashes);
    return (
      inspected.sha256 === expectedSha256 &&
      (expectedByteSize === null || inspected.byteSize === expectedByteSize)
    );
  } catch {
    return false;
  }
}

function ensureDirectory(name: string): Directory {
  const directory = new Directory(Paths.document, name);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function stageFile(blobHash: string): File {
  return new File(ensureDirectory(STAGING_DIRECTORY), `${blobHash}.bin`);
}

/**
 * Deletes media rows that nothing uses and that have no file: a missing file
 * or no file path at all. An older "Delete journal everywhere" left such
 * profile-photo rows behind (#178). A backup with no other device to merge
 * with would publish them, so every backup stopped on files that no longer
 * exist.
 *
 * A profile photo is in use when it is the current one or another version of
 * it sync keeps (`sync_field_values`). An attachment is in use
 * while its entry exists. A merge drops the rows this deletes, so other
 * devices see no change. Rows in use are never touched, and neither is a row
 * whose file check fails: if their files are missing, the backup keeps
 * stopping.
 */
export async function pruneMissingUnusedMedia(): Promise<number> {
  return runExclusiveDbTransaction(async (tx) => {
    const rows = await tx
      .select({
        assetId: mediaAssets.asset_id,
        ownerType: mediaAssets.owner_type,
        ownerId: mediaAssets.owner_id,
        localUri: mediaAssets.local_uri,
      })
      .from(mediaAssets);
    if (rows.length === 0) return 0;
    const liveEntries = new Set(
      (await tx.select({ id: entries.note_id }).from(entries)).map(({ id }) => id),
    );
    const usedPhotos = new Set<string>();
    const [profile] = await tx
      .select({ photoAssetId: userProfile.photo_asset_id })
      .from(userProfile)
      .limit(1);
    if (profile?.photoAssetId) usedPhotos.add(profile.photoAssetId);
    // Cloud sync v2: other versions of the profile photo, kept beside the
    // shown one; a version still downloading has no file yet.
    for (const row of await tx
      .select({ value: syncFieldValues.value_json })
      .from(syncFieldValues)
      .where(
        and(
          eq(syncFieldValues.entity_type, 'profile'),
          eq(syncFieldValues.field, 'photo'),
        ),
      )) {
      const assetId = JSON.parse(row.value) as string | null;
      if (assetId) usedPhotos.add(assetId);
    }
    const unused: string[] = [];
    for (const row of rows) {
      const used =
        row.ownerType === 'entry'
          ? liveEntries.has(row.ownerId)
          : usedPhotos.has(row.assetId);
      if (used) continue;
      if (row.localUri) {
        // Only a file confirmed absent counts; a failed check keeps the row.
        try {
          if (fileForLocalUri(row.localUri).exists) continue;
        } catch {
          continue;
        }
      }
      unused.push(row.assetId);
    }
    await writeBatches(unused, (batch) =>
      tx.delete(mediaAssets).where(inArray(mediaAssets.asset_id, batch)),
    );
    return unused.length;
  });
}

interface MaterializedMedia {
  uri: string;
  verified: boolean;
}

/**
 * A row's existing path when a download can safely be written back to it: one
 * file directly inside its kind's media folder. Writing there keeps every
 * reference to the path, including entry lists an open editor holds, valid.
 */
function restorableMediaUri(
  kind: MediaDescriptor['kind'],
  uri: string | null,
): string | null {
  const directoryName = kind === 'voice' ? VOICE_DIRECTORY : PHOTO_DIRECTORY;
  if (!uri?.startsWith(`${directoryName}/`)) return null;
  const name = uri.slice(directoryName.length + 1);
  return name.length > 0 && !name.includes('/') && !name.includes('..') ? uri : null;
}

/** What placing a blob's file needs from its descriptor. */
type PlacedMedia = Pick<MediaDescriptor, 'assetId' | 'kind' | 'blobHash' | 'byteSize'>;

function relativeMediaUri(asset: PlacedMedia): string {
  const directoryName = asset.kind === 'voice' ? VOICE_DIRECTORY : PHOTO_DIRECTORY;
  const extension = asset.kind === 'voice' ? 'm4a' : 'jpg';
  return `${directoryName}/${sha256Text(asset.assetId)}-${asset.blobHash}.${extension}`;
}

/**
 * One physical file, whether a row stores it relative, as a bare absolute
 * path, or as a `file://` URI. Bare paths become file URLs first: Expo's
 * Android File cannot report a URI for a scheme-less path. Returns null when
 * the identity cannot be determined.
 */
function canonicalFileUri(uri: string): string | null {
  try {
    return fileForLocalUri(uri.startsWith('/') ? `file://${uri}` : uri).uri;
  } catch {
    return null;
  }
}

// Serializes every media file lifetime: an apply's materialize, transaction
// and rejected-apply cleanup, and a hydration's copy and row update. Cleanup
// decides from its transaction's reads that a copied file is unreferenced.
// Each transaction has its own WAL connection, so a concurrent apply could
// otherwise commit a reference to that same deterministic file after those
// reads and have it deleted.
let mediaFileQueue: Promise<unknown> = Promise.resolve();

function serializeMediaFiles<T>(operation: () => Promise<T>): Promise<T> {
  const result = mediaFileQueue.then(operation);
  mediaFileQueue = result.catch(() => undefined);
  return result;
}

/**
 * Removes files an apply copied before its transaction was rejected or rolled
 * back. A file that a committed row references (e.g. written by the apply that
 * won the race), under any URI form, is kept, as is any file whose identity
 * cannot be compared; anything missed here is only unreferenced space. Runs
 * inside `serializeMediaFiles`.
 */
async function discardUncommittedMediaFiles(uris: readonly string[]): Promise<void> {
  if (uris.length === 0) return;
  try {
    await runExclusiveDbTransaction(async (tx) => {
      for (const uri of uris) {
        const target = canonicalFileUri(uri);
        if (target === null) continue;
        // Narrow by file name, then compare canonical identities: rows may
        // store the same file relative or as an absolute URI.
        const name = uri.slice(uri.lastIndexOf('/') + 1);
        const [live, retained, legacy] = await Promise.all([
          tx
            .select({ uri: mediaAssets.local_uri })
            .from(mediaAssets)
            .where(sql`instr(${mediaAssets.local_uri}, ${name}) > 0`),
          tx
            .select({
              original: syncRetainedMedia.original_uri,
              staged: syncRetainedMedia.staged_uri,
            })
            .from(syncRetainedMedia)
            .where(
              or(
                sql`instr(${syncRetainedMedia.original_uri}, ${name}) > 0`,
                sql`instr(${syncRetainedMedia.staged_uri}, ${name}) > 0`,
              ),
            ),
          tx
            .select({ assets: entries.assets })
            .from(entries)
            .where(sql`instr(${entries.assets}, ${name}) > 0`),
        ]);
        const referenced = [
          ...live.map((row) => row.uri),
          ...retained.flatMap((row) => [row.original, row.staged]),
          ...legacy.flatMap((row) => (row.assets ?? []).map((asset) => asset.uri)),
        ].some((value) => {
          if (value === null) return false;
          const identity = canonicalFileUri(value);
          // An unmatched raw spelling is no evidence the file is unused.
          return identity === null || identity === target;
        });
        if (referenced) continue;
        const file = fileForLocalUri(uri);
        if (file.exists) file.delete();
      }
    });
  } catch {
    // Cleanup must not hide the apply result or its error. A file left here is
    // only unreferenced space.
    console.warn('Unused synced media cleanup failed');
  }
}

/** File-backed media cache shared by the sync engine and normalized journal apply. */
export class ProductionSnapshotMediaStore implements SnapshotMediaStore {
  /** Reuses unchanged files' cached hashes; see `inspectUnchangedLocalMediaFile`. */
  async hasVerified(blobHash: string): Promise<boolean> {
    for await (const candidate of this.verifiedCandidates(blobHash, true))
      if (openMediaUploadSource(candidate.uri, blobHash, candidate.byteSize)) return true;
    return false;
  }

  /**
   * Blobs with a local copy `openVerifiedSource` may open: a media row that
   * stands for a local file ('n/a', authored here, even when its file is
   * gone; or 'verified'), a retained copy, or a file at another row's path or
   * in staging. No hashing: a superset, which `openVerifiedSource` narrows. A
   * row still waiting for its download has no file, so a device restoring a
   * journal holds almost none of its blobs.
   */
  async mightHold(blobHashes: readonly string[]): Promise<Set<string>> {
    const held = new Set<string>();
    const paths = new Map<string, string[]>();
    for (let offset = 0; offset < blobHashes.length; offset += IDS_PER_QUERY) {
      const batch = blobHashes.slice(offset, offset + IDS_PER_QUERY);
      const [rows, retained] = await Promise.all([
        db
          .select({
            blobHash: mediaAssets.blob_hash,
            state: mediaAssets.download_state,
            uri: mediaAssets.local_uri,
          })
          .from(mediaAssets)
          .where(inArray(mediaAssets.blob_hash, batch)),
        db
          .select({ blobHash: syncRetainedMedia.blob_hash })
          .from(syncRetainedMedia)
          .where(inArray(syncRetainedMedia.blob_hash, batch)),
      ]);
      for (const row of retained) if (row.blobHash) held.add(row.blobHash);
      for (const row of rows) {
        if (!row.blobHash) continue;
        if (row.state === 'n/a' || row.state === 'verified') held.add(row.blobHash);
        else if (row.uri) {
          const list = paths.get(row.blobHash);
          if (list) list.push(row.uri);
          else paths.set(row.blobHash, [row.uri]);
        }
      }
    }
    // Staging is checked for every other blob, row or not, as
    // `openVerifiedSource` does. Read only: the folder is not created here.
    let checked = 0;
    for (const blobHash of new Set(blobHashes)) {
      if (held.has(blobHash)) continue;
      const staged = `${STAGING_DIRECTORY}/${blobHash}.bin`;
      if (fileExists(staged) || (paths.get(blobHash) ?? []).some(fileExists))
        held.add(blobHash);
      // A few file checks at a time, so a large restore does not hold the app.
      if (++checked % 200 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return held;
  }

  /** Always hashes the file it returns, so an upload streams verified bytes. */
  async openVerifiedSource(blobHash: string) {
    for await (const candidate of this.verifiedCandidates(blobHash, false)) {
      const source = openMediaUploadSource(candidate.uri, blobHash, candidate.byteSize);
      if (source) return source;
    }
    return null;
  }

  /**
   * Any verified local copy of a blob, e.g. one held under a replaced asset ID.
   * The copy re-verifies the bytes it writes, so a cached hash is enough here.
   */
  async verifiedLocalFile(blobHash: string): Promise<File | null> {
    for await (const candidate of this.verifiedCandidates(blobHash, true))
      return fileForLocalUri(candidate.uri);
    return null;
  }

  private async *verifiedCandidates(blobHash: string, reuseHashes: boolean) {
    const staged = stageFile(blobHash);
    const stagedCandidate = await this.inspectSource(
      staged.uri,
      blobHash,
      null,
      reuseHashes,
    );
    if (stagedCandidate) yield stagedCandidate;
    const [live, retained] = await Promise.all([
      db
        .select({ uri: mediaAssets.local_uri, bytes: mediaAssets.byte_size })
        .from(mediaAssets)
        .where(eq(mediaAssets.blob_hash, blobHash)),
      db
        .select({
          original: syncRetainedMedia.original_uri,
          staged: syncRetainedMedia.staged_uri,
          bytes: syncRetainedMedia.byte_size,
        })
        .from(syncRetainedMedia)
        .where(eq(syncRetainedMedia.blob_hash, blobHash)),
    ]);
    for (const candidate of [
      ...live.map((row) => ({ uri: row.uri, bytes: row.bytes })),
      ...retained.flatMap((row) => [
        { uri: row.staged, bytes: row.bytes },
        { uri: row.original, bytes: row.bytes },
      ]),
    ]) {
      const verified = await this.inspectSource(
        candidate.uri,
        blobHash,
        candidate.bytes,
        reuseHashes,
      );
      if (verified) yield verified;
    }
  }

  private async inspectSource(
    uri: string | null,
    hash: string,
    bytes: number | null,
    reuseHashes: boolean,
  ) {
    await loadPersistedHashes();
    if (!localMediaFileExists(uri)) return null;
    try {
      const inspected = await inspectMediaFile(uri, reuseHashes);
      if (inspected.sha256 !== hash || (bytes !== null && inspected.byteSize !== bytes))
        return null;
      return { uri, byteSize: inspected.byteSize };
    } catch {
      // A bad staging/retained copy must not hide another verified local copy.
      return null;
    }
  }

  async openDownloadSink(blobHash: string) {
    return createMediaPartialFileSink(ensureDirectory(STAGING_DIRECTORY), blobHash);
  }

  stagedFile(blobHash: string): File | null {
    const file = stageFile(blobHash);
    return file.exists ? file : null;
  }

  deleteStaged(blobHash: string): void {
    const file = stageFile(blobHash);
    if (file.exists) file.delete();
  }
}

/** Media hydration, repair and the files of a v2 apply (`applySyncState`). */
export class ProductionSnapshotJournalStore {
  constructor(
    private readonly vaultId: string,
    private readonly mediaStore: ProductionSnapshotMediaStore,
  ) {}

  /**
   * Downloaded attachments whose file has gone missing, for example after a
   * partial device restore, become pending again so hydration downloads them.
   * Only a file confirmed absent counts: a failed check leaves the row alone,
   * so a passing I/O error never triggers a download. This changes local
   * state only; the journal and its generation stay the same.
   */
  async requeueMissingVerifiedMedia(): Promise<number> {
    await loadPersistedHashes();
    const rows = await db
      .select({
        assetId: mediaAssets.asset_id,
        kind: mediaAssets.kind,
        localUri: mediaAssets.local_uri,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.download_state, 'verified'),
          isNotNull(mediaAssets.blob_hash),
          isNotNull(mediaAssets.byte_size),
        ),
      );
    let requeued = 0;
    for (const row of rows) {
      // Hydration writes the file back to this same path. A path it cannot
      // reuse, such as a legacy absolute one, is left as it is.
      const localUri = restorableMediaUri(row.kind, row.localUri);
      if (localUri === null) continue;
      let exists: boolean;
      try {
        exists = fileForLocalUri(localUri).exists;
      } catch {
        continue;
      }
      if (exists) continue;
      const key = canonicalFileUri(localUri);
      if (key !== null) forgetHash(key);
      await db
        .update(mediaAssets)
        .set({ download_state: 'pending' })
        .where(
          and(
            eq(mediaAssets.asset_id, row.assetId),
            eq(mediaAssets.download_state, 'verified'),
          ),
        );
      requeued += 1;
    }
    return requeued;
  }

  /** Saves this pass's media hash changes; never throws. */
  persistMediaHashes(): Promise<void> {
    return persistMediaHashes();
  }

  /**
   * The blob hashes of the next pending attachments, in the order
   * `hydratePendingMedia` downloads them, without repeats.
   */
  async pendingMediaHashes(limit: number): Promise<string[]> {
    const rows = await db
      .select({ blobHash: mediaAssets.blob_hash })
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.download_state, 'pending'), isNotNull(mediaAssets.blob_hash)),
      )
      .orderBy(mediaAssets.asset_id)
      .limit(limit);
    return [...new Set(rows.flatMap((row) => (row.blobHash ? [row.blobHash] : [])))];
  }

  /**
   * Bounded post-restore hydration. Metadata/text remain usable while media waits.
   *
   * `missing` counts rows that cannot be downloaded at all (no hash or size).
   * `unavailable` counts files the backup no longer has: they become
   * `missing`, and the attachment shows without its file, but sync carries
   * on (#185 P12). Remote media garbage collection removes files no backup
   * refers to, so a device back after 180 days can refer to one that is
   * gone; that must not pause the vault. `requeueUnavailableMedia` tries
   * them again, in case the device that has the file uploads it again.
   */
  async hydratePendingMedia(
    provider: SnapshotProvider,
    limit = 2,
    onDownloaded?: () => void,
  ): Promise<{
    hydrated: number;
    missing: number;
    unavailable: number;
    profilePhoto: boolean;
  }> {
    const pending = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.download_state, 'pending'))
      .orderBy(mediaAssets.asset_id)
      .limit(limit);
    let hydrated = 0;
    let missing = 0;
    let unavailable = 0;
    // The profile's photo is the only media its screens read from a cache.
    let profilePhoto = false;
    for (const row of pending) {
      if (!row.blob_hash || row.byte_size === null) {
        missing += 1;
        continue;
      }
      let downloaded: boolean;
      try {
        downloaded = await provider.downloadMedia(
          this.vaultId,
          row.blob_hash,
          await this.mediaStore.openDownloadSink(row.blob_hash),
        );
      } catch (error) {
        if (!(error instanceof MediaIntegrityError)) throw error;
        // The file is there but its bytes are wrong: that still pauses.
        await db
          .update(mediaAssets)
          .set({ download_state: 'missing' })
          .where(eq(mediaAssets.asset_id, row.asset_id));
        missing += 1;
        continue;
      }
      if (!downloaded) {
        await db
          .update(mediaAssets)
          .set({ download_state: 'missing' })
          .where(eq(mediaAssets.asset_id, row.asset_id));
        unavailable += 1;
        continue;
      }
      onDownloaded?.();
      const descriptor: PlacedMedia = {
        assetId: row.asset_id,
        kind: row.kind,
        blobHash: row.blob_hash,
        byteSize: row.byte_size,
      };
      // The row already exists, so the copied file needs no rollback tracking.
      // A file goes back to the row's own path when it can, so references to
      // that path, such as the entry's attachment list, stay valid.
      await serializeMediaFiles(async () => {
        const materialized = await this.materializeDescriptor(
          descriptor,
          [],
          restorableMediaUri(row.kind, row.local_uri) ?? undefined,
        );
        await db
          .update(mediaAssets)
          .set({
            local_uri: materialized.uri,
            download_state: 'verified',
          })
          .where(
            and(
              eq(mediaAssets.asset_id, row.asset_id),
              eq(mediaAssets.blob_hash, descriptor.blobHash),
            ),
          );
      });
      const remaining = await db
        .select({ id: mediaAssets.asset_id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.blob_hash, row.blob_hash),
            eq(mediaAssets.download_state, 'pending'),
          ),
        )
        .limit(1);
      if (remaining.length === 0) this.mediaStore.deleteStaged(row.blob_hash);
      hydrated += 1;
      if (row.owner_type === 'profile') profilePhoto = true;
    }
    return { hydrated, missing, unavailable, profilePhoto };
  }

  /**
   * Files the backup did not have at an earlier download (`unavailable`
   * above) become pending again, so hydration looks for them once more.
   * Only rows with a hash and size: one without is a local file that went
   * missing, which pauses instead.
   */
  async requeueUnavailableMedia(): Promise<void> {
    await db
      .update(mediaAssets)
      .set({ download_state: 'pending' })
      .where(
        and(
          eq(mediaAssets.download_state, 'missing'),
          isNotNull(mediaAssets.blob_hash),
          isNotNull(mediaAssets.byte_size),
        ),
      );
  }

  /**
   * Files for the v2 apply (`applySyncState`): copies of verified local or
   * staged blobs, and cleanup of the copies of an apply that did not commit.
   */
  applyFiles(): ApplyMediaFiles {
    return {
      materialize: (media, created) => this.materializeMedia(media, created),
      discard: (created) => discardUncommittedMediaFiles(created),
      serialize: (operation) => serializeMediaFiles(operation),
    };
  }

  private async materializeMedia(
    media: readonly PlacedMedia[],
    created: string[],
  ): Promise<Map<string, MaterializedMedia>> {
    const existingRows = await db.select().from(mediaAssets);
    const byIdentity = new Map(
      existingRows.map((row) => [`${row.asset_id}\0${row.blob_hash ?? ''}`, row]),
    );
    const result = new Map<string, MaterializedMedia>();
    for (const asset of media) {
      const existing = byIdentity.get(`${asset.assetId}\0${asset.blobHash}`);
      if (existing?.local_uri) {
        if (
          await verifyLocalMediaFile(
            existing.local_uri,
            asset.blobHash,
            asset.byteSize,
            // A verified file lets the staged download be deleted below, so
            // only an unstaged blob may rely on a cached hash.
            this.mediaStore.stagedFile(asset.blobHash) === null,
          )
        ) {
          result.set(asset.assetId, { uri: existing.local_uri, verified: true });
          continue;
        }
      }
      result.set(asset.assetId, await this.materializeDescriptor(asset, created));
    }
    const unverifiedHashes = new Set(
      media
        .filter((asset) => !result.get(asset.assetId)?.verified)
        .map((asset) => asset.blobHash),
    );
    for (const blobHash of new Set(media.map((asset) => asset.blobHash))) {
      if (!unverifiedHashes.has(blobHash)) {
        this.mediaStore.deleteStaged(blobHash);
      }
    }
    return result;
  }

  private async materializeDescriptor(
    asset: PlacedMedia,
    created: string[],
    relativeUri = relativeMediaUri(asset),
  ): Promise<MaterializedMedia> {
    const directoryName = asset.kind === 'voice' ? VOICE_DIRECTORY : PHOTO_DIRECTORY;
    const destination = new File(
      ensureDirectory(directoryName),
      relativeUri.split('/').pop()!,
    );
    if (destination.exists) {
      try {
        // As in materializeMedia: a staged download is only dropped after a
        // fresh read of the file that replaces it.
        const inspected = await inspectMediaFile(
          destination.uri,
          this.mediaStore.stagedFile(asset.blobHash) === null,
        );
        if (
          inspected.byteSize === asset.byteSize &&
          inspected.sha256 === asset.blobHash
        ) {
          return { uri: relativeUri, verified: true };
        }
      } catch {
        // The verified staging copy below replaces an unreadable destination.
      }
    }
    // A same-blob asset ID switch keeps the photo local: copy the verified
    // blob from whichever local file holds it instead of re-downloading.
    const source =
      this.mediaStore.stagedFile(asset.blobHash) ??
      (await this.mediaStore.verifiedLocalFile(asset.blobHash));
    if (!source) {
      return { uri: relativeUri, verified: false };
    }
    created.push(relativeUri);
    await copyVerifiedMediaFile(source, destination, asset.byteSize, asset.blobHash);
    return { uri: relativeUri, verified: true };
  }
}

/** Files for a v2 apply outside a sync pass (a "Keep this one" or "Got it"). */
export function productionApplyFiles(): ApplyMediaFiles {
  // The vault only matters to hydration, which this never runs.
  return new ProductionSnapshotJournalStore(
    '',
    new ProductionSnapshotMediaStore(),
  ).applyFiles();
}
