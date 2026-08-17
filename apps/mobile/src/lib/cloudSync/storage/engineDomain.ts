import { and, asc, eq, gt } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import {
  customPrompts,
  db,
  entries,
  entryTags,
  mediaAssets,
  cloudVault,
  syncChangeQueue,
  syncMediaObligations,
  syncRetainedMedia,
  syncProviderState,
  tags,
  userProfile,
} from '~/db';
import type { AssetDescriptor, DomainState, EntityType } from '../domain/types';
import type { SQLiteSyncEngine } from '../engine';
import { createLocalMediaByteSource } from '../media/fileByteSource';
import { shouldAdoptQueuedGeneration } from './queueReconciliation';
import { AssetType, type Asset } from '~/types';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { deleteAllVoiceMemos } from '~/lib/voiceMemoUtils';

function descriptor(row: typeof mediaAssets.$inferSelect): AssetDescriptor {
  return {
    assetId: row.asset_id,
    kind: row.kind,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    // An empty hash deliberately leaves this entity deferred until the media
    // worker fills the normalized hash; it must not publish a text-only state.
    blobHash: row.blob_hash ?? '',
  };
}

export async function readNormalizedDomainState(
  entityType: EntityType,
  entityId: string,
): Promise<DomainState | null> {
  if (entityType === 'entry') {
    const [row] = await db.select().from(entries).where(eq(entries.note_id, entityId)).limit(1);
    if (!row) return null;
    const [assets, relations] = await Promise.all([
      db.select().from(mediaAssets).where(and(
        eq(mediaAssets.owner_type, 'entry'),
        eq(mediaAssets.owner_id, entityId),
      )),
      db.select({ tagId: entryTags.tag_id }).from(entryTags)
        .where(eq(entryTags.note_id, entityId)),
    ]);
    return {
      entityType: 'entry',
      title: row.text_title,
      content: row.text_content,
      mood: row.mood ?? null,
      tagIds: relations.map(({ tagId }) => tagId).sort(),
      assets: assets.map(descriptor).sort((a, b) => a.assetId.localeCompare(b.assetId)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      conflictOriginId: row.conflict_origin_id,
    };
  }
  if (entityType === 'tag') {
    const [row] = await db.select().from(tags).where(eq(tags.tag_id, entityId)).limit(1);
    return row ? {
      entityType: 'tag', title: row.title, createdAt: row.created_at,
      updatedAt: row.updated_at, conflictOriginId: row.conflict_origin_id,
    } : null;
  }
  if (entityType === 'prompt') {
    const [row] = await db.select().from(customPrompts)
      .where(eq(customPrompts.prompt_id, entityId)).limit(1);
    return row ? {
      entityType: 'prompt', title: row.title, createdAt: row.created_at,
      updatedAt: row.updated_at, conflictOriginId: row.conflict_origin_id,
    } : null;
  }
  const [row] = await db.select().from(userProfile).limit(1);
  if (!row) return null;
  const [photo] = row.photo_asset_id
    ? await db.select().from(mediaAssets).where(eq(mediaAssets.asset_id, row.photo_asset_id)).limit(1)
    : [];
  return { entityType: 'profile', displayName: row.display_name, photo: photo ? descriptor(photo) : null };
}

const SEED_TYPES: EntityType[] = ['entry', 'profile', 'prompt', 'tag'];

export async function readNormalizedSeedPage(
  cursor: string | null,
  limit = 50,
): Promise<{
  items: { type: EntityType; id: string; state: DomainState }[];
  isFinalPage: boolean;
}> {
  const separator = cursor?.indexOf(':') ?? -1;
  const cursorType = separator > 0 ? cursor!.slice(0, separator) as EntityType : SEED_TYPES[0];
  const cursorId = separator > 0 ? cursor!.slice(separator + 1) : '';
  const startIndex = Math.max(0, SEED_TYPES.indexOf(cursorType));
  const identities: { type: EntityType; id: string }[] = [];

  for (let index = startIndex; index < SEED_TYPES.length && identities.length < limit; index++) {
    const type = SEED_TYPES[index];
    const after = index === startIndex ? cursorId : '';
    const remaining = limit - identities.length;
    if (type === 'entry') {
      const rows = await db.select({ id: entries.note_id }).from(entries)
        .where(after ? gt(entries.note_id, after) : undefined)
        .orderBy(asc(entries.note_id)).limit(remaining);
      identities.push(...rows.map(({ id }) => ({ type, id })));
      if (rows.length === remaining) break;
    } else if (type === 'profile') {
      const rows = await db.select({ id: userProfile.profile_id }).from(userProfile).limit(1);
      if (rows.length > 0 && 'profile' > after) identities.push({ type, id: 'profile' });
    } else if (type === 'prompt') {
      const rows = await db.select({ id: customPrompts.prompt_id }).from(customPrompts)
        .where(after ? gt(customPrompts.prompt_id, after) : undefined)
        .orderBy(asc(customPrompts.prompt_id)).limit(remaining);
      identities.push(...rows.map(({ id }) => ({ type, id })));
      if (rows.length === remaining) break;
    } else {
      const rows = await db.select({ id: tags.tag_id }).from(tags)
        .where(after ? gt(tags.tag_id, after) : undefined)
        .orderBy(asc(tags.tag_id)).limit(remaining);
      identities.push(...rows.map(({ id }) => ({ type, id })));
      if (rows.length === remaining) break;
    }
  }

  const materialized = await Promise.all(identities.map(async (identity) => ({
    ...identity,
    state: await readNormalizedDomainState(identity.type, identity.id),
  })));
  const items = materialized.filter(
    (item): item is { type: EntityType; id: string; state: DomainState } => item.state !== null,
  );
  // An exact multiple deliberately takes one final empty page. This keeps the
  // query bounded without a second look-ahead query or an in-memory ID list.
  return { items, isFinalPage: identities.length < limit };
}

/** Pulls transactionally-created Phase-1 intents into the durable engine. */
export async function hydrateProductionOutbox(engine: SQLiteSyncEngine): Promise<void> {
  const rows = await db.select().from(syncChangeQueue).orderBy(asc(syncChangeQueue.created_at));
  for (const row of rows) {
    const type = row.entity_type as EntityType;
    const key = `${type}:${row.entity_id}` as
      | `entry:${string}`
      | `tag:${string}`
      | `prompt:${string}`
      | `profile:${string}`;
    const durable = engine.outbox.get(key);
    // The engine checkpoint commits before the structured Phase-1 queue is
    // settled. After a kill in that gap, the queue can therefore contain a
    // stale generation the engine has already published and settled. Never
    // re-adopt it. A genuinely newer transactional edit still wins.
    const shouldAdopt = shouldAdoptQueuedGeneration({
      queuedGeneration: row.generation,
      durableOutboxGeneration: durable?.generation ?? null,
      durableEntityGeneration: engine.generations.get(key) ?? 0,
    });
    if (!shouldAdopt) {
      if (durable && row.action !== 'delete') {
        engine.restoreLocalDomainState(
          type,
          row.entity_id,
          await readNormalizedDomainState(type, row.entity_id),
        );
      }
      continue;
    }
    engine.adoptQueuedMutation({
      entityType: type,
      entityId: row.entity_id,
      action: row.action,
      baseHeads: row.base_head_hashes,
      generation: row.generation,
      batchId: row.batch_id,
      authoredAt: row.created_at,
    }, row.action === 'delete' ? null : await readNormalizedDomainState(type, row.entity_id));
  }
}

export async function registerProductionBlobSources(engine: SQLiteSyncEngine): Promise<void> {
  const [live, retained] = await Promise.all([
    db.select({ uri: mediaAssets.local_uri, hash: mediaAssets.blob_hash }).from(mediaAssets),
    db.select({
      originalUri: syncRetainedMedia.original_uri,
      stagedUri: syncRetainedMedia.staged_uri,
      hash: syncRetainedMedia.blob_hash,
    }).from(syncRetainedMedia),
  ]);
  for (const candidate of [
    ...live.map(({ uri, hash }) => ({ uri, hash })),
    ...retained.map(({ originalUri, stagedUri, hash }) => ({ uri: stagedUri ?? originalUri, hash })),
  ]) {
    if (!candidate.uri || !candidate.hash) continue;
    const source = createLocalMediaByteSource(candidate.uri, candidate.hash);
    if (source) engine.registerBlobSource(candidate.hash, source);
  }
}

/** Hashes a bounded amount of pending media per pass; failures remain durable for retry. */
// Temporary compatibility export for the retained v1 runtime. Protocol v2
// imports its own primitive directly; Bundle V7-5(c2) can therefore delete
// this mixed v1 bridge without removing v2 media hashing.
export { hashPendingProductionMedia } from '../v2/runtime/mediaHashing';

export async function persistProductionEngineResult(
  engine: SQLiteSyncEngine,
  changedEntityKeys: string[],
): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    // The durable store already persisted entity state, versions and conflicts
    // as entity-scoped deltas. Reconcile only the Phase-1 intent rows named by
    // this pass; never rescan or rewrite the vault here.
    for (const key of changedEntityKeys) {
      const separator = key.indexOf(':');
      const entityType = key.slice(0, separator);
      const entityId = key.slice(separator + 1);
      const [row] = await tx.select().from(syncChangeQueue).where(and(
        eq(syncChangeQueue.entity_type, entityType),
        eq(syncChangeQueue.entity_id, entityId),
      )).limit(1);
      if (!row) continue;
      const remaining = engine.outbox.get(key as `${EntityType}:${string}`);
      if (!remaining) {
        await tx.delete(syncChangeQueue).where(and(
          eq(syncChangeQueue.entity_type, row.entity_type),
          eq(syncChangeQueue.entity_id, row.entity_id),
          eq(syncChangeQueue.generation, row.generation),
        ));
      } else {
        await tx.update(syncChangeQueue).set({
          base_head_hashes: remaining.baseHeads,
          generation: remaining.generation,
          updated_at: now,
        }).where(eq(syncChangeQueue.change_id, row.change_id));
      }
    }

    await tx.update(cloudVault).set({
      seeding_checkpoint: engine.seedingCheckpoint,
      status: engine.isRevoked
        ? 'revoked'
        : engine.hasPendingPullWork
          ? 'restoring'
          : engine.outbox.size > 0
            ? 'dirty'
            : 'idle',
      updated_at: now,
    }).where(eq(cloudVault.vault_id, engine.vault.vaultId));
    await tx.insert(syncProviderState).values({
      provider_kind: engine.provider.kind,
      last_success_at: now,
      updated_at: now,
    }).onConflictDoUpdate({
      target: syncProviderState.provider_kind,
      set: { last_success_at: now, error_code: null, updated_at: now },
    });
  });
}

