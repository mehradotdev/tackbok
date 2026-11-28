import { and, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import {
  cloudSyncMigrationItems,
  cloudSyncState,
  syncDeletedRecords,
  syncFieldValues,
  syncRecords,
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
import {
  dropEqualVersionsInTransaction,
  dropMemberStampsInTransaction,
  stampDeleteInTransaction,
  stampMembershipsInTransaction,
  stampWriteInTransaction,
  writeOrderInTransaction,
} from './syncStamps';
import {
  defaultAssetOrder,
  retainedValuesInTransaction,
  shownAssetOrder,
} from './v2State';
import type { Json } from '../v2/types';
import { namedId, normalizeTitle, type NamedKind } from '../v2/ids';

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
  /**
   * Sync v2: false when the caller resets the sync identity in the same
   * transaction ("Delete all"), so per-record stamps would be thrown away.
   */
  syncStamps?: boolean;
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
 * Advances the snapshot journal generation for an active cloud vault and
 * marks it dirty. Offline/local-only journals need nothing: their stamps are
 * captured when a cloud vault is later connected.
 */
export async function enqueueMutation(
  tx: CloudSyncTransaction,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();

  const [syncVault] = await tx
    .select({
      vaultId: cloudVault.vault_id,
      deviceId: cloudVault.device_id,
      status: cloudVault.status,
    })
    .from(cloudVault)
    .where(notInArray(cloudVault.status, ['disabled', 'revoked']))
    .limit(1);

  if (syncVault) {
    await tx
      .insert(cloudSyncState)
      .values({
        vault_id: syncVault.vaultId,
        device_id: syncVault.deviceId,
        journal_generation: 0,
        settled_generation: 0,
        next_device_sequence: 1,
        updated_at: now,
      })
      .onConflictDoNothing();
    await tx
      .update(cloudSyncState)
      .set({
        journal_generation: sql`${cloudSyncState.journal_generation} + 1`,
        updated_at: now,
      })
      .where(
        and(
          eq(cloudSyncState.vault_id, syncVault.vaultId),
          eq(cloudSyncState.device_id, syncVault.deviceId),
        ),
      );

    if (syncVault.status !== 'paused' && syncVault.status !== 'restoring') {
      await tx
        .update(cloudVault)
        .set({ status: 'dirty', updated_at: now })
        .where(eq(cloudVault.vault_id, syncVault.vaultId));
    }
  }
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
    .where(and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)));
  const unused = new Map(existing.map((asset) => [asset.local_uri, asset]));
  const existingById = new Map(existing.map((asset) => [asset.asset_id, asset]));
  const desiredIds: string[] = [];
  // An entry written again after its delete (an import or a restore, #185
  // P9): its attachments' descriptors are immutable and other devices still
  // hold them behind the tombstone, so a requested ID with no row here is
  // taken as new. Other requested IDs are kept, so a copy imported before
  // this device joins a backup matches the vault's.
  const [deletedBefore] = await tx
    .select({ id: syncDeletedRecords.entity_id })
    .from(syncDeletedRecords)
    .where(
      and(
        eq(syncDeletedRecords.entity_type, 'entry'),
        eq(syncDeletedRecords.entity_id, noteId),
      ),
    )
    .limit(1);

  for (const asset of assets ?? []) {
    const requestedId = asset.assetId ?? randomUUID();
    const [requestedAsset] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.asset_id, requestedId))
      .limit(1);
    const requestedIdBelongsElsewhere =
      requestedAsset &&
      (requestedAsset.owner_type !== 'entry' || requestedAsset.owner_id !== noteId);
    const prior = unused.get(asset.uri) ?? existingById.get(requestedId);
    if (prior) unused.delete(prior.local_uri);
    const assetId =
      prior?.asset_id ??
      (requestedIdBelongsElsewhere || (!requestedAsset && deletedBefore && asset.assetId)
        ? randomUUID()
        : requestedId);
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
      .where(and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)));
  }
}

async function replaceEntryTags(
  tx: CloudSyncTransaction,
  noteId: string,
  tagCsv: string | null | undefined,
  now: number,
): Promise<void> {
  const tagIds = parseTagIds(tagCsv);
  // Sync v2: a membership that stays keeps the stamp of the add that made it.
  const previous = new Map(
    (
      await tx
        .select({
          tag_id: entryTags.tag_id,
          stamp_hlc: entryTags.stamp_hlc,
          stamp_device: entryTags.stamp_device,
        })
        .from(entryTags)
        .where(eq(entryTags.note_id, noteId))
    ).map((row) => [row.tag_id, row]),
  );
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
        stamp_hlc: previous.get(tag_id)?.stamp_hlc ?? null,
        stamp_device: previous.get(tag_id)?.stamp_device ?? null,
      })),
    );
  }
}

