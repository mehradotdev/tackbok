import { and, eq, or, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  cloudConflicts,
  cloudSyncState,
  cloudTombstones,
  customPrompts,
  db,
  entries,
  entryTags,
  mediaAssets,
  runExclusiveDbTransaction,
  syncMediaObligations,
  syncRetainedMedia,
  tags,
  userProfile,
} from '~/db';
import {
  isLocalProfilePristine,
  markLocalProfileTouched,
} from '../../storage/repositories';
import { AssetType, type Asset } from '~/types';
import { sha256Text } from '../sha256';
import { canonicalize } from '../canonical';
import { SnapshotValidationError } from '../caps';
import { validateSnapshotConflict } from '../validation';
import { completeAttachmentOrder } from '../attachmentOrder';
import { writeBatches } from './writeBatches';
import {
  copyVerifiedMediaFile,
  createMediaPartialFileSink,
  openMediaUploadSource,
} from '../media';
import { inspectLocalMediaFile } from '../../media/streamingHash';
import type { SnapshotConflict, SnapshotDomain, SnapshotMedia } from '../types';
import type {
  CapturedJournal,
  SnapshotProvider,
  SnapshotJournalStore,
  SnapshotMediaStore,
} from '../sync/types';
import { LocalStorageError } from '../sync/types';

const STAGING_DIRECTORY = 'cloud-sync-media';
const PHOTO_DIRECTORY = 'photos';
const VOICE_DIRECTORY = 'voice_memos';

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

export async function verifyLocalMediaFile(
  uri: string | null,
  expectedSha256: string,
  expectedByteSize: number | null,
): Promise<boolean> {
  if (!fileExists(uri)) return false;
  try {
    const inspected = await inspectLocalMediaFile(uri);
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

function parseConflict(value: string): SnapshotConflict {
  try {
    return validateSnapshotConflict(JSON.parse(value));
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof SnapshotValidationError))
      throw error;
    // Invalid local metadata is a preparation failure, not cloud corruption.
  }
  throw new LocalStorageError(
    'normalized-model-not-ready',
    'invalid-local-conflict-record',
  );
}

function legacyAsset(descriptor: SnapshotMedia, uri: string): Asset {
  return {
    type: descriptor.kind === 'voice' ? AssetType.AUDIO : AssetType.IMAGE,
    uri,
    assetId: descriptor.assetId,
    blobHash: descriptor.blobHash,
    mimeType: descriptor.mimeType ?? undefined,
    byteSize: descriptor.byteSize,
    width: descriptor.width ?? undefined,
    height: descriptor.height ?? undefined,
    durationMs: descriptor.durationMs ?? undefined,
  };
}

interface MaterializedMedia {
  uri: string;
  verified: boolean;
}