/** Applies the strict journal-deleted outcome without creating fresh outbox intent. */
export async function wipeProductionJournalAfterRevocation(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(entryTags);
    await tx.delete(mediaAssets);
    await tx.delete(entries);
    await tx.delete(tags);
    await tx.delete(customPrompts);
    await tx.delete(userProfile);
    await tx.delete(syncMediaObligations);
    await tx.delete(syncRetainedMedia);
    await tx.delete(syncChangeQueue);
  });
  try { deleteAllPhotos(); } catch { /* The DB wipe remains authoritative. */ }
  try { deleteAllVoiceMemos(); } catch { /* The DB wipe remains authoritative. */ }
}

/** Materializes only CAS-approved engine heads into the normalized/UI read model. */
export async function materializeProductionDomain(
  engine: SQLiteSyncEngine,
  appliedEntityKeys: string[],
): Promise<void> {
  const now = Date.now();
  const keys = [...appliedEntityKeys].sort((left, right) => {
    const rank = (key: string) => key.startsWith('tag:') ? 0 : key.startsWith('prompt:') ? 1 : key.startsWith('profile:') ? 2 : 3;
    return rank(left) - rank(right) || left.localeCompare(right);
  });
  await db.transaction(async (tx) => {
    for (const key of keys) {
      // Apply CAS left this entity dirty: its newer local domain row wins.
      if (engine.outbox.has(key as `${EntityType}:${string}`)) continue;
      const separator = key.indexOf(':');
      const type = key.slice(0, separator) as EntityType;
      const id = key.slice(separator + 1);
      const state = engine.domain.get(key as `${EntityType}:${string}`);
      if (!state) {
        if (type === 'entry') {
          const existingAssets = await tx.select().from(mediaAssets).where(and(
            eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, id),
          ));
          for (const removed of existingAssets) {
            if (!removed.local_uri) continue;
            const ledgerId = randomUUID();
            await tx.insert(syncRetainedMedia).values({
              ledger_id: ledgerId, asset_id: removed.asset_id,
              original_owner_type: removed.owner_type, original_owner_id: removed.owner_id,
              original_uri: removed.local_uri, staged_uri: null, kind: removed.kind,
              mime_type: removed.mime_type, byte_size: removed.byte_size,
              blob_hash: removed.blob_hash, state: 'uploaded', attempt_count: 0,
              last_error_code: null, delete_after: null, created_at: now, updated_at: now,
            });
            await tx.insert(syncMediaObligations).values({
              obligation_id: randomUUID(), ledger_id: ledgerId,
              blob_hash: removed.blob_hash, obligation_kind: 'remote-apply',
              obligation_key: key, completed_at: now, created_at: now,
            });
          }
          await tx.delete(entryTags).where(eq(entryTags.note_id, id));
          await tx.delete(mediaAssets).where(and(
            eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, id),
          ));
          await tx.delete(entries).where(eq(entries.note_id, id));
        } else if (type === 'tag') {
          await tx.delete(entryTags).where(eq(entryTags.tag_id, id));
          await tx.delete(tags).where(eq(tags.tag_id, id));
        } else if (type === 'prompt') {
          await tx.delete(customPrompts).where(eq(customPrompts.prompt_id, id));
        }
        continue;
      }

      if (state.entityType === 'tag') {
        await tx.insert(tags).values({
          tag_id: id, title: state.title, conflict_origin_id: state.conflictOriginId,
          created_at: state.createdAt, updated_at: state.updatedAt,
        }).onConflictDoUpdate({ target: tags.tag_id, set: {
          title: state.title, conflict_origin_id: state.conflictOriginId,
          updated_at: state.updatedAt,
        }});
      } else if (state.entityType === 'prompt') {
        await tx.insert(customPrompts).values({
          prompt_id: id, title: state.title, conflict_origin_id: state.conflictOriginId,
          created_at: state.createdAt, updated_at: state.updatedAt,
        }).onConflictDoUpdate({ target: customPrompts.prompt_id, set: {
          title: state.title, conflict_origin_id: state.conflictOriginId,
          updated_at: state.updatedAt,
        }});
      } else if (state.entityType === 'profile') {
        const [priorProfile] = await tx.select().from(userProfile).limit(1);
        const [priorPhoto] = priorProfile?.photo_asset_id
          ? await tx.select().from(mediaAssets)
              .where(eq(mediaAssets.asset_id, priorProfile.photo_asset_id)).limit(1)
          : [];
        const photoIsReplaced = priorPhoto && (
          !state.photo
          || priorPhoto.asset_id !== state.photo.assetId
          || priorPhoto.blob_hash !== state.photo.blobHash
        );
        if (photoIsReplaced && priorPhoto.local_uri) {
          const ledgerId = randomUUID();
          await tx.insert(syncRetainedMedia).values({
            ledger_id: ledgerId, asset_id: priorPhoto.asset_id,
            original_owner_type: priorPhoto.owner_type, original_owner_id: priorPhoto.owner_id,
            original_uri: priorPhoto.local_uri, staged_uri: null, kind: priorPhoto.kind,
            mime_type: priorPhoto.mime_type, byte_size: priorPhoto.byte_size,
            blob_hash: priorPhoto.blob_hash, state: 'uploaded', attempt_count: 0,
            last_error_code: null, delete_after: null, created_at: now, updated_at: now,
          });
          await tx.insert(syncMediaObligations).values({
            obligation_id: randomUUID(), ledger_id: ledgerId,
            blob_hash: priorPhoto.blob_hash, obligation_kind: 'remote-apply',
            obligation_key: key, completed_at: now, created_at: now,
          });
        }
        let photoAssetId: string | null = null;
        if (state.photo) {
          photoAssetId = state.photo.assetId;
          const [prior] = await tx.select().from(mediaAssets)
            .where(eq(mediaAssets.asset_id, photoAssetId)).limit(1);
          await tx.insert(mediaAssets).values({
            asset_id: photoAssetId, owner_type: 'profile', owner_id: 'self',
            kind: 'profile-photo', local_uri: prior?.blob_hash === state.photo.blobHash ? prior.local_uri : null,
            download_state: prior?.blob_hash === state.photo.blobHash && prior.local_uri ? 'verified' : 'pending',
            mime_type: state.photo.mimeType, byte_size: state.photo.byteSize,
            width: state.photo.width, height: state.photo.height,
            duration_ms: state.photo.durationMs, blob_hash: state.photo.blobHash,
            created_at: prior?.created_at ?? now, updated_at: now, pending_local_delete_at: null,
          }).onConflictDoUpdate({ target: mediaAssets.asset_id, set: {
            owner_type: 'profile', owner_id: 'self', kind: 'profile-photo',
            local_uri: prior?.blob_hash === state.photo.blobHash ? prior.local_uri : null,
            download_state: prior?.blob_hash === state.photo.blobHash && prior.local_uri ? 'verified' : 'pending',
            mime_type: state.photo.mimeType, byte_size: state.photo.byteSize,
            width: state.photo.width, height: state.photo.height,
            duration_ms: state.photo.durationMs, blob_hash: state.photo.blobHash, updated_at: now,
          }});
        }
        if (priorPhoto && priorPhoto.asset_id !== photoAssetId) {
          await tx.delete(mediaAssets).where(eq(mediaAssets.asset_id, priorPhoto.asset_id));
        }
        await tx.insert(userProfile).values({
          profile_id: 'self', display_name: state.displayName,
          photo_asset_id: photoAssetId, email: priorProfile?.email ?? null, updated_at: now,
        }).onConflictDoUpdate({ target: userProfile.profile_id, set: {
          display_name: state.displayName, photo_asset_id: photoAssetId, updated_at: now,
        }});
      } else {
        const existingAssets = await tx.select().from(mediaAssets).where(and(
          eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, id),
        ));
        const existingById = new Map(existingAssets.map((asset) => [asset.asset_id, asset]));
        const legacyAssets: Asset[] = [];
        for (const asset of state.assets) {
          const prior = existingById.get(asset.assetId);
          const localUri = prior?.blob_hash === asset.blobHash ? prior.local_uri : null;
          if (localUri) legacyAssets.push({
            type: asset.kind === 'voice' ? AssetType.AUDIO : AssetType.IMAGE,
            uri: localUri, assetId: asset.assetId, blobHash: asset.blobHash,
            mimeType: asset.mimeType ?? undefined, byteSize: asset.byteSize ?? undefined,
            width: asset.width ?? undefined, height: asset.height ?? undefined,
            durationMs: asset.durationMs ?? undefined,
          });
          await tx.insert(mediaAssets).values({
            asset_id: asset.assetId, owner_type: 'entry', owner_id: id,
            kind: asset.kind === 'profile-photo' ? 'photo' : asset.kind,
            local_uri: localUri, download_state: localUri ? 'verified' : 'pending',
            mime_type: asset.mimeType, byte_size: asset.byteSize,
            width: asset.width, height: asset.height, duration_ms: asset.durationMs,
            blob_hash: asset.blobHash, created_at: prior?.created_at ?? now,
            updated_at: now, pending_local_delete_at: null,
          }).onConflictDoUpdate({ target: mediaAssets.asset_id, set: {
            owner_type: 'entry', owner_id: id,
            kind: asset.kind === 'profile-photo' ? 'photo' : asset.kind,
            local_uri: localUri, download_state: localUri ? 'verified' : 'pending',
            mime_type: asset.mimeType, byte_size: asset.byteSize,
            width: asset.width, height: asset.height, duration_ms: asset.durationMs,
            blob_hash: asset.blobHash, updated_at: now,
          }});
          existingById.delete(asset.assetId);
        }
        // Keep removed bytes physically present; a durable completed obligation
        // lets the normal retained-media policy reap them safely later.
        for (const removed of existingById.values()) {
          if (removed.local_uri) {
            const ledgerId = randomUUID();
            await tx.insert(syncRetainedMedia).values({
              ledger_id: ledgerId, asset_id: removed.asset_id,
              original_owner_type: removed.owner_type, original_owner_id: removed.owner_id,
              original_uri: removed.local_uri, staged_uri: null, kind: removed.kind,
              mime_type: removed.mime_type, byte_size: removed.byte_size,
              blob_hash: removed.blob_hash, state: 'uploaded', attempt_count: 0,
              last_error_code: null, delete_after: null, created_at: now, updated_at: now,
            });
            await tx.insert(syncMediaObligations).values({
              obligation_id: randomUUID(), ledger_id: ledgerId, blob_hash: removed.blob_hash,
              obligation_kind: 'remote-apply', obligation_key: key,
              completed_at: now, created_at: now,
            });
          }
          await tx.delete(mediaAssets).where(eq(mediaAssets.asset_id, removed.asset_id));
        }
        await tx.insert(entries).values({
          note_id: id, text_title: state.title, text_content: state.content,
          mood: state.mood as typeof entries.$inferInsert['mood'], assets: legacyAssets,
          tags: state.tagIds.join(','), conflict_origin_id: state.conflictOriginId,
          created_at: state.createdAt, updated_at: state.updatedAt,
        }).onConflictDoUpdate({ target: entries.note_id, set: {
          text_title: state.title, text_content: state.content,
          mood: state.mood as typeof entries.$inferInsert['mood'], assets: legacyAssets,
          tags: state.tagIds.join(','), conflict_origin_id: state.conflictOriginId,
          updated_at: state.updatedAt,
        }});
        await tx.delete(entryTags).where(eq(entryTags.note_id, id));
        if (state.tagIds.length > 0) {
          const existingTags = await tx.select({ id: tags.tag_id }).from(tags);
          const valid = new Set(existingTags.map(({ id: tagId }) => tagId));
          const relations = state.tagIds.filter((tagId) => valid.has(tagId));
          if (relations.length > 0) await tx.insert(entryTags).values(relations.map((tagId) => ({
            note_id: id, tag_id: tagId, created_at: now, updated_at: now,
          })));
        }
      }
    }
  });
}