async function entryTagIds(tx: CloudSyncTransaction, noteId: string): Promise<string[]> {
  return (
    await tx
      .select({ tag_id: entryTags.tag_id })
      .from(entryTags)
      .where(eq(entryTags.note_id, noteId))
  )
    .map((row) => row.tag_id)
    .sort();
}

interface EntryAssetRow {
  asset_id: string;
  local_uri: string | null;
}

async function entryAssetRows(
  tx: CloudSyncTransaction,
  noteId: string,
): Promise<EntryAssetRow[]> {
  return (
    await tx
      .select({ asset_id: mediaAssets.asset_id, local_uri: mediaAssets.local_uri })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)))
  ).sort((a, b) => (a.asset_id < b.asset_id ? -1 : 1));
}

const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** Normalizes legacy fields without changing the domain row or enqueueing sync. */
export async function normalizeLegacyEntryInTransaction(
  tx: CloudSyncTransaction,
  entry: Entry,
  now = Date.now(),
): Promise<void> {
  await replaceEntryAssets(tx, entry.note_id, entry.assets, now);
  await replaceEntryTags(tx, entry.note_id, entry.tags, now);
  // Sync v2: memberships made from the legacy CSV are adds like any other.
  const unstamped = (
    await tx
      .select({ tag_id: entryTags.tag_id, stamp_hlc: entryTags.stamp_hlc })
      .from(entryTags)
      .where(eq(entryTags.note_id, entry.note_id))
  )
    .filter((row) => row.stamp_hlc === null)
    .map((row) => row.tag_id);
  const s = await stampWriteInTransaction(
    tx,
    'entry',
    entry.note_id,
    unstamped.length > 0 ? ['tags'] : [],
    now,
  );
  if (s) await stampMembershipsInTransaction(tx, entry.note_id, unstamped, s);
  await markNormalized(tx, 'entry', entry.note_id, now);
}

export async function upsertEntryInTransaction(
  tx: CloudSyncTransaction,
  entry: NewEntry,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();
  const [previous] = await tx
    .select()
    .from(entries)
    .where(eq(entries.note_id, entry.note_id))
    .limit(1);
  const previousTags = previous ? await entryTagIds(tx, entry.note_id) : [];
  const previousAssets = previous ? await entryAssetRows(tx, entry.note_id) : [];
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
  await stampEntryWrite(tx, entry, previous, previousTags, previousAssets, now);
  await markNormalized(tx, 'entry', entry.note_id, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
  }
}

/** The entry's order register value, or null when it has none. */
async function orderRegister(
  tx: CloudSyncTransaction,
  noteId: string,
): Promise<string[] | null> {
  const [row] = await tx
    .select({ value: syncFieldValues.value_json })
    .from(syncFieldValues)
    .where(
      and(
        eq(syncFieldValues.entity_type, 'entry'),
        eq(syncFieldValues.entity_id, noteId),
        eq(syncFieldValues.field, 'order'),
      ),
    )
    .limit(1);
  return row ? (JSON.parse(row.value) as string[]) : null;
}

/**
 * Sync v2: stamps the fields this write changed (all of them for a new
 * entry), with the items beside the shown values kept as the model's writes
 * keep them (see `syncStamps.ts`).
 */
