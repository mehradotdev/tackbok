import { and, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import {
  cloudSyncMigrationItems,
  cloudSyncState,
  cloudTombstones,
  cloudVault,
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
  type Entry,
  type NewEntry,
} from '~/db';
import { AssetType, type Asset } from '~/types';
import { sanitizePromptTitle, sanitizeTagName } from '~/lib/utils';
import { notifyCloudSyncMutationCommitted } from '../runtime/mutationSignal';
import { canonicalHashV2 } from '../snapshot/canonical';
import type { SnapshotEntryV2, SnapshotPromptV2, SnapshotTagV2 } from '../snapshot/types';

export const PROFILE_ROW_ID = 'self';
export const PROFILE_ENTITY_ID = 'profile';
export const NORMALIZED_MODEL_MIGRATION_ID = 'normalized-model-v1';

export type SyncEntityType = 'entry' | 'tag' | 'prompt' | 'profile';
export type MutationOrigin = 'local' | 'remote' | 'migration';

export interface MutationContext {
  origin?: MutationOrigin;
  batchId?: string | null;
  now?: number;
  createdAt?: number;
  /** Canonical snapshot entity hash captured before a local delete. */
  deletedStateHash?: string | null;
}

export type CloudSyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function parseTagIds(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function assetKind(asset: Asset): 'photo' | 'voice' {
  return asset.type === AssetType.IMAGE ? 'photo' : 'voice';
}

function defaultMimeType(asset: Asset): string {
  return asset.type === AssetType.IMAGE ? 'image/jpeg' : 'audio/mp4';
}

async function markNormalized(
  tx: CloudSyncTransaction,
  entityType: SyncEntityType,
  entityId: string,
  now: number,
): Promise<void> {
  await tx
    .insert(cloudSyncMigrationItems)
    .values({ entity_type: entityType, entity_id: entityId, normalized_at: now })
    .onConflictDoUpdate({
      target: [cloudSyncMigrationItems.entity_type, cloudSyncMigrationItems.entity_id],
      set: { normalized_at: now },
    });
}

/**
 * Advances the snapshot journal generation for an active cloud vault.
 * Offline/local-only journals need no queue row: their complete normalized
 * state is captured when a cloud vault is later connected.
 */
export async function enqueueMutation(
  tx: CloudSyncTransaction,
  entityType: SyncEntityType,
  entityId: string,
  action: 'upsert' | 'delete',
  context: MutationContext = {},
): Promise<{ changeId: string; generation: number }> {
  const now = context.now ?? Date.now();

  const [v2Vault] = await tx
    .select({
      vaultId: cloudVault.vault_id,
      deviceId: cloudVault.device_id,
      status: cloudVault.status,
    })
    .from(cloudVault)
    .where(notInArray(cloudVault.status, ['disabled', 'revoked']))
    .limit(1);

  if (v2Vault) {
    await tx.insert(cloudSyncState).values({
      vault_id: v2Vault.vaultId,
      device_id: v2Vault.deviceId,
      journal_generation: 0,
      settled_generation: 0,
      next_device_sequence: 1,
      updated_at: now,
    }).onConflictDoNothing();
    await tx.update(cloudSyncState).set({
      journal_generation: sql`${cloudSyncState.journal_generation} + 1`,
      updated_at: now,
    }).where(and(
      eq(cloudSyncState.vault_id, v2Vault.vaultId),
      eq(cloudSyncState.device_id, v2Vault.deviceId),
    ));
    const [state] = await tx.select({ generation: cloudSyncState.journal_generation })
      .from(cloudSyncState)
      .where(and(
        eq(cloudSyncState.vault_id, v2Vault.vaultId),
        eq(cloudSyncState.device_id, v2Vault.deviceId),
      ))
      .limit(1);
    if (!state) throw new Error('Failed to advance snapshot journal generation');

    if (action === 'delete') {
      await tx.insert(cloudTombstones).values({
        vault_id: v2Vault.vaultId,
        entity_type: entityType,
        entity_id: entityId,
        base_state_hash: null,
        deleted_state_hash: context.deletedStateHash ?? null,
        deleted_by_device_id: v2Vault.deviceId,
        deletion_sequence: state.generation,
        updated_at: now,
      }).onConflictDoUpdate({
        target: [
          cloudTombstones.vault_id,
          cloudTombstones.entity_type,
          cloudTombstones.entity_id,
        ],
        set: {
          base_state_hash: null,
          deleted_state_hash: context.deletedStateHash ?? null,
          deleted_by_device_id: v2Vault.deviceId,
          deletion_sequence: state.generation,
          updated_at: now,
        },
      });
    } else {
      await tx.delete(cloudTombstones).where(and(
        eq(cloudTombstones.vault_id, v2Vault.vaultId),
        eq(cloudTombstones.entity_type, entityType),
        eq(cloudTombstones.entity_id, entityId),
      ));
    }
    if (v2Vault.status !== 'paused' && v2Vault.status !== 'restoring') {
      await tx.update(cloudVault).set({ status: 'dirty', updated_at: now })
        .where(eq(cloudVault.vault_id, v2Vault.vaultId));
    }
    return { changeId: randomUUID(), generation: state.generation };
  }

  return { changeId: randomUUID(), generation: 0 };
}

async function retainMediaRow(
  tx: CloudSyncTransaction,
  asset: typeof mediaAssets.$inferSelect,
  obligationKey: string,
  now: number,
): Promise<void> {
  if (!asset.local_uri) return;
  const ledgerId = randomUUID();
  await tx.insert(syncRetainedMedia).values({
    ledger_id: ledgerId,
    asset_id: asset.asset_id,
    original_owner_type: asset.owner_type,
    original_owner_id: asset.owner_id,
    original_uri: asset.local_uri,
    kind: asset.kind,
    mime_type: asset.mime_type,
    byte_size: asset.byte_size,
    blob_hash: asset.blob_hash,
    state: 'recorded',
    attempt_count: 0,
    created_at: now,
    updated_at: now,
  });
  await tx.insert(syncMediaObligations).values({
    obligation_id: randomUUID(),
    ledger_id: ledgerId,
    blob_hash: asset.blob_hash,
    obligation_kind: 'outbox',
    obligation_key: obligationKey,
    created_at: now,
  });
}

async function replaceEntryAssets(
  tx: CloudSyncTransaction,
  noteId: string,
  assets: Asset[] | null | undefined,
  now: number,
): Promise<void> {
  if (assets === undefined) return;
  const existing = await tx
    .select()
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)),
    );
  const unused = new Map(existing.map((asset) => [asset.local_uri, asset]));
  const existingById = new Map(existing.map((asset) => [asset.asset_id, asset]));
  const desiredIds: string[] = [];

  for (const asset of assets ?? []) {
    const requestedId = asset.assetId ?? randomUUID();
    const [requestedAsset] = await tx.select().from(mediaAssets)
      .where(eq(mediaAssets.asset_id, requestedId)).limit(1);
    const requestedIdBelongsElsewhere = requestedAsset &&
      (requestedAsset.owner_type !== 'entry' || requestedAsset.owner_id !== noteId);
    const prior = unused.get(asset.uri) ?? existingById.get(requestedId);
    if (prior) unused.delete(prior.local_uri);
    const assetId = prior?.asset_id ?? (requestedIdBelongsElsewhere ? randomUUID() : requestedId);
    desiredIds.push(assetId);
    await tx
      .insert(mediaAssets)
      .values({
        asset_id: assetId,
        owner_type: 'entry',
        owner_id: noteId,
        kind: assetKind(asset),
        local_uri: asset.uri,
        download_state: 'n/a',
        mime_type: asset.mimeType ?? prior?.mime_type ?? defaultMimeType(asset),
        byte_size: asset.byteSize ?? prior?.byte_size ?? null,
        width: asset.width ?? prior?.width ?? null,
        height: asset.height ?? prior?.height ?? null,
        duration_ms: asset.durationMs ?? prior?.duration_ms ?? null,
        blob_hash: asset.blobHash ?? prior?.blob_hash ?? null,
        created_at: prior?.created_at ?? now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: mediaAssets.asset_id,
        set: {
          local_uri: asset.uri,
          kind: assetKind(asset),
          mime_type: asset.mimeType ?? prior?.mime_type ?? defaultMimeType(asset),
          byte_size: asset.byteSize ?? prior?.byte_size ?? null,
          width: asset.width ?? prior?.width ?? null,
          height: asset.height ?? prior?.height ?? null,
          duration_ms: asset.durationMs ?? prior?.duration_ms ?? null,
          blob_hash: asset.blobHash ?? prior?.blob_hash ?? null,
          updated_at: now,
          pending_local_delete_at: null,
        },
      });
  }

  for (const removed of unused.values()) {
    await retainMediaRow(tx, removed, `entry:${noteId}`, now);
  }

  if (desiredIds.length > 0) {
    await tx
      .delete(mediaAssets)
      .where(
        and(
          eq(mediaAssets.owner_type, 'entry'),
          eq(mediaAssets.owner_id, noteId),
          notInArray(mediaAssets.asset_id, desiredIds),
        ),
      );
  } else {
    await tx
      .delete(mediaAssets)
      .where(
        and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)),
      );
  }
}

