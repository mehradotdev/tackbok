import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  cloudV2Conflicts,
  cloudV2SyncState,
  cloudV2Tombstones,
  customPrompts,
  db,
  entries,
  entryTags,
  mediaAssets,
  syncMediaObligations,
  syncRetainedMedia,
  tags,
  userProfile,
} from '~/db';
import { AssetType, type Asset } from '~/types';
import { sha256BytesV2, sha256TextV2 } from '../sha256';
import type {
  SnapshotConflictV2,
  SnapshotDomainV2,
  SnapshotMediaV2,
} from '../types';
import type {
  CapturedJournalV2,
  SnapshotV2Provider,
  SnapshotV2JournalStore,
  SnapshotV2MediaStore,
} from '../sync/types';
import { V2LocalStorageError } from '../sync/types';

const STAGING_DIRECTORY = 'cloud-sync-v2-media';
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

function ensureDirectory(name: string): Directory {
  const directory = new Directory(Paths.document, name);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function stageFile(blobHash: string): File {
  return new File(ensureDirectory(STAGING_DIRECTORY), `${blobHash}.bin`);
}

function parseConflict(value: string): SnapshotConflictV2 {
  const parsed = JSON.parse(value) as SnapshotConflictV2;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.conflictId !== 'string') {
    throw new V2LocalStorageError('local-storage-full', 'invalid-local-conflict-record');
  }
  return parsed;
}