async function stampEntryWrite(
  tx: CloudSyncTransaction,
  entry: NewEntry,
  previous: Entry | undefined,
  previousTags: string[],
  previousAssets: EntryAssetRow[],
  now: number,
): Promise<void> {
  const tagIds = await entryTagIds(tx, entry.note_id);
  const assetRows = await entryAssetRows(tx, entry.note_id);
  const assetIds = assetRows.map((row) => row.asset_id);
  const fields: string[] = [];
  // A field the caller left out keeps its value: not a change.
  const changed = <T>(next: T | undefined, before: T | null) =>
    next !== undefined && (next ?? null) !== before;
  if (!previous) fields.push('title', 'text', 'mood', 'date');
  else {
    if (changed(entry.text_title, previous.text_title)) fields.push('title');
    if (changed(entry.text_content, previous.text_content)) fields.push('text');
    if (changed(entry.mood, previous.mood)) fields.push('mood');
    if (changed(entry.created_at, previous.created_at)) fields.push('date');
  }
  const added = tagIds.filter((id) => !previousTags.includes(id));
  if (!sameList(tagIds, previousTags)) fields.push('tags');
  // Attachments get their own stamps when first published (P6); attaching,
  // detaching or reordering is still a write to the entry.
  const previousIds = previousAssets.map((row) => row.asset_id);
  if (!sameList(assetIds, previousIds)) fields.push('attachments');
  // The order is written when other devices would not show this one by
  // default (the register's order, then by ID): a reorder, or attachments
  // added in an order their IDs do not sort into.
  let order: string[] | null = null;
  if (entry.assets !== undefined && assetIds.length > 0) {
    const shown = shownAssetOrder(entry.assets, assetRows);
    const register = previous ? await orderRegister(tx, entry.note_id) : null;
    if (!sameList(shown, defaultAssetOrder(register, shown))) {
      fields.push('order');
      order = shown;
    }
  }
  const s = await stampWriteInTransaction(tx, 'entry', entry.note_id, fields, now);
  if (s) await stampMembershipsInTransaction(tx, entry.note_id, added, s);
  if (s && order) await writeOrderInTransaction(tx, entry.note_id, order, s);
  if (previous && fields.includes('title'))
    await dropEqualVersionsInTransaction(
      tx,
      'entry',
      entry.note_id,
      'title',
      previous.text_title,
    );
  if (previous && fields.includes('text'))
    await dropEqualVersionsInTransaction(
      tx,
      'entry',
      entry.note_id,
      'text',
      previous.text_content,
    );
  await dropMemberStampsInTransaction(
    tx,
    entry.note_id,
    'tags',
    previousTags.filter((id) => !tagIds.includes(id)),
  );
  await dropMemberStampsInTransaction(
    tx,
    entry.note_id,
    'attachments',
    previousIds.filter((id) => !assetIds.includes(id)),
  );
}