async function replaceEntryTags(
  tx: CloudSyncTransaction,
  noteId: string,
  tagCsv: string | null | undefined,
  now: number,
): Promise<void> {
  const tagIds = parseTagIds(tagCsv);
  await tx.delete(entryTags).where(eq(entryTags.note_id, noteId));
  if (tagIds.length === 0) return;

  const validTags = await tx
    .select({ tag_id: tags.tag_id })
    .from(tags)
    .where(inArray(tags.tag_id, tagIds));
  if (validTags.length > 0) {
    await tx.insert(entryTags).values(
      validTags.map(({ tag_id }) => ({
        note_id: noteId,
        tag_id,
        created_at: now,
        updated_at: now,
      })),
    );
  }
}

/** Normalizes legacy fields without changing the domain row or enqueueing sync. */
export async function normalizeLegacyEntryInTransaction(
  tx: CloudSyncTransaction,
  entry: Entry,
  now = Date.now(),
): Promise<void> {
  await replaceEntryAssets(tx, entry.note_id, entry.assets, now);
  await replaceEntryTags(tx, entry.note_id, entry.tags, now);
  await markNormalized(tx, 'entry', entry.note_id, now);
}

export async function upsertEntryInTransaction(
  tx: CloudSyncTransaction,
  entry: NewEntry,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();
  await tx
    .insert(entries)
    .values({ ...entry, updated_at: now, created_at: entry.created_at ?? now })
    .onConflictDoUpdate({
      target: entries.note_id,
      set: {
        text_title: entry.text_title,
        text_content: entry.text_content,
        mood: entry.mood,
        assets: entry.assets,
        tags: entry.tags ?? '',
        updated_at: now,
        created_at: entry.created_at ?? sql`${entries.created_at}`,
      },
    });
  await replaceEntryAssets(tx, entry.note_id, entry.assets, now);
  await replaceEntryTags(tx, entry.note_id, entry.tags, now);
  await markNormalized(tx, 'entry', entry.note_id, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, 'entry', entry.note_id, 'upsert', { ...context, now });
  }
}