function relativeMediaUri(asset: SnapshotMedia): string {
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
  async hasVerified(blobHash: string): Promise<boolean> {
    return (await this.openVerifiedSource(blobHash)) !== null;
  }

  async openVerifiedSource(blobHash: string) {
    for await (const candidate of this.verifiedCandidates(blobHash)) {
      const source = openMediaUploadSource(candidate.uri, blobHash, candidate.byteSize);
      if (source) return source;
    }
    return null;
  }

  /** Any verified local copy of a blob, e.g. one held under a replaced asset ID. */
  async verifiedLocalFile(blobHash: string): Promise<File | null> {
    for await (const candidate of this.verifiedCandidates(blobHash))
      return fileForLocalUri(candidate.uri);
    return null;
  }

  private async *verifiedCandidates(blobHash: string) {
    const staged = stageFile(blobHash);
    const stagedCandidate = await this.inspectSource(staged.uri, blobHash, null);
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
      const verified = await this.inspectSource(candidate.uri, blobHash, candidate.bytes);
      if (verified) yield verified;
    }
  }

  private async inspectSource(uri: string | null, hash: string, bytes: number | null) {
    if (!fileExists(uri)) return null;
    try {
      const inspected = await inspectLocalMediaFile(uri);
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

/** Complete-state normalized journal adapter used only by the production runtime. */
export class ProductionSnapshotJournalStore implements SnapshotJournalStore {
  constructor(
    private readonly vaultId: string,
    private readonly deviceId: string,
    private readonly mediaStore: ProductionSnapshotMediaStore,
  ) {}

  async capture(): Promise<CapturedJournal> {
    return runExclusiveDbTransaction(async (tx) => {
      const [state] = await tx
        .select()
        .from(cloudSyncState)
        .where(
          and(
            eq(cloudSyncState.vault_id, this.vaultId),
            eq(cloudSyncState.device_id, this.deviceId),
          ),
        )
        .limit(1);
      if (!state) {
        throw new LocalStorageError(
          'normalized-model-not-ready',
          'snapshot-state-not-initialized',
        );
      }

      const entryRows = await tx.select().from(entries);
      const tagRows = await tx.select().from(tags);
      const relationRows = await tx.select().from(entryTags);
      const promptRows = await tx.select().from(customPrompts);
      const mediaRows = await tx.select().from(mediaAssets);
      const [profileRow] = await tx.select().from(userProfile).limit(1);
      const localProfilePristine = await isLocalProfilePristine(tx);
      const tombstoneRows = await tx
        .select()
        .from(cloudTombstones)
        .where(eq(cloudTombstones.vault_id, this.vaultId));
      const conflictRows = await tx
        .select()
        .from(cloudConflicts)
        .where(eq(cloudConflicts.vault_id, this.vaultId));

      const media = mediaRows.map((row): SnapshotMedia => {
        if (!row.blob_hash || row.byte_size === null) {
          throw new LocalStorageError(
            'local-media-unreadable',
            'normalized-media-needs-hash',
          );
        }
        return {
          assetId: row.asset_id,
          ownerType: row.owner_type,
          ownerId: row.owner_type === 'profile' ? 'profile' : row.owner_id,
          kind: row.kind,
          blobHash: row.blob_hash,
          mimeType: row.mime_type,
          byteSize: row.byte_size,
          width: row.width,
          height: row.height,
          durationMs: row.duration_ms,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
      const recoveryOrigins = new Map<string, string | null>();
      const entryMedia = new Map<string, typeof mediaRows>();
      for (const row of mediaRows) {
        if (row.owner_type !== 'entry') continue;
        const rows = entryMedia.get(row.owner_id) ?? [];
        rows.push(row);
        entryMedia.set(row.owner_id, rows);
      }
      const attachmentOrder = (row: (typeof entryRows)[number]) => {
        const assets = entryMedia.get(row.note_id) ?? [];
        if (assets.length === 0) return {};
        const byUri = new Map(assets.map((asset) => [asset.local_uri, asset.asset_id]));
        const knownIds = new Set(assets.map((asset) => asset.asset_id));
        const ids = (row.assets ?? [])
          .map((asset) =>
            asset.assetId && knownIds.has(asset.assetId)
              ? asset.assetId
              : byUri.get(asset.uri),
          )
          .filter((id): id is string => id !== undefined);
        return {
          attachmentOrder: completeAttachmentOrder(
            ids,
            assets.map((asset) => asset.asset_id),
          ),
        };
      };
      for (const row of entryRows)
        recoveryOrigins.set(`entry\0${row.note_id}`, row.conflict_origin_id);
      for (const row of tagRows)
        recoveryOrigins.set(`tag\0${row.tag_id}`, row.conflict_origin_id);
      for (const row of promptRows)
        recoveryOrigins.set(`prompt\0${row.prompt_id}`, row.conflict_origin_id);
      const conflicts = conflictRows
        .map((row) => parseConflict(row.conflict_json))
        .map((conflict) => ({
          ...conflict,
          recoveredEntityIds: conflict.recoveredEntityIds.filter(
            (recoveredId) =>
              recoveryOrigins.get(`${conflict.entityType}\0${recoveredId}`) ===
              conflict.entityId,
          ),
        }));

      return {
        generation: state.journal_generation,
        localProfilePristine,
        domain: {
          entries: entryRows
            .map((row) => ({
              entryId: row.note_id,
              ...attachmentOrder(row),
              title: row.text_title,
              content: row.text_content,
              mood: row.mood ?? null,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              conflictOriginId: row.conflict_origin_id,
            }))
            .sort((left, right) => left.entryId.localeCompare(right.entryId)),
          tags: tagRows
            .map((row) => ({
              tagId: row.tag_id,
              title: row.title,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              conflictOriginId: row.conflict_origin_id,
            }))
            .sort((left, right) => left.tagId.localeCompare(right.tagId)),
          entryTags: relationRows
            .map((row) => ({
              entryId: row.note_id,
              tagId: row.tag_id,
              createdAt: row.created_at,
            }))
            .sort(
              (left, right) =>
                left.entryId.localeCompare(right.entryId) ||
                left.tagId.localeCompare(right.tagId),
            ),
          prompts: promptRows
            .map((row) => ({
              promptId: row.prompt_id,
              title: row.title,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              conflictOriginId: row.conflict_origin_id,
            }))
            .sort((left, right) => left.promptId.localeCompare(right.promptId)),
          profile: {
            profileId: 'profile',
            displayName: profileRow?.display_name ?? null,
            photoAssetId: profileRow?.photo_asset_id ?? null,
            updatedAt: profileRow?.updated_at ?? 0,
          },
          media: media.sort((left, right) => left.assetId.localeCompare(right.assetId)),
          tombstones: tombstoneRows
            .map((row) => ({
              entityType: row.entity_type,
              entityId: row.entity_id,
              baseStateHash: row.base_state_hash,
              deletedStateHash: row.deleted_state_hash,
              deletedByDeviceId: row.deleted_by_device_id,
              deletionSequence: row.deletion_sequence,
            }))
            .sort(
              (left, right) =>
                left.entityType.localeCompare(right.entityType) ||
                left.entityId.localeCompare(right.entityId),
            ),
          conflicts: conflicts.sort((left, right) =>
            left.conflictId.localeCompare(right.conflictId),
          ),
        },
      };
    });
  }

  async applyMergedIfGeneration(
    domain: SnapshotDomain,
    expectedGeneration: number,
  ): Promise<boolean> {
    const captured = await this.capture();
    if (captured.generation !== expectedGeneration) return false;
    // Local-only publications already match SQLite. Avoid rewriting the journal
    // and hashing every attachment just to apply the state we captured.
    if (canonicalize(captured.domain) === canonicalize(domain)) {
      return runExclusiveDbTransaction(async (tx) => {
        const [state] = await tx
          .select({ generation: cloudSyncState.journal_generation })
          .from(cloudSyncState)
          .where(
            and(
              eq(cloudSyncState.vault_id, this.vaultId),
              eq(cloudSyncState.device_id, this.deviceId),
            ),
          )
          .limit(1);
        if (state?.generation !== expectedGeneration) return false;
        // Applying a synced state, even an unchanged one, means this profile
        // may now carry a remote decision, such as a deliberate clear.
        await markLocalProfileTouched(tx);
        return true;
      });
    }
    return serializeMediaFiles(() => this.applyWithMedia(domain, expectedGeneration));
  }

  /** Materializes, applies and, if rejected, cleans up; see `serializeMediaFiles`. */
  private async applyWithMedia(
    domain: SnapshotDomain,
    expectedGeneration: number,
  ): Promise<boolean> {
    // Files this apply copied have no row until it commits.
    const created: string[] = [];
    let applied = false;
    try {
      const materializedUris = await this.materializeMedia(domain.media, created);
      applied = await runExclusiveDbTransaction(async (tx) => {
        const [state] = await tx
          .select({ generation: cloudSyncState.journal_generation })
          .from(cloudSyncState)
          .where(
            and(
              eq(cloudSyncState.vault_id, this.vaultId),
              eq(cloudSyncState.device_id, this.deviceId),
            ),
          )
          .limit(1);
        if (!state || state.generation !== expectedGeneration) return false;

        const [priorProfile] = await tx.select().from(userProfile).limit(1);
        const priorMedia = await tx.select().from(mediaAssets);
        const acknowledged = new Map(
          (
            await tx
              .select()
              .from(cloudConflicts)
              .where(eq(cloudConflicts.vault_id, this.vaultId))
          ).map((row) => [row.conflict_id, row.acknowledged_at]),
        );

        // A remote apply is a complete-state replacement. Preserve every local
        // file whose exact descriptor is no longer referenced before deleting
        // its normalized row. The completed obligation records that the
        // head-advanced snapshot made the removal durable; the ordinary reaper
        // remains the only code allowed to unlink the file later.
        const retainedIdentities = new Set(
          domain.media.map((asset) => `${asset.assetId}\0${asset.blobHash}`),
        );
        const appliedAt = Date.now();
        for (const asset of priorMedia) {
          if (
            !asset.local_uri ||
            retainedIdentities.has(`${asset.asset_id}\0${asset.blob_hash ?? ''}`)
          )
            continue;
          const ledgerId = randomUUID();
          await tx.insert(syncRetainedMedia).values({
            ledger_id: ledgerId,
            asset_id: asset.asset_id,
            original_owner_type: asset.owner_type,
            original_owner_id: asset.owner_id,
            original_uri: asset.local_uri,
            staged_uri: null,
            kind: asset.kind,
            mime_type: asset.mime_type,
            byte_size: asset.byte_size,
            blob_hash: asset.blob_hash,
            state: 'uploaded',
            attempt_count: 0,
            last_error_code: null,
            delete_after: null,
            created_at: appliedAt,
            updated_at: appliedAt,
          });
          await tx.insert(syncMediaObligations).values({
            obligation_id: randomUUID(),
            ledger_id: ledgerId,
            blob_hash: asset.blob_hash,
            obligation_kind: 'remote-apply',
            obligation_key: `${this.vaultId}:${asset.asset_id}:${asset.blob_hash ?? 'unhashed'}`,
            completed_at: appliedAt,
            created_at: appliedAt,
          });
        }

        await tx.delete(entryTags);
        await tx.delete(mediaAssets);
        await tx.delete(entries);
        await tx.delete(tags);
        await tx.delete(customPrompts);
        await tx.delete(userProfile);
        await markLocalProfileTouched(tx);
        await tx
          .delete(cloudTombstones)
          .where(eq(cloudTombstones.vault_id, this.vaultId));
        await tx.delete(cloudConflicts).where(eq(cloudConflicts.vault_id, this.vaultId));

        if (domain.tags.length > 0)
          await writeBatches(
            domain.tags.map((tag) => ({
              tag_id: tag.tagId,
              title: tag.title,
              conflict_origin_id: tag.conflictOriginId,
              created_at: tag.createdAt,
              updated_at: tag.updatedAt,
            })),
            (rows) => tx.insert(tags).values(rows),
          );
        if (domain.prompts.length > 0) {
          await writeBatches(
            domain.prompts.map((prompt) => ({
              prompt_id: prompt.promptId,
              title: prompt.title,
              conflict_origin_id: prompt.conflictOriginId,
              created_at: prompt.createdAt,
              updated_at: prompt.updatedAt,
            })),
            (rows) => tx.insert(customPrompts).values(rows),
          );
        }

        const mediaByOwner = new Map<string, SnapshotMedia[]>();
        for (const asset of domain.media) {
          const key = `${asset.ownerType}\0${asset.ownerId}`;
          const values = mediaByOwner.get(key) ?? [];
          values.push(asset);
          mediaByOwner.set(key, values);
        }
        const tagsByEntry = new Map<string, string[]>();
        for (const relation of domain.entryTags) {
          const ids = tagsByEntry.get(relation.entryId) ?? [];
          ids.push(relation.tagId);
          tagsByEntry.set(relation.entryId, ids);
        }
        if (domain.entries.length > 0)
          await writeBatches(
            domain.entries.map((entry) => {
              const descriptors = mediaByOwner.get(`entry\0${entry.entryId}`) ?? [];
              const byId = new Map(descriptors.map((asset) => [asset.assetId, asset]));
              const assets = completeAttachmentOrder(entry.attachmentOrder, [
                ...byId.keys(),
              ])
                .map((id) => byId.get(id)!)
                .map((asset) =>
                  legacyAsset(asset, materializedUris.get(asset.assetId)!.uri),
                );
              const tagIds = (tagsByEntry.get(entry.entryId) ?? []).sort();
              return {
                note_id: entry.entryId,
                text_title: entry.title,
                text_content: entry.content,
                mood: entry.mood,
                assets,
                tags: tagIds.join(','),
                conflict_origin_id: entry.conflictOriginId,
                created_at: entry.createdAt,
                updated_at: entry.updatedAt,
              };
            }),
            (rows) => tx.insert(entries).values(rows),
          );

        if (domain.media.length > 0)
          await writeBatches(
            domain.media.map((asset) => ({
              asset_id: asset.assetId,
              owner_type: asset.ownerType,
              owner_id: asset.ownerType === 'profile' ? 'self' : asset.ownerId,
              kind: asset.kind,
              local_uri: materializedUris.get(asset.assetId)!.uri,
              download_state: materializedUris.get(asset.assetId)!.verified
                ? ('verified' as const)
                : ('pending' as const),
              mime_type: asset.mimeType,
              byte_size: asset.byteSize,
              width: asset.width,
              height: asset.height,
              duration_ms: asset.durationMs,
              blob_hash: asset.blobHash,
              created_at: asset.createdAt,
              updated_at: asset.updatedAt,
              pending_local_delete_at: null,
            })),
            (rows) => tx.insert(mediaAssets).values(rows),
          );
        if (domain.entryTags.length > 0)
          await writeBatches(
            domain.entryTags.map((relation) => ({
              note_id: relation.entryId,
              tag_id: relation.tagId,
              created_at: relation.createdAt,
              updated_at: relation.createdAt,
            })),
            (rows) => tx.insert(entryTags).values(rows),
          );
        await tx.insert(userProfile).values({
          profile_id: 'self',
          display_name: domain.profile.displayName,
          photo_asset_id: domain.profile.photoAssetId,
          email: priorProfile?.email ?? null,
          updated_at: domain.profile.updatedAt,
        });
        if (domain.tombstones.length > 0) {
          await writeBatches(
            domain.tombstones.map((value) => ({
              vault_id: this.vaultId,
              entity_type: value.entityType,
              entity_id: value.entityId,
              base_state_hash: value.baseStateHash,
              deleted_state_hash: value.deletedStateHash,
              deleted_by_device_id: value.deletedByDeviceId,
              deletion_sequence: value.deletionSequence,
              updated_at: Date.now(),
            })),
            (rows) => tx.insert(cloudTombstones).values(rows),
          );
        }
        if (domain.conflicts.length > 0) {
          await writeBatches(
            domain.conflicts.map((conflict) => ({
              vault_id: this.vaultId,
              conflict_id: conflict.conflictId,
              conflict_json: JSON.stringify(conflict),
              acknowledged_at: acknowledged.get(conflict.conflictId) ?? null,
              created_at: Date.now(),
            })),
            (rows) => tx.insert(cloudConflicts).values(rows),
          );
        }
        return true;
      });
      return applied;
    } finally {
      if (!applied) await discardUncommittedMediaFiles(created);
    }
  }

  /** Bounded post-restore hydration. Metadata/text remain usable while media waits. */
  async hydratePendingMedia(
    provider: SnapshotProvider,
    limit = 2,
  ): Promise<{ hydrated: number; missing: number }> {
    const pending = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.download_state, 'pending'))
      .limit(limit);
    let hydrated = 0;
    let missing = 0;
    for (const row of pending) {
      if (!row.blob_hash || row.byte_size === null) {
        missing += 1;
        continue;
      }
      const downloaded = await provider.downloadMedia(
        this.vaultId,
        row.blob_hash,
        await this.mediaStore.openDownloadSink(row.blob_hash),
      );
      if (!downloaded) {
        await db
          .update(mediaAssets)
          .set({ download_state: 'missing' })
          .where(eq(mediaAssets.asset_id, row.asset_id));
        missing += 1;
        continue;
      }
      const descriptor: SnapshotMedia = {
        assetId: row.asset_id,
        ownerType: row.owner_type,
        ownerId: row.owner_type === 'profile' ? 'profile' : row.owner_id,
        kind: row.kind,
        blobHash: row.blob_hash,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
        width: row.width,
        height: row.height,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      // The row already exists, so the copied file needs no rollback tracking.
      await serializeMediaFiles(async () => {
        const materialized = await this.materializeDescriptor(descriptor, []);
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
    }
    return { hydrated, missing };
  }

  private async materializeMedia(
    media: readonly SnapshotMedia[],
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
          await verifyLocalMediaFile(existing.local_uri, asset.blobHash, asset.byteSize)
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
    asset: SnapshotMedia,
    created: string[],
  ): Promise<MaterializedMedia> {
    const relativeUri = relativeMediaUri(asset);
    const directoryName = asset.kind === 'voice' ? VOICE_DIRECTORY : PHOTO_DIRECTORY;
    const destination = new File(
      ensureDirectory(directoryName),
      relativeUri.split('/').pop()!,
    );
    if (destination.exists) {
      try {
        const inspected = await inspectLocalMediaFile(destination.uri);
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