export async function deleteEntryInTransaction(
  tx: CloudSyncTransaction,
  noteId: string,
  context: MutationContext = {},
): Promise<Entry | undefined> {
  const now = context.now ?? Date.now();
  const [entry] = await tx
    .select()
    .from(entries)
    .where(eq(entries.note_id, noteId))
    .limit(1);
  const normalized = await tx
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)));

  if (context.syncStamps !== false && entry)
    await stampDeleteInTransaction(
      tx,
      'entry',
      noteId,
      (await retainedValuesInTransaction(tx, 'entry', noteId)) as Json | null,
      now,
    );
  for (const asset of normalized) {
    await retainMediaRow(tx, asset, `entry:${noteId}`, now);
  }
  await tx
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)));
  // Production does not enable PRAGMA foreign_keys, so this cannot rely on the
  // schema's ON DELETE CASCADE.
  await tx.delete(entryTags).where(eq(entryTags.note_id, noteId));
  await tx.delete(entries).where(eq(entries.note_id, noteId));
  await markNormalized(tx, 'entry', noteId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
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

/**
 * Sync v2: the ID a new tag or prompt with this title gets (`namedId`), so
 * two devices creating one title offline make one record. An ID still held
 * by a record with another title (renamed away from this one, shown or
 * deleted) is skipped for the next attempt; a deleted record with this
 * title is brought back under its ID, as `createNamed` in the model does.
 */
async function namedIdInTransaction(
  tx: CloudSyncTransaction,
  kind: NamedKind,
  title: string,
): Promise<string> {
  const wanted = normalizeTitle(kind, title);
  const table = kind === 'tag' ? tags : customPrompts;
  const idColumn = kind === 'tag' ? tags.tag_id : customPrompts.prompt_id;
  for (let attempt = 0; ; attempt++) {
    const id = namedId(kind, title, attempt);
    const [shown] = await tx.select({ id: idColumn }).from(table).where(eq(idColumn, id));
    const [record] = await tx
      .select({ del: syncRecords.del_json })
      .from(syncRecords)
      .where(and(eq(syncRecords.entity_type, kind), eq(syncRecords.entity_id, id)));
    if (!shown && !record) return id;
    if (shown || !record?.del) continue;
    const [kept] = await tx
      .select({ json: syncDeletedRecords.record_json })
      .from(syncDeletedRecords)
      .where(
        and(
          eq(syncDeletedRecords.entity_type, kind),
          eq(syncDeletedRecords.entity_id, id),
        ),
      );
    const keptTitle = kept
      ? (JSON.parse(kept.json) as { title?: { v?: unknown } }).title?.v
      : undefined;
    if (typeof keptTitle === 'string' && normalizeTitle(kind, keptTitle) === wanted)
      return id;
  }
}

export async function createTagInTransaction(
  tx: CloudSyncTransaction,
  title: string,
  context: MutationContext = {},
): Promise<string> {
  const cleanTitle = sanitizeTagName(title);
  if (!cleanTitle) throw new Error('Invalid tag title');
  await assertUniqueTitle(tx, 'tag', cleanTitle);
  const now = context.now ?? Date.now();
  const tagId = await namedIdInTransaction(tx, 'tag', cleanTitle);
  await tx.insert(tags).values({
    tag_id: tagId,
    title: cleanTitle,
    created_at: context.createdAt ?? now,
    updated_at: now,
  });
  await stampWriteInTransaction(tx, 'tag', tagId, ['title'], now);
  await markNormalized(tx, 'tag', tagId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
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
  const [previousTag] = await tx
    .select({ title: tags.title })
    .from(tags)
    .where(eq(tags.tag_id, tagId))
    .limit(1);
  await tx
    .update(tags)
    .set({ title: cleanTitle, updated_at: now })
    .where(eq(tags.tag_id, tagId));
  if (previousTag && previousTag.title !== cleanTitle)
    await stampWriteInTransaction(tx, 'tag', tagId, ['title'], now);
  await markNormalized(tx, 'tag', tagId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
  }
}

export async function deleteTagInTransaction(
  tx: CloudSyncTransaction,
  tagId: string,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();
  const [deletedTag] = await tx
    .select()
    .from(tags)
    .where(eq(tags.tag_id, tagId))
    .limit(1);
  // Sync v2: taking the tag off its entries below is a side effect, not an
  // edit of them, so only the tag is stamped (before its rows go).
  if (context.syncStamps !== false && deletedTag)
    await stampDeleteInTransaction(
      tx,
      'tag',
      tagId,
      (await retainedValuesInTransaction(tx, 'tag', tagId)) as Json | null,
      now,
    );
  const relations = await tx.select().from(entryTags).where(eq(entryTags.tag_id, tagId));
  for (const relation of relations) {
    const [entry] = await tx
      .select({ tags: entries.tags })
      .from(entries)
      .where(eq(entries.note_id, relation.note_id))
      .limit(1);
    const remaining = parseTagIds(entry?.tags)
      .filter((id) => id !== tagId)
      .join(',');
    await tx
      .update(entries)
      .set({ tags: remaining, updated_at: now })
      .where(eq(entries.note_id, relation.note_id));
    await tx
      .delete(entryTags)
      .where(and(eq(entryTags.note_id, relation.note_id), eq(entryTags.tag_id, tagId)));
    await dropMemberStampsInTransaction(tx, relation.note_id, 'tags', [tagId]);
    if (context.origin !== 'remote' && context.origin !== 'migration') {
      await enqueueMutation(tx, { ...context, now });
    }
  }
  await tx.delete(tags).where(eq(tags.tag_id, tagId));
  await markNormalized(tx, 'tag', tagId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
  }
}

export async function createPromptInTransaction(
  tx: CloudSyncTransaction,
  title: string,
  context: MutationContext = {},
): Promise<string> {
  const cleanTitle = sanitizePromptTitle(title);
  if (!cleanTitle) throw new Error('Invalid prompt title');
  await assertUniqueTitle(tx, 'prompt', cleanTitle);
  const now = context.now ?? Date.now();
  const promptId = await namedIdInTransaction(tx, 'prompt', cleanTitle);
  await tx.insert(customPrompts).values({
    prompt_id: promptId,
    title: cleanTitle,
    created_at: context.createdAt ?? now,
    updated_at: now,
  });
  await stampWriteInTransaction(tx, 'prompt', promptId, ['title'], now);
  await markNormalized(tx, 'prompt', promptId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
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
  const [previousPrompt] = await tx
    .select({ title: customPrompts.title })
    .from(customPrompts)
    .where(eq(customPrompts.prompt_id, promptId))
    .limit(1);
  await tx
    .update(customPrompts)
    .set({ title: cleanTitle, updated_at: now })
    .where(eq(customPrompts.prompt_id, promptId));
  if (previousPrompt && previousPrompt.title !== cleanTitle)
    await stampWriteInTransaction(tx, 'prompt', promptId, ['title'], now);
  await markNormalized(tx, 'prompt', promptId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
  }
}

export async function deletePromptInTransaction(
  tx: CloudSyncTransaction,
  promptId: string,
  context: MutationContext = {},
): Promise<void> {
  const now = context.now ?? Date.now();
  const [deletedPrompt] = await tx
    .select()
    .from(customPrompts)
    .where(eq(customPrompts.prompt_id, promptId))
    .limit(1);
  if (context.syncStamps !== false && deletedPrompt)
    await stampDeleteInTransaction(
      tx,
      'prompt',
      promptId,
      (await retainedValuesInTransaction(tx, 'prompt', promptId)) as Json | null,
      now,
    );
  await tx.delete(customPrompts).where(eq(customPrompts.prompt_id, promptId));
  await markNormalized(tx, 'prompt', promptId, now);
  if (context.origin !== 'remote' && context.origin !== 'migration') {
    await enqueueMutation(tx, { ...context, now });
  }
}

export interface ProfileUpdate {
  displayName?: string | null;
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
    update.photoAssetId !== undefined
      ? update.photoAssetId
      : (previous?.photo_asset_id ?? null);
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
        (requestedAsset.owner_type !== 'profile' ||
          requestedAsset.owner_id !== PROFILE_ROW_ID);
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
    (update.displayName !== undefined &&
      update.displayName !== (previous?.display_name ?? null)) ||
    photoAssetId !== (previous?.photo_asset_id ?? null);
  // An authored change is always positive and moves forward, even if the
  // clock reads 0 or went backwards, so merged profiles keep a sane stamp.
  const previousUpdatedAt = previous?.updated_at ?? 0;
  const profileUpdatedAt = syncFieldsChanged
    ? Math.max(1, now, previousUpdatedAt + 1)
    : previousUpdatedAt;

  if (previousAsset && previousAsset.asset_id !== photoAssetId) {
    await retainMediaRow(tx, previousAsset, 'profile:profile', now);
    await tx.delete(mediaAssets).where(eq(mediaAssets.asset_id, previousAsset.asset_id));
  }

  await tx
    .insert(userProfile)
    .values({
      profile_id: PROFILE_ROW_ID,
      display_name:
        update.displayName !== undefined
          ? update.displayName
          : (previous?.display_name ?? null),
      photo_asset_id: photoAssetId,
      updated_at: profileUpdatedAt,
    })
    .onConflictDoUpdate({
      target: userProfile.profile_id,
      set: {
        display_name:
          update.displayName !== undefined
            ? update.displayName
            : (previous?.display_name ?? null),
        photo_asset_id: photoAssetId,
        updated_at: profileUpdatedAt,
      },
    });
  const profileFields: string[] = [];
  if (
    update.displayName !== undefined &&
    update.displayName !== (previous?.display_name ?? null)
  )
    profileFields.push('name');
  if (photoAssetId !== (previous?.photo_asset_id ?? null)) profileFields.push('photo');
  if (context.syncStamps !== false) {
    await stampWriteInTransaction(tx, 'profile', PROFILE_ENTITY_ID, profileFields, now);
    if (profileFields.includes('name'))
      await dropEqualVersionsInTransaction(
        tx,
        'profile',
        PROFILE_ENTITY_ID,
        'name',
        previous?.display_name ?? null,
      );
    if (profileFields.includes('photo'))
      await dropEqualVersionsInTransaction(
        tx,
        'profile',
        PROFILE_ENTITY_ID,
        'photo',
        previous?.photo_asset_id ?? null,
      );
  }
  await markNormalized(tx, 'profile', PROFILE_ENTITY_ID, now);
  if (
    syncFieldsChanged &&
    context.origin !== 'remote' &&
    context.origin !== 'migration'
  ) {
    await enqueueMutation(tx, {
      ...context,
      now,
    });
  }
}

export async function runInCloudSyncTransaction<T>(
  operation: (tx: CloudSyncTransaction) => Promise<T>,
): Promise<T> {
  const result = await runExclusiveDbTransaction(operation);
  // SQLite has committed. Callers treat a rejection as a rollback and may
  // delete files the committed rows reference, so post-commit work below must
  // never reject. The durable outbox row now exists. Scheduling sync must not
  // depend on the best-effort post-commit media reaper completing successfully.
  notifyCloudSyncMutationCommitted();
  try {
    const { reapRetainedMediaWithoutVault } = await import('./retainedMedia');
    await reapRetainedMediaWithoutVault();
  } catch {
    console.warn('Retained media cleanup will retry later');
  }
  return result;
}