export async function deleteEntryInTransaction(
  tx: CloudSyncTransaction,
  noteId: string,
  context: MutationContext = {},
): Promise<Entry | undefined> {
  const now = context.now ?? Date.now();
  const [entry] = await tx.select().from(entries).where(eq(entries.note_id, noteId)).limit(1);
  const normalized = await tx
    .select()
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)),
    );

  for (const asset of normalized) {
    await retainMediaRow(tx, asset, `entry:${noteId}`, now);
  }
  await tx
    .delete(mediaAssets)
    .where(
      and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)),
    );
  // Production does not enable PRAGMA foreign_keys, so this cannot rely on the
  // schema's ON DELETE CASCADE.
  await tx.delete(entryTags).where(eq(entryTags.note_id, noteId));
  await tx.delete(entries).where(eq(entries.note_id, noteId));
  await markNormalized(tx, 'entry', noteId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    const deletedState: SnapshotEntryV2 | null = entry ? {
      entryId: entry.note_id,
      title: entry.text_title,
      content: entry.text_content,
      mood: entry.mood ?? null,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      conflictOriginId: entry.conflict_origin_id,
    } : null;
    await enqueueMutation(tx, 'entry', noteId, 'delete', {
      ...context,
      now,
      deletedStateHash: deletedState ? canonicalHashV2(deletedState) : null,
    });
  }
  return entry;
}