function legacyAsset(
  descriptor: SnapshotMediaV2,
  uri: string,
): Asset {
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

interface MaterializedMediaV2 {
  uri: string;
  verified: boolean;
}

function relativeMediaUri(asset: SnapshotMediaV2): string {
  const directoryName = asset.kind === 'voice' ? VOICE_DIRECTORY : PHOTO_DIRECTORY;
  const extension = asset.kind === 'voice' ? 'm4a' : 'jpg';
  return `${directoryName}/v2-${sha256TextV2(asset.assetId)}-${asset.blobHash}.${extension}`;
}

/** File-backed media cache shared by the v2 engine and normalized journal apply. */
export class ProductionSnapshotV2MediaStore implements SnapshotV2MediaStore {
  async hasVerified(blobHash: string): Promise<boolean> {
    if (stageFile(blobHash).exists) return true;
    const [live, retained] = await Promise.all([
      db.select({ uri: mediaAssets.local_uri }).from(mediaAssets)
        .where(eq(mediaAssets.blob_hash, blobHash)),
      db.select({ original: syncRetainedMedia.original_uri, staged: syncRetainedMedia.staged_uri })
        .from(syncRetainedMedia).where(eq(syncRetainedMedia.blob_hash, blobHash)),
    ]);
    return live.some(({ uri }) => fileExists(uri)) ||
      retained.some(({ original, staged }) => fileExists(staged ?? original));
  }

  async readVerified(blobHash: string): Promise<Uint8Array | null> {
    const staged = stageFile(blobHash);
    if (staged.exists) {
      const bytes = await staged.bytes();
      return sha256BytesV2(bytes) === blobHash ? bytes : null;
    }
    const [live, retained] = await Promise.all([
      db.select({ uri: mediaAssets.local_uri }).from(mediaAssets)
        .where(eq(mediaAssets.blob_hash, blobHash)),
      db.select({ original: syncRetainedMedia.original_uri, staged: syncRetainedMedia.staged_uri })
        .from(syncRetainedMedia).where(eq(syncRetainedMedia.blob_hash, blobHash)),
    ]);
    for (const uri of [
      ...live.map((row) => row.uri),
      ...retained.map((row) => row.staged ?? row.original),
    ]) {
      if (!fileExists(uri)) continue;
      const bytes = await fileForLocalUri(uri).bytes();
      if (sha256BytesV2(bytes) === blobHash) return bytes;
    }
    return null;
  }

  async writeVerified(blobHash: string, bytes: Uint8Array): Promise<void> {
    if (sha256BytesV2(bytes) !== blobHash) {
      throw new V2LocalStorageError('local-media-unreadable', 'downloaded-media-hash-mismatch');
    }
    try {
      stageFile(blobHash).write(bytes);
    } catch {
      throw new V2LocalStorageError('local-storage-full', 'media-staging-write-failed');
    }
  }

  stagedFile(blobHash: string): File | null {
    const file = stageFile(blobHash);
    return file.exists ? file : null;
  }
}

/** Complete-state normalized journal adapter used only by the production v2 runtime. */
export class ProductionSnapshotV2JournalStore implements SnapshotV2JournalStore {
  constructor(
    private readonly vaultId: string,
    private readonly deviceId: string,
    private readonly mediaStore: ProductionSnapshotV2MediaStore,
  ) {}

  async capture(): Promise<CapturedJournalV2> {
    return db.transaction(async (tx) => {
      const [state] = await tx.select().from(cloudV2SyncState).where(and(
        eq(cloudV2SyncState.vault_id, this.vaultId),
        eq(cloudV2SyncState.device_id, this.deviceId),
      )).limit(1);
      if (!state) {
        throw new V2LocalStorageError(
          'normalized-model-not-ready',
          'protocol-v2-state-not-initialized',
        );
      }

      const entryRows = await tx.select().from(entries);
      const tagRows = await tx.select().from(tags);
      const relationRows = await tx.select().from(entryTags);
      const promptRows = await tx.select().from(customPrompts);
      const mediaRows = await tx.select().from(mediaAssets);
      const [profileRow] = await tx.select().from(userProfile).limit(1);
      const tombstoneRows = await tx.select().from(cloudV2Tombstones)
        .where(eq(cloudV2Tombstones.vault_id, this.vaultId));
      const conflictRows = await tx.select().from(cloudV2Conflicts)
        .where(eq(cloudV2Conflicts.vault_id, this.vaultId));

      const media = mediaRows.map((row): SnapshotMediaV2 => {
        if (!row.blob_hash || row.byte_size === null) {
          throw new V2LocalStorageError(
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

      return {
        generation: state.journal_generation,
        domain: {
          entries: entryRows.map((row) => ({
            entryId: row.note_id,
            title: row.text_title,
            content: row.text_content,
            mood: row.mood ?? null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            conflictOriginId: row.conflict_origin_id,
          })).sort((left, right) => left.entryId.localeCompare(right.entryId)),
          tags: tagRows.map((row) => ({
            tagId: row.tag_id,
            title: row.title,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            conflictOriginId: row.conflict_origin_id,
          })).sort((left, right) => left.tagId.localeCompare(right.tagId)),
          entryTags: relationRows.map((row) => ({
            entryId: row.note_id,
            tagId: row.tag_id,
            createdAt: row.created_at,
          })).sort((left, right) =>
            left.entryId.localeCompare(right.entryId) || left.tagId.localeCompare(right.tagId)),
          prompts: promptRows.map((row) => ({
            promptId: row.prompt_id,
            title: row.title,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            conflictOriginId: row.conflict_origin_id,
          })).sort((left, right) => left.promptId.localeCompare(right.promptId)),
          profile: {
            profileId: 'profile',
            displayName: profileRow?.display_name ?? null,
            photoAssetId: profileRow?.photo_asset_id ?? null,
            updatedAt: profileRow?.updated_at ?? 0,
          },
          media: media.sort((left, right) => left.assetId.localeCompare(right.assetId)),
          tombstones: tombstoneRows.map((row) => ({
            entityType: row.entity_type,
            entityId: row.entity_id,
            baseStateHash: row.base_state_hash,
            deletedStateHash: row.deleted_state_hash,
            deletedByDeviceId: row.deleted_by_device_id,
            deletionSequence: row.deletion_sequence,
          })).sort((left, right) =>
            left.entityType.localeCompare(right.entityType) ||
            left.entityId.localeCompare(right.entityId)),
          conflicts: conflictRows.map((row) => parseConflict(row.conflict_json))
            .sort((left, right) => left.conflictId.localeCompare(right.conflictId)),
        },
      };
    });
  }

  async applyMergedIfGeneration(
    domain: SnapshotDomainV2,
    expectedGeneration: number,
  ): Promise<boolean> {
    const materializedUris = await this.materializeMedia(domain.media);
    return db.transaction(async (tx) => {
      const [state] = await tx.select({ generation: cloudV2SyncState.journal_generation })
        .from(cloudV2SyncState).where(and(
          eq(cloudV2SyncState.vault_id, this.vaultId),
          eq(cloudV2SyncState.device_id, this.deviceId),
        )).limit(1);
      if (!state || state.generation !== expectedGeneration) return false;

      const [priorProfile] = await tx.select().from(userProfile).limit(1);
      const priorMedia = await tx.select().from(mediaAssets);
      const acknowledged = new Map((await tx.select().from(cloudV2Conflicts)
        .where(eq(cloudV2Conflicts.vault_id, this.vaultId)))
        .map((row) => [row.conflict_id, row.acknowledged_at]));

      // A remote apply is a complete-state replacement. Preserve every local
      // file whose exact descriptor is no longer referenced before deleting
      // its normalized row. The completed obligation records that the
      // head-advanced snapshot made the removal durable; the ordinary reaper
      // remains the only code allowed to unlink the file later.
      const retainedIdentities = new Set(domain.media.map((asset) =>
        `${asset.assetId}\0${asset.blobHash}`));
      const appliedAt = Date.now();
      for (const asset of priorMedia) {
        if (!asset.local_uri || retainedIdentities.has(
          `${asset.asset_id}\0${asset.blob_hash ?? ''}`,
        )) continue;
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
          obligation_kind: 'remote-apply-v2',
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
      await tx.delete(cloudV2Tombstones)
        .where(eq(cloudV2Tombstones.vault_id, this.vaultId));
      await tx.delete(cloudV2Conflicts)
        .where(eq(cloudV2Conflicts.vault_id, this.vaultId));

      if (domain.tags.length > 0) await tx.insert(tags).values(domain.tags.map((tag) => ({
        tag_id: tag.tagId,
        title: tag.title,
        conflict_origin_id: tag.conflictOriginId,
        created_at: tag.createdAt,
        updated_at: tag.updatedAt,
      })));
      if (domain.prompts.length > 0) {
        await tx.insert(customPrompts).values(domain.prompts.map((prompt) => ({
          prompt_id: prompt.promptId,
          title: prompt.title,
          conflict_origin_id: prompt.conflictOriginId,
          created_at: prompt.createdAt,
          updated_at: prompt.updatedAt,
        })));
      }

      const mediaByOwner = new Map<string, SnapshotMediaV2[]>();
      for (const asset of domain.media) {
        const key = `${asset.ownerType}\0${asset.ownerId}`;
        const values = mediaByOwner.get(key) ?? [];
        values.push(asset);
        mediaByOwner.set(key, values);
      }
      if (domain.entries.length > 0) await tx.insert(entries).values(domain.entries.map((entry) => {
        const assets = (mediaByOwner.get(`entry\0${entry.entryId}`) ?? [])
          .map((asset) => legacyAsset(asset, materializedUris.get(asset.assetId)!.uri));
        const tagIds = domain.entryTags.filter((relation) => relation.entryId === entry.entryId)
          .map((relation) => relation.tagId).sort();
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
      }));

      if (domain.media.length > 0) await tx.insert(mediaAssets).values(domain.media.map((asset) => ({
        asset_id: asset.assetId,
        owner_type: asset.ownerType,
        owner_id: asset.ownerType === 'profile' ? 'self' : asset.ownerId,
        kind: asset.kind,
        local_uri: materializedUris.get(asset.assetId)!.uri,
        download_state: materializedUris.get(asset.assetId)!.verified
          ? 'verified' as const
          : 'pending' as const,
        mime_type: asset.mimeType,
        byte_size: asset.byteSize,
        width: asset.width,
        height: asset.height,
        duration_ms: asset.durationMs,
        blob_hash: asset.blobHash,
        created_at: asset.createdAt,
        updated_at: asset.updatedAt,
        pending_local_delete_at: null,
      })));
      if (domain.entryTags.length > 0) await tx.insert(entryTags).values(
        domain.entryTags.map((relation) => ({
          note_id: relation.entryId,
          tag_id: relation.tagId,
          created_at: relation.createdAt,
          updated_at: relation.createdAt,
        })),
      );
      await tx.insert(userProfile).values({
        profile_id: 'self',
        display_name: domain.profile.displayName,
        photo_asset_id: domain.profile.photoAssetId,
        email: priorProfile?.email ?? null,
        updated_at: domain.profile.updatedAt,
      });
      if (domain.tombstones.length > 0) {
        await tx.insert(cloudV2Tombstones).values(domain.tombstones.map((value) => ({
          vault_id: this.vaultId,
          entity_type: value.entityType,
          entity_id: value.entityId,
          base_state_hash: value.baseStateHash,
          deleted_state_hash: value.deletedStateHash,
          deleted_by_device_id: value.deletedByDeviceId,
          deletion_sequence: value.deletionSequence,
          updated_at: Date.now(),
        })));
      }
      if (domain.conflicts.length > 0) {
        await tx.insert(cloudV2Conflicts).values(domain.conflicts.map((conflict) => ({
          vault_id: this.vaultId,
          conflict_id: conflict.conflictId,
          conflict_json: JSON.stringify(conflict),
          acknowledged_at: acknowledged.get(conflict.conflictId) ?? null,
          created_at: Date.now(),
        })));
      }
      return true;
    });
  }

  /** Bounded post-restore hydration. Metadata/text remain usable while media waits. */
  async hydratePendingMedia(
    provider: SnapshotV2Provider,
    limit = 2,
  ): Promise<{ hydrated: number; missing: number }> {
    const pending = await db.select().from(mediaAssets)
      .where(eq(mediaAssets.download_state, 'pending')).limit(limit);
    let hydrated = 0;
    let missing = 0;
    for (const row of pending) {
      if (!row.blob_hash) {
        missing += 1;
        continue;
      }
      const bytes = await provider.downloadMedia(this.vaultId, row.blob_hash);
      if (!bytes || sha256BytesV2(bytes) !== row.blob_hash) {
        await db.update(mediaAssets).set({ download_state: 'missing' })
          .where(eq(mediaAssets.asset_id, row.asset_id));
        missing += 1;
        continue;
      }
      await this.mediaStore.writeVerified(row.blob_hash, bytes);
      const descriptor: SnapshotMediaV2 = {
        assetId: row.asset_id,
        ownerType: row.owner_type,
        ownerId: row.owner_type === 'profile' ? 'profile' : row.owner_id,
        kind: row.kind,
        blobHash: row.blob_hash,
        mimeType: row.mime_type,
        byteSize: row.byte_size ?? bytes.byteLength,
        width: row.width,
        height: row.height,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      const materialized = await this.materializeDescriptor(descriptor);
      await db.update(mediaAssets).set({
        local_uri: materialized.uri,
        download_state: 'verified',
      }).where(and(
        eq(mediaAssets.asset_id, row.asset_id),
        eq(mediaAssets.blob_hash, row.blob_hash),
      ));
      hydrated += 1;
    }
    return { hydrated, missing };
  }

  private async materializeMedia(
    media: readonly SnapshotMediaV2[],
  ): Promise<Map<string, MaterializedMediaV2>> {
    const existingRows = await db.select().from(mediaAssets);
    const byIdentity = new Map(existingRows.map((row) => [
      `${row.asset_id}\0${row.blob_hash ?? ''}`,
      row.local_uri,
    ]));
    const result = new Map<string, MaterializedMediaV2>();
    for (const asset of media) {
      const existing = byIdentity.get(`${asset.assetId}\0${asset.blobHash}`) ?? null;
      if (fileExists(existing)) {
        result.set(asset.assetId, { uri: existing, verified: true });
        continue;
      }
      result.set(asset.assetId, await this.materializeDescriptor(asset));
    }
    return result;
  }

  private async materializeDescriptor(asset: SnapshotMediaV2): Promise<MaterializedMediaV2> {
      const relativeUri = relativeMediaUri(asset);
      const staged = this.mediaStore.stagedFile(asset.blobHash);
      if (!staged) {
        return { uri: relativeUri, verified: false };
      }
      const directoryName = asset.kind === 'voice' ? VOICE_DIRECTORY : PHOTO_DIRECTORY;
      const destination = new File(ensureDirectory(directoryName), relativeUri.split('/').pop()!);
      try {
        if (!destination.exists) await staged.copy(destination);
      } catch {
        throw new V2LocalStorageError('local-storage-full', 'media-materialization-failed');
      }
      return { uri: relativeUri, verified: true };
  }
}