async function assertUniqueTitle(
  tx: CloudSyncTransaction,
  entity: 'tag' | 'prompt',
  title: string,
  excludingId?: string,
): Promise<void> {
  const table = entity === 'tag' ? tags : customPrompts;
  const id = entity === 'tag' ? tags.tag_id : customPrompts.prompt_id;
  const conditions = [sql`lower(${table.title}) = lower(${title})`];
  if (excludingId) conditions.push(ne(id, excludingId));
  const existing = await tx
    .select({ id })
    .from(table)
    .where(and(...conditions))
    .limit(1);
  if (existing.length > 0) {
    throw new Error(entity === 'tag' ? 'Tag already exists' : 'Prompt already exists');
  }
}

export async function createTagInTransaction(
  tx: CloudSyncTransaction,
  title: string,
  context: MutationContext = {},
  stableId?: string,
): Promise<string> {
  const cleanTitle = sanitizeTagName(title);
  if (!cleanTitle) throw new Error('Invalid tag title');
  await assertUniqueTitle(tx, 'tag', cleanTitle);
  const now = context.now ?? Date.now();
  const tagId = stableId ?? randomUUID();
  await tx.insert(tags).values({
    tag_id: tagId,
    title: cleanTitle,
    created_at: context.createdAt ?? now,
    updated_at: now,
  });
  await markNormalized(tx, 'tag', tagId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, 'tag', tagId, 'upsert', { ...context, now });
  }
  return tagId;
}

export async function updateTagInTransaction(
  tx: CloudSyncTransaction,
  tagId: string,
  title: string,
  context: MutationContext = {},
): Promise<void> {
  const cleanTitle = sanitizeTagName(title);
  if (!cleanTitle) throw new Error('Invalid tag title');
  await assertUniqueTitle(tx, 'tag', cleanTitle, tagId);
  const now = context.now ?? Date.now();
  await tx.update(tags).set({ title: cleanTitle, updated_at: now }).where(eq(tags.tag_id, tagId));
  await markNormalized(tx, 'tag', tagId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, 'tag', tagId, 'upsert', { ...context, now });
  }
}

export async function deleteTagInTransaction(
  tx: CloudSyncTransaction,
  tagId: string,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();
  const [deletedTag] = await tx.select().from(tags).where(eq(tags.tag_id, tagId)).limit(1);
  const relations = await tx.select().from(entryTags).where(eq(entryTags.tag_id, tagId));
  for (const relation of relations) {
    const [entry] = await tx
      .select({ tags: entries.tags })
      .from(entries)
      .where(eq(entries.note_id, relation.note_id))
      .limit(1);
    const remaining = parseTagIds(entry?.tags).filter((id) => id !== tagId).join(',');
    await tx
      .update(entries)
      .set({ tags: remaining, updated_at: now })
      .where(eq(entries.note_id, relation.note_id));
    await tx
      .delete(entryTags)
      .where(
        and(eq(entryTags.note_id, relation.note_id), eq(entryTags.tag_id, tagId)),
      );
    if (context.origin !== 'remote' && context.origin !== 'migration') {
      await enqueueMutation(tx, 'entry', relation.note_id, 'upsert', { ...context, now });
    }
  }
  await tx.delete(tags).where(eq(tags.tag_id, tagId));
  await markNormalized(tx, 'tag', tagId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    const deletedState: SnapshotTagV2 | null = deletedTag ? {
      tagId: deletedTag.tag_id,
      title: deletedTag.title,
      createdAt: deletedTag.created_at,
      updatedAt: deletedTag.updated_at,
      conflictOriginId: deletedTag.conflict_origin_id,
    } : null;
    await enqueueMutation(tx, 'tag', tagId, 'delete', {
      ...context,
      now,
      deletedStateHash: deletedState ? canonicalHashV2(deletedState) : null,
    });
  }
}

export async function createPromptInTransaction(
  tx: CloudSyncTransaction,
  title: string,
  context: MutationContext = {},
  stableId?: string,
): Promise<string> {
  const cleanTitle = sanitizePromptTitle(title);
  if (!cleanTitle) throw new Error('Invalid prompt title');
  await assertUniqueTitle(tx, 'prompt', cleanTitle);
  const now = context.now ?? Date.now();
  const promptId = stableId ?? randomUUID();
  await tx.insert(customPrompts).values({
    prompt_id: promptId,
    title: cleanTitle,
    created_at: context.createdAt ?? now,
    updated_at: now,
  });
  await markNormalized(tx, 'prompt', promptId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, 'prompt', promptId, 'upsert', { ...context, now });
  }
  return promptId;
}

export async function updatePromptInTransaction(
  tx: CloudSyncTransaction,
  promptId: string,
  title: string,
  context: MutationContext = {},
): Promise<void> {
  const cleanTitle = sanitizePromptTitle(title);
  if (!cleanTitle) throw new Error('Invalid prompt title');
  await assertUniqueTitle(tx, 'prompt', cleanTitle, promptId);
  const now = context.now ?? Date.now();
  await tx
    .update(customPrompts)
    .set({ title: cleanTitle, updated_at: now })
    .where(eq(customPrompts.prompt_id, promptId));
  await markNormalized(tx, 'prompt', promptId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, 'prompt', promptId, 'upsert', { ...context, now });
  }
}

export async function deletePromptInTransaction(
  tx: CloudSyncTransaction,
  promptId: string,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();
  const [deletedPrompt] = await tx.select().from(customPrompts)
    .where(eq(customPrompts.prompt_id, promptId)).limit(1);
  await tx.delete(customPrompts).where(eq(customPrompts.prompt_id, promptId));
  await markNormalized(tx, 'prompt', promptId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    const deletedState: SnapshotPromptV2 | null = deletedPrompt ? {
      promptId: deletedPrompt.prompt_id,
      title: deletedPrompt.title,
      createdAt: deletedPrompt.created_at,
      updatedAt: deletedPrompt.updated_at,
      conflictOriginId: deletedPrompt.conflict_origin_id,
    } : null;
    await enqueueMutation(tx, 'prompt', promptId, 'delete', {
      ...context,
      now,
      deletedStateHash: deletedState ? canonicalHashV2(deletedState) : null,
    });
  }
}

export interface ProfileUpdate {
  displayName?: string | null;
  email?: string | null;
  photoUri?: string | null;
  photoAssetId?: string | null;
}

export async function updateProfileInTransaction(
  tx: CloudSyncTransaction,
  update: ProfileUpdate,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();
  const [previous] = await tx
    .select()
    .from(userProfile)
    .where(eq(userProfile.profile_id, PROFILE_ROW_ID))
    .limit(1);
  const previousAsset = previous?.photo_asset_id
    ? (
        await tx
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.asset_id, previous.photo_asset_id))
          .limit(1)
      )[0]
    : undefined;

  let photoAssetId =
    update.photoAssetId !== undefined ? update.photoAssetId : previous?.photo_asset_id ?? null;
  if (update.photoUri !== undefined) {
    if (update.photoUri) {
      const canReuse = previousAsset?.local_uri === update.photoUri;
      const requestedId = update.photoAssetId ?? randomUUID();
      const [requestedAsset] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.asset_id, requestedId))
        .limit(1);
      const requestedIdBelongsElsewhere =
        requestedAsset &&
        (requestedAsset.owner_type !== 'profile' || requestedAsset.owner_id !== PROFILE_ROW_ID);
      photoAssetId = canReuse
        ? previousAsset.asset_id
        : requestedIdBelongsElsewhere
          ? randomUUID()
          : requestedId;
      await tx
        .insert(mediaAssets)
        .values({
          asset_id: photoAssetId,
          owner_type: 'profile',
          owner_id: PROFILE_ROW_ID,
          kind: 'profile-photo',
          local_uri: update.photoUri,
          download_state: 'n/a',
          mime_type: 'image/jpeg',
          created_at:
            (canReuse ? previousAsset.created_at : requestedAsset?.created_at) ?? now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: mediaAssets.asset_id,
          set: {
            owner_type: 'profile',
            owner_id: PROFILE_ROW_ID,
            kind: 'profile-photo',
            local_uri: update.photoUri,
            download_state: 'n/a',
            mime_type: 'image/jpeg',
            updated_at: now,
            pending_local_delete_at: null,
          },
        });
    } else {
      photoAssetId = null;
    }
  }

  const syncFieldsChanged =
    (update.displayName !== undefined && update.displayName !== previous?.display_name) ||
    photoAssetId !== (previous?.photo_asset_id ?? null);

  if (previousAsset && previousAsset.asset_id !== photoAssetId) {
    await retainMediaRow(tx, previousAsset, 'profile:profile', now);
    await tx.delete(mediaAssets).where(eq(mediaAssets.asset_id, previousAsset.asset_id));
  }

  await tx
    .insert(userProfile)
    .values({
      profile_id: PROFILE_ROW_ID,
      display_name:
        update.displayName !== undefined ? update.displayName : previous?.display_name ?? null,
      email: update.email !== undefined ? update.email : previous?.email ?? null,
      photo_asset_id: photoAssetId,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: userProfile.profile_id,
      set: {
        display_name:
          update.displayName !== undefined
            ? update.displayName
            : previous?.display_name ?? null,
        email: update.email !== undefined ? update.email : previous?.email ?? null,
        photo_asset_id: photoAssetId,
        updated_at: now,
      },
    });
  await markNormalized(tx, 'profile', PROFILE_ENTITY_ID, now);
  if (
    syncFieldsChanged &&
    context.origin !== 'remote' &&
    context.origin !== 'migration'
  ) {
    await enqueueMutation(tx, 'profile', PROFILE_ENTITY_ID, 'upsert', {
      ...context,
      now,
    });
  }
}

export async function runInCloudSyncTransaction<T>(
  operation: (tx: CloudSyncTransaction) => Promise<T>,
): Promise<T> {
  const result = await runExclusiveDbTransaction(operation);
  // The durable outbox row now exists. Scheduling sync must not depend on the
  // best-effort post-commit media reaper completing successfully.
  notifyCloudSyncMutationCommitted();
  const { reapRetainedMediaWithoutVault } = await import('./retainedMedia');
  try {
    await reapRetainedMediaWithoutVault();
  } catch {
    console.warn('Retained media cleanup will retry later');
  }
  return result;
}
