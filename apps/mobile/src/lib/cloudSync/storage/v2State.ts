/**
 * Cloud sync v2 (#185, step P5): the local journal read as a v2 state
 * (`captureSyncStateInTransaction`), a joined state written back
 * (`applySyncState`), and the rebuild that binds the metadata to a vault
 * (`rebuildSyncMetadataInTransaction`).
 *
 * Where each part of a record lives (`src/db/schema.ts`, "Cloud sync v2"):
 * - a **shown** record: the journal tables hold the shown value of each
 *   field; `sync_records` holds its vector, `known`, tombstone (a returned
 *   record), `ext`, `split` and the stamps of the shown values;
 *   `sync_field_values` holds every other item: the other open versions of a
 *   title, text, profile name or photo, the extra stamps of a tag or
 *   attachment member, and the attachment order register (field `order`,
 *   its exact value, so a later local attach cannot change what was written
 *   under that stamp);
 * - a **deleted** record that is not shown: no journal row; `sync_records`
 *   holds its vector and tombstone, `sync_deleted_records` every value in v2
 *   form (none once compacted). A deleted tag that a shown entry still uses
 *   is shown, so it also keeps a `tags` row for display;
 * - **media**: an attachment is in the state once it is published (it has a
 *   stamp, and its blob is on the provider); one not yet published stays
 *   local. Every profile photo a name-or-photo version refers to is in it.
 *   A deleted entry's descriptors are kept with its values.
 *
 * Capture is exact: capturing right after applying a state gives that state
 * back, item for item. That is what the join relies on ("a member the
 * record's vector covers but the record no longer lists was removed").
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import {
  customPrompts,
  entries,
  entryTags,
  mediaAssets,
  syncDeletedRecords,
  syncDevice,
  syncFieldValues,
  syncMediaObligations,
  syncRecords,
  syncRetainedMedia,
  tags,
  userProfile,
  runExclusiveDbTransaction,
} from '~/db';
import { AssetType, type Asset } from '~/types';

import { canonicalize } from '../snapshot/canonical';
import { LocalStorageError } from '../snapshot/sync/types';
import { writeBatches } from '../snapshot/storage/writeBatches';
import { compareStamps, nextHlc } from '../v2/clock';
import { isCompacted } from '../v2/compact';
import { NAMED_ID, namedId, type NamedKind } from '../v2/ids';
import type {
  EntryRecord,
  Ext,
  Item,
  Json,
  Known,
  LastWriter,
  MediaDescriptor,
  Member,
  Mood,
  NamedRecord,
  ProfileRecord,
  Stamp,
  SyncState,
  Tombstone,
  VersionVector,
} from '../v2/types';
import { SyncJoinError } from '../v2/join';
import { attachmentIds, isLive, liveTags, memberIds, shownItems } from '../v2/view';
import { resetSyncIdentityInTransaction, stampWriteInTransaction } from './syncStamps';
import type { CloudSyncTransaction, SyncEntityType } from './repositories';

type Tx = CloudSyncTransaction;

const SELF = 'self';
/** The profile's ID in `sync_records` and in descriptors (its row is `self`). */
const PROFILE = 'profile';

/** Every value of a deleted entry, kept behind its tombstone. */
export interface DeletedEntryValues {
  title: Item<string | null>[];
  text: Item<string | null>[];
  mood: LastWriter<Mood | null> | null;
  date: LastWriter<number> | null;
  tags: Member[];
  attachments: Member[];
  order: LastWriter<string[]> | null;
  /** Descriptors of `attachments`: their rows are gone with the entry. */
  media: MediaDescriptor[];
}

export interface DeletedNamedValues {
  title: LastWriter<string>;
}

/** The local journal as a v2 state. */
export interface CapturedSyncState {
  state: SyncState;
  /** This device's ID: the writer of local stamps. */
  deviceId: string;
  /**
   * The stored local context. Every local write moves it, so an apply goes
   * ahead only while it is unchanged (nothing was written since capture).
   */
  guard: string;
}

type RecordRow = typeof syncRecords.$inferSelect;
type FieldValueRow = typeof syncFieldValues.$inferSelect;
type MediaRow = typeof mediaAssets.$inferSelect;

const key = (type: string, id: string) => `${type}\0${id}`;
const parse = <T>(json: string): T => JSON.parse(json) as T;
const byStamp = <T extends { s: Stamp }>(left: T, right: T) =>
  compareStamps(left.s, right.s);
const byMember = (left: Member, right: Member) =>
  left.id !== right.id ? (left.id < right.id ? -1 : 1) : compareStamps(left.s, right.s);

function unready(errorClass: string): never {
  throw new LocalStorageError('normalized-model-not-ready', errorClass);
}

function stampOf(hlc: number | null, device: string | null): Stamp | null {
  return hlc === null || device === null ? null : [hlc, device];
}

/** Field -> stamp of the shown value. */
type ShownStamps = Partial<Record<string, Stamp>>;

interface RecordMeta {
  vv: VersionVector;
  known: Known | null;
  stamps: ShownStamps;
  del: Tombstone | null;
  ext: Ext;
  split: EntryRecord['split'];
}

function metaOf(row: RecordRow): RecordMeta {
  return {
    vv: parse(row.vv_json),
    known: row.known_json === null ? null : parse(row.known_json),
    stamps: parse(row.stamps_json),
    del: row.del_json === null ? null : parse(row.del_json),
    ext: parse(row.ext_json),
    split: row.split_json === null ? null : parse(row.split_json),
  };
}

function shownStamp(meta: RecordMeta, field: string, path: string): Stamp {
  return meta.stamps[field] ?? unready(`sync-stamp-missing:${path}.${field}`);
}

/** Field values grouped by record, then by field. */
function groupFieldValues(rows: readonly FieldValueRow[]) {
  const grouped = new Map<string, Map<string, FieldValueRow[]>>();
  for (const row of rows) {
    const recordKey = key(row.entity_type, row.entity_id);
    let fields = grouped.get(recordKey);
    if (!fields) grouped.set(recordKey, (fields = new Map()));
    const list = fields.get(row.field);
    if (list) list.push(row);
    else fields.set(row.field, [row]);
  }
  return grouped;
}

const itemsOf = <T>(rows: readonly FieldValueRow[] | undefined): Item<T>[] =>
  (rows ?? []).map((row) => ({
    s: [row.stamp_hlc, row.stamp_device] as Stamp,
    v: parse<T>(row.value_json),
  }));

const membersOf = (rows: readonly FieldValueRow[] | undefined): Member[] =>
  (rows ?? []).map((row) => ({
    id: parse<string>(row.value_json),
    s: [row.stamp_hlc, row.stamp_device] as Stamp,
  }));

export function descriptorOf(row: MediaRow): MediaDescriptor {
  if (!row.blob_hash || row.byte_size === null)
    throw new LocalStorageError('local-media-unreadable', 'normalized-media-needs-hash');
  return {
    assetId: row.asset_id,
    ownerType: row.owner_type,
    ownerId: row.owner_type === 'profile' ? PROFILE : row.owner_id,
    kind: row.kind,
    blobHash: row.blob_hash,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    ext: parse(row.ext_json),
  };
}

/** The attachment order an entry row shows, as asset IDs. */
export function shownAssetOrder(
  assets: readonly Asset[] | null | undefined,
  rows: readonly { asset_id: string; local_uri: string | null }[],
): string[] {
  const ids = new Set(rows.map((row) => row.asset_id));
  const byUri = new Map(rows.map((row) => [row.local_uri, row.asset_id]));
  const ordered: string[] = [];
  for (const asset of assets ?? []) {
    const id =
      asset.assetId && ids.has(asset.assetId) ? asset.assetId : byUri.get(asset.uri);
    if (id !== undefined && !ordered.includes(id)) ordered.push(id);
  }
  // Rows the list does not name come last, by ID.
  for (const id of [...ids].sort()) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}

/**
 * The order the other devices show for these attachments when the entry's
 * order register holds `register`: the register's order, then the rest by ID
 * (`attachmentIds` in `v2/view.ts`).
 */
export function defaultAssetOrder(
  register: readonly string[] | null,
  ids: readonly string[],
): string[] {
  const remaining = new Set(ids);
  const result: string[] = [];
  for (const id of register ?? []) if (remaining.delete(id)) result.push(id);
  return [...result, ...[...remaining].sort()];
}

// ---------------------------------------------------------------- capture

interface LocalRows {
  device: typeof syncDevice.$inferSelect;
  records: RecordRow[];
  values: Map<string, Map<string, FieldValueRow[]>>;
  deleted: Map<string, string>;
  entryRows: (typeof entries.$inferSelect)[];
  tagRows: (typeof tags.$inferSelect)[];
  promptRows: (typeof customPrompts.$inferSelect)[];
  memberships: Map<string, (typeof entryTags.$inferSelect)[]>;
  media: MediaRow[];
  profile: typeof userProfile.$inferSelect | undefined;
}

async function readLocalRows(tx: Tx): Promise<LocalRows> {
  const [device] = await tx.select().from(syncDevice).where(eq(syncDevice.id, SELF));
  if (!device) unready('sync-device-missing');
  const memberships = new Map<string, (typeof entryTags.$inferSelect)[]>();
  for (const row of await tx.select().from(entryTags)) {
    const list = memberships.get(row.note_id);
    if (list) list.push(row);
    else memberships.set(row.note_id, [row]);
  }
  return {
    device,
    records: await tx.select().from(syncRecords),
    values: groupFieldValues(await tx.select().from(syncFieldValues)),
    deleted: new Map(
      (await tx.select().from(syncDeletedRecords)).map((row) => [
        key(row.entity_type, row.entity_id),
        row.record_json,
      ]),
    ),
    entryRows: await tx.select().from(entries),
    tagRows: await tx.select().from(tags),
    promptRows: await tx.select().from(customPrompts),
    memberships,
    media: await tx.select().from(mediaAssets),
    profile: (
      await tx.select().from(userProfile).where(eq(userProfile.profile_id, SELF))
    )[0],
  };
}

/**
 * The local journal as a v2 state. The metadata must be bound to a vault
 * (`rebuildSyncMetadataInTransaction`); an inconsistency throws
 * `LocalStorageError`, never a partial state, since a record the capture
 * left out would read as nothing, but a member or version left out would
 * read as removed.
 */
export async function captureSyncStateInTransaction(tx: Tx): Promise<CapturedSyncState> {
  const rows = await readLocalRows(tx);
  const vaultId = rows.device.vault_id ?? unready('sync-metadata-unbound');
  const media = new Map<string, MediaDescriptor>();
  const addMedia = (descriptor: MediaDescriptor) => {
    const existing = media.get(descriptor.assetId);
    if (
      existing &&
      canonicalize(existing as unknown as Json) !==
        canonicalize(descriptor as unknown as Json)
    )
      unready(`sync-media-conflict:${descriptor.assetId}`);
    media.set(descriptor.assetId, descriptor);
  };
  const entryById = new Map(rows.entryRows.map((row) => [row.note_id, row]));
  const tagById = new Map(rows.tagRows.map((row) => [row.tag_id, row]));
  const promptById = new Map(rows.promptRows.map((row) => [row.prompt_id, row]));
  const mediaByEntry = new Map<string, MediaRow[]>();
  const mediaById = new Map<string, MediaRow>();
  for (const row of rows.media) {
    mediaById.set(row.asset_id, row);
    if (row.owner_type !== 'entry') continue;
    const list = mediaByEntry.get(row.owner_id);
    if (list) list.push(row);
    else mediaByEntry.set(row.owner_id, [row]);
  }

  const stateEntries = new Map<string, EntryRecord>();
  const stateTags = new Map<string, NamedRecord>();
  const statePrompts = new Map<string, NamedRecord>();
  let profileRecord: ProfileRecord = { vv: {}, name: [], photo: [], ext: {} };

  for (const row of rows.records) {
    const meta = metaOf(row);
    const id = row.entity_id;
    const values = rows.values.get(key(row.entity_type, id));
    const deleted = rows.deleted.get(key(row.entity_type, id));
    const path = `${row.entity_type} ${id}`;
    if (row.entity_type === 'entry') {
      const base = {
        id,
        vv: meta.vv,
        known: meta.known,
        del: meta.del,
        ext: meta.ext,
        split: meta.split,
      };
      const journal = entryById.get(id);
      if (journal) {
        const memberships = rows.memberships.get(id) ?? [];
        const tagMembers = memberships.map((membership) => ({
          id: membership.tag_id,
          s:
            stampOf(membership.stamp_hlc, membership.stamp_device) ??
            unready(`sync-membership-unstamped:${path}`),
        }));
        const attachmentMembers: Member[] = [];
        for (const asset of mediaByEntry.get(id) ?? []) {
          const s = stampOf(asset.stamp_hlc, asset.stamp_device);
          if (!s) continue; // not published yet: local only
          attachmentMembers.push({ id: asset.asset_id, s });
          addMedia(descriptorOf(asset));
        }
        const extraAttachments = membersOf(values?.get('attachments'));
        for (const member of extraAttachments)
          if (!attachmentMembers.some((other) => other.id === member.id))
            unready(`sync-member-orphan:${path}`);
        const orderStamp = meta.stamps.order;
        const orderRow = orderStamp
          ? values
              ?.get('order')
              ?.find(
                (value) =>
                  value.stamp_hlc === orderStamp[0] &&
                  value.stamp_device === orderStamp[1],
              )
          : undefined;
        stateEntries.set(id, {
          ...base,
          title: [
            { s: shownStamp(meta, 'title', path), v: journal.text_title },
            ...itemsOf<string | null>(values?.get('title')),
          ].sort(byStamp),
          text: [
            { s: shownStamp(meta, 'text', path), v: journal.text_content },
            ...itemsOf<string | null>(values?.get('text')),
          ].sort(byStamp),
          mood: { s: shownStamp(meta, 'mood', path), v: journal.mood ?? null },
          date: { s: shownStamp(meta, 'date', path), v: journal.created_at },
          tags: [...tagMembers, ...membersOf(values?.get('tags'))].sort(byMember),
          attachments: [...attachmentMembers, ...extraAttachments].sort(byMember),
          order: orderRow
            ? { s: orderStamp!, v: parse<string[]>(orderRow.value_json) }
            : null,
        });
      } else if (deleted !== undefined) {
        const kept = parse<DeletedEntryValues>(deleted);
        for (const descriptor of kept.media) addMedia(descriptor);
        stateEntries.set(id, {
          ...base,
          title: kept.title,
          text: kept.text,
          mood: kept.mood,
          date: kept.date,
          tags: kept.tags,
          attachments: kept.attachments,
          order: kept.order,
        });
      } else {
        if (
          !meta.known ||
          Object.keys(meta.known.vv).length > 0 ||
          meta.known.extra.length
        )
          unready(`sync-values-missing:${path}`);
        stateEntries.set(id, {
          ...base,
          title: [],
          text: [],
          mood: null,
          date: null,
          tags: [],
          attachments: [],
          order: null,
        });
      }
    } else if (row.entity_type === 'tag' || row.entity_type === 'prompt') {
      const live = isLive(meta);
      let title: LastWriter<string>;
      if (!live) {
        title =
          deleted !== undefined
            ? parse<DeletedNamedValues>(deleted).title
            : unready(`sync-values-missing:${path}`);
      } else {
        const journal = row.entity_type === 'tag' ? tagById.get(id) : promptById.get(id);
        if (!journal) unready(`sync-row-missing:${path}`);
        title = { s: shownStamp(meta, 'title', path), v: journal.title };
      }
      const record: NamedRecord = {
        id,
        vv: meta.vv,
        del: meta.del,
        ext: meta.ext,
        title,
      };
      (row.entity_type === 'tag' ? stateTags : statePrompts).set(id, record);
    } else if (row.entity_type === 'profile') {
      const profile = rows.profile;
      const name: Item<string | null>[] = itemsOf(values?.get('name'));
      if (meta.stamps.name)
        name.push({ s: meta.stamps.name, v: profile?.display_name ?? null });
      const photo: Item<string | null>[] = itemsOf(values?.get('photo'));
      if (meta.stamps.photo)
        photo.push({ s: meta.stamps.photo, v: profile?.photo_asset_id ?? null });
      for (const item of photo) {
        if (item.v === null) continue;
        const asset = mediaById.get(item.v);
        if (!asset || asset.owner_type !== 'profile')
          unready(`sync-profile-photo-missing:${item.v}`);
        addMedia(descriptorOf(asset));
      }
      profileRecord = {
        vv: meta.vv,
        ext: meta.ext,
        name: name.sort(byStamp),
        photo: photo.sort(byStamp),
      };
    }
  }
  for (const row of rows.entryRows)
    if (!stateEntries.has(row.note_id)) unready(`sync-metadata-missing:entry`);
  for (const row of rows.tagRows)
    if (!stateTags.has(row.tag_id)) unready(`sync-metadata-missing:tag`);
  for (const row of rows.promptRows)
    if (!statePrompts.has(row.prompt_id)) unready(`sync-metadata-missing:prompt`);

  return {
    deviceId: rows.device.device_id,
    guard: rows.device.ctx_json,
    state: {
      vaultId,
      ctx: parse(rows.device.ctx_json),
      roster: parse(rows.device.roster_json),
      acks: parse(rows.device.acks_json),
      floor: rows.device.floor_json === null ? null : parse(rows.device.floor_json),
      entries: stateEntries,
      tags: stateTags,
      prompts: statePrompts,
      profile: profileRecord,
      media,
    },
  };
}

export function captureSyncState(): Promise<CapturedSyncState> {
  return runExclusiveDbTransaction((tx) => captureSyncStateInTransaction(tx as Tx));
}

/**
 * A record's values in their deleted form, read before a local delete
 * removes its rows (`stampDeleteInTransaction`).
 */
export async function retainedValuesInTransaction(
  tx: Tx,
  type: Exclude<SyncEntityType, 'profile'>,
  id: string,
): Promise<DeletedEntryValues | DeletedNamedValues | null> {
  const [row] = await tx
    .select()
    .from(syncRecords)
    .where(and(eq(syncRecords.entity_type, type), eq(syncRecords.entity_id, id)));
  if (!row) return null;
  const meta = metaOf(row);
  const values = groupFieldValues(
    await tx
      .select()
      .from(syncFieldValues)
      .where(
        and(eq(syncFieldValues.entity_type, type), eq(syncFieldValues.entity_id, id)),
      ),
  ).get(key(type, id));
  const path = `${type} ${id}`;
  if (type !== 'entry') {
    const table = type === 'tag' ? tags : customPrompts;
    const idColumn = type === 'tag' ? tags.tag_id : customPrompts.prompt_id;
    const [journal] = await tx
      .select({ title: table.title })
      .from(table)
      .where(eq(idColumn, id));
    if (!journal || !meta.stamps.title) return null;
    return { title: { s: meta.stamps.title, v: journal.title } };
  }
  const [journal] = await tx.select().from(entries).where(eq(entries.note_id, id));
  if (!journal) return null;
  const memberships = await tx.select().from(entryTags).where(eq(entryTags.note_id, id));
  const assets = await tx
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, id)));
  const published = assets.filter((asset) => asset.stamp_hlc !== null);
  const orderStamp = meta.stamps.order;
  const orderRow = orderStamp
    ? values
        ?.get('order')
        ?.find(
          (value) =>
            value.stamp_hlc === orderStamp[0] && value.stamp_device === orderStamp[1],
        )
    : undefined;
  const optional = (field: string) => meta.stamps[field] ?? null;
  const title = optional('title');
  const text = optional('text');
  const mood = optional('mood');
  const date = optional('date');
  // Metadata from before this journal was bound to a vault (v1's applies
  // never wrote it) may lack stamps. The rebuild at binding discards kept
  // values anyway, so a delete then keeps none rather than fail.
  if (!title || !text || !mood || !date) return null;
  return {
    title: [
      { s: title, v: journal.text_title },
      ...itemsOf<string | null>(values?.get('title')),
    ].sort(byStamp),
    text: [
      { s: text, v: journal.text_content },
      ...itemsOf<string | null>(values?.get('text')),
    ].sort(byStamp),
    mood: { s: mood, v: journal.mood ?? null },
    date: { s: date, v: journal.created_at },
    tags: [
      ...memberships.flatMap((membership) => {
        const s = stampOf(membership.stamp_hlc, membership.stamp_device);
        return s ? [{ id: membership.tag_id, s }] : [];
      }),
      ...membersOf(values?.get('tags')),
    ].sort(byMember),
    attachments: [
      ...published.map((asset) => ({
        id: asset.asset_id,
        s: [asset.stamp_hlc!, asset.stamp_device!] as Stamp,
      })),
      ...membersOf(values?.get('attachments')).filter((member) =>
        published.some((asset) => asset.asset_id === member.id),
      ),
    ].sort(byMember),
    order: orderRow ? { s: orderStamp!, v: parse<string[]>(orderRow.value_json) } : null,
    media: published.map(descriptorOf).sort((a, b) => (a.assetId < b.assetId ? -1 : 1)),
  };
}

// ---------------------------------------------------------------- publication

/** Attachments of shown entries not published yet: no stamp, so not in the state. */
export async function unpublishedAttachmentsInTransaction(
  tx: Tx,
): Promise<{ assetId: string; entryId: string; blobHash: string | null }[]> {
  const rows = await tx
    .select({
      assetId: mediaAssets.asset_id,
      entryId: mediaAssets.owner_id,
      blobHash: mediaAssets.blob_hash,
    })
    .from(mediaAssets)
    .innerJoin(entries, eq(entries.note_id, mediaAssets.owner_id))
    .where(
      and(eq(mediaAssets.owner_type, 'entry'), sql`${mediaAssets.stamp_hlc} IS NULL`),
    );
  return rows.sort((a, b) => (a.assetId < b.assetId ? -1 : 1));
}

/**
 * Publishes attachments whose blob is now on the provider: each entry gets
 * one write that adds them (as `attach` in the model). Stamping only then
 * keeps the rule that a stamped attachment always has its blob on Drive.
 * Returns how many were stamped.
 */
export async function stampPublishedAttachmentsInTransaction(
  tx: Tx,
  assetIds: ReadonlySet<string>,
  now: number,
): Promise<number> {
  const byEntry = new Map<string, string[]>();
  for (const row of await unpublishedAttachmentsInTransaction(tx)) {
    if (!assetIds.has(row.assetId) || !row.blobHash) continue;
    const list = byEntry.get(row.entryId);
    if (list) list.push(row.assetId);
    else byEntry.set(row.entryId, [row.assetId]);
  }
  let stamped = 0;
  for (const [entryId, ids] of byEntry) {
    const s = await stampWriteInTransaction(tx, 'entry', entryId, ['attachments'], now);
    if (!s) continue;
    await tx
      .update(mediaAssets)
      .set({ stamp_hlc: s[0], stamp_device: s[1] })
      .where(inArray(mediaAssets.asset_id, ids));
    stamped += ids.length;
  }
  return stamped;
}

// ---------------------------------------------------------------- apply

/** Local files for descriptors an apply adds. */
export interface ApplyMediaFiles {
  /**
   * A local path for each descriptor: a verified copy when this device holds
   * the blob, otherwise the path a later download writes to. Files it copies
   * are pushed onto `created`, so a rejected apply can remove them.
   */
  materialize(
    media: readonly MediaDescriptor[],
    created: string[],
  ): Promise<Map<string, { uri: string; verified: boolean }>>;
  /** Removes copied files that no committed row references. */
  discard(created: readonly string[]): Promise<void>;
  /** Runs file work and the apply transaction without another one in between. */
  serialize<T>(operation: () => Promise<T>): Promise<T>;
}

export interface AppliedSyncState {
  entries: number;
  tags: number;
  prompts: number;
  profile: boolean;
}

/** Records whose stored form differs: what an apply has to write. */
function changedIds<T>(
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>,
): string[] {
  const ids: string[] = [];
  for (const [id, record] of after) {
    const old = before.get(id);
    if (
      !old ||
      canonicalize(old as unknown as Json) !== canonicalize(record as unknown as Json)
    )
      ids.push(id);
  }
  // A join never drops a record; a record only in `before` would be a bug.
  for (const id of before.keys())
    if (!after.has(id)) throw new Error(`Apply would drop ${id}`);
  return ids;
}

function shownMedia(state: SyncState): MediaDescriptor[] {
  const ids = new Set<string>();
  for (const entry of state.entries.values())
    if (isLive(entry)) for (const member of entry.attachments) ids.add(member.id);
  for (const item of state.profile.photo) if (item.v !== null) ids.add(item.v);
  return [...ids].map((id) => state.media.get(id)!);
}

function legacyAsset(descriptor: MediaDescriptor, uri: string): Asset {
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

/**
 * Keeps the file of a media row the apply removes, as v1 did: the retained
 * media reaper is the only code that deletes a file, once nothing uses it.
 */
async function retainRemovedMedia(tx: Tx, row: MediaRow, vaultId: string, now: number) {
  if (row.local_uri) {
    const ledgerId = randomUUID();
    await tx.insert(syncRetainedMedia).values({
      ledger_id: ledgerId,
      asset_id: row.asset_id,
      original_owner_type: row.owner_type,
      original_owner_id: row.owner_id,
      original_uri: row.local_uri,
      staged_uri: null,
      kind: row.kind,
      mime_type: row.mime_type,
      byte_size: row.byte_size,
      blob_hash: row.blob_hash,
      state: 'uploaded',
      attempt_count: 0,
      last_error_code: null,
      delete_after: null,
      created_at: now,
      updated_at: now,
    });
    await tx.insert(syncMediaObligations).values({
      obligation_id: randomUUID(),
      ledger_id: ledgerId,
      blob_hash: row.blob_hash,
      obligation_kind: 'remote-apply',
      obligation_key: `${vaultId}:${row.asset_id}:${row.blob_hash ?? 'unhashed'}`,
      completed_at: now,
      created_at: now,
    });
  }
  await tx.delete(mediaAssets).where(eq(mediaAssets.asset_id, row.asset_id));
}

const fieldValueRow = (
  type: SyncEntityType,
  id: string,
  field: string,
  s: Stamp,
  value: Json,
): typeof syncFieldValues.$inferInsert => ({
  entity_type: type,
  entity_id: id,
  field,
  stamp_hlc: s[0],
  stamp_device: s[1],
  value_json: JSON.stringify(value),
});

async function clearRecordRows(tx: Tx, type: SyncEntityType, id: string) {
  await tx
    .delete(syncFieldValues)
    .where(and(eq(syncFieldValues.entity_type, type), eq(syncFieldValues.entity_id, id)));
  await tx
    .delete(syncDeletedRecords)
    .where(
      and(eq(syncDeletedRecords.entity_type, type), eq(syncDeletedRecords.entity_id, id)),
    );
}

async function putRecord(
  tx: Tx,
  type: SyncEntityType,
  id: string,
  meta: RecordMeta,
  now: number,
) {
  const values = {
    vv_json: JSON.stringify(meta.vv),
    known_json: meta.known === null ? null : JSON.stringify(meta.known),
    stamps_json: JSON.stringify(meta.stamps),
    del_json: meta.del === null ? null : JSON.stringify(meta.del),
    ext_json: JSON.stringify(meta.ext),
    split_json: meta.split === null ? null : JSON.stringify(meta.split),
    updated_at: now,
  };
  await tx
    .insert(syncRecords)
    .values({ entity_type: type, entity_id: id, ...values })
    .onConflictDoUpdate({
      target: [syncRecords.entity_type, syncRecords.entity_id],
      set: values,
    });
}

/** The items beside the shown one, which is the first `shownItems` returns. */
function splitShown<T>(items: readonly Item<T>[]): {
  shown: Item<T> | null;
  rest: Item<T>[];
} {
  const shown = shownItems(items)[0] ?? null;
  return {
    shown,
    rest: shown
      ? items.filter((item) => compareStamps(item.s, shown.s) !== 0)
      : [...items],
  };
}

/** One member per ID goes on the row; the other stamps of that ID go beside it. */
function splitMembers(members: readonly Member[]) {
  const first = new Map<string, Stamp>();
  const rest: Member[] = [];
  for (const member of members) {
    const current = first.get(member.id);
    if (!current) first.set(member.id, member.s);
    else rest.push(member);
  }
  return { first, rest };
}

interface ApplyContext {
  tx: Tx;
  vaultId: string;
  now: number;
  files: Map<string, { uri: string; verified: boolean }>;
  mediaRows: Map<string, MediaRow>;
  /** Entry media rows by entry, read once. */
  mediaByEntry: Map<string, MediaRow[]>;
  /** Attachment lists of the entry rows the apply changes, read once. */
  entryAssets: Map<string, Asset[] | null>;
  state: SyncState;
  writes: Writes;
}

/** Rows an apply inserts, written in batches at the end. */
interface Writes {
  /** Records whose old field values, kept values and memberships go first. */
  cleared: string[];
  /** Entry rows that go (the entry is no longer shown). */
  hidden: string[];
  records: (typeof syncRecords.$inferInsert)[];
  fieldValues: (typeof syncFieldValues.$inferInsert)[];
  deleted: (typeof syncDeletedRecords.$inferInsert)[];
  entries: (typeof entries.$inferInsert)[];
  entryTags: (typeof entryTags.$inferInsert)[];
  media: (typeof mediaAssets.$inferInsert)[];
}

function recordRow(
  type: SyncEntityType,
  id: string,
  meta: RecordMeta,
  now: number,
): typeof syncRecords.$inferInsert {
  return {
    entity_type: type,
    entity_id: id,
    vv_json: JSON.stringify(meta.vv),
    known_json: meta.known === null ? null : JSON.stringify(meta.known),
    stamps_json: JSON.stringify(meta.stamps),
    del_json: meta.del === null ? null : JSON.stringify(meta.del),
    ext_json: JSON.stringify(meta.ext),
    split_json: meta.split === null ? null : JSON.stringify(meta.split),
    updated_at: now,
  };
}

function mediaRow(
  context: ApplyContext,
  descriptor: MediaDescriptor,
  s: Stamp | null,
): typeof mediaAssets.$inferInsert {
  const file = context.files.get(descriptor.assetId);
  if (!file) throw new Error(`No local file for ${descriptor.assetId}`);
  return {
    asset_id: descriptor.assetId,
    owner_type: descriptor.ownerType,
    owner_id: descriptor.ownerType === 'profile' ? SELF : descriptor.ownerId,
    kind: descriptor.kind,
    local_uri: file.uri,
    download_state: file.verified ? 'verified' : 'pending',
    mime_type: descriptor.mimeType,
    byte_size: descriptor.byteSize,
    width: descriptor.width,
    height: descriptor.height,
    duration_ms: descriptor.durationMs,
    blob_hash: descriptor.blobHash,
    created_at: descriptor.createdAt,
    updated_at: context.now,
    pending_local_delete_at: null,
    stamp_hlc: s?.[0] ?? null,
    stamp_device: s?.[1] ?? null,
    ext_json: JSON.stringify(descriptor.ext),
  };
}

function insertMediaRow(
  context: ApplyContext,
  descriptor: MediaDescriptor,
  s: Stamp | null,
) {
  return context.tx.insert(mediaAssets).values(mediaRow(context, descriptor, s));
}

/** Plans one entry's rows; shown entries that already have a row are updated here. */
async function writeEntry(context: ApplyContext, entry: EntryRecord, existed: boolean) {
  const { tx, now, writes } = context;
  const id = entry.id;
  if (existed) writes.cleared.push(id);
  const existingMedia = context.mediaByEntry.get(id) ?? [];
  const meta: RecordMeta = {
    vv: entry.vv,
    known: entry.known,
    stamps: {},
    del: entry.del,
    ext: entry.ext,
    split: entry.split,
  };
  if (!isLive(entry)) {
    writes.records.push(recordRow('entry', id, meta, now));
    if (context.entryAssets.has(id)) writes.hidden.push(id);
    for (const row of existingMedia)
      await retainRemovedMedia(tx, row, context.vaultId, now);
    if (!isCompacted(entry)) {
      const kept: DeletedEntryValues = {
        title: [...entry.title],
        text: [...entry.text],
        mood: entry.mood,
        date: entry.date,
        tags: [...entry.tags],
        attachments: [...entry.attachments],
        order: entry.order ? { s: entry.order.s, v: [...entry.order.v] } : null,
        media: memberIds(entry.attachments).map((assetId) =>
          context.state.media.get(assetId)!,
        ),
      };
      writes.deleted.push({
        entity_type: 'entry',
        entity_id: id,
        record_json: JSON.stringify(kept),
        deleted_at: now,
      });
    }
    return;
  }

  const title = splitShown(entry.title);
  const text = splitShown(entry.text);
  if (!title.shown || !text.shown || !entry.mood || !entry.date)
    throw new Error(`Entry ${id} is shown without values`);
  meta.stamps = {
    title: title.shown.s,
    text: text.shown.s,
    mood: entry.mood.s,
    date: entry.date.s,
    ...(entry.order ? { order: entry.order.s } : {}),
  };
  writes.records.push(recordRow('entry', id, meta, now));
  const tagMembers = splitMembers(entry.tags);
  const attachmentMembers = splitMembers(entry.attachments);
  writes.fieldValues.push(
    ...title.rest.map((item) => fieldValueRow('entry', id, 'title', item.s, item.v)),
    ...text.rest.map((item) => fieldValueRow('entry', id, 'text', item.s, item.v)),
    ...tagMembers.rest.map((member) =>
      fieldValueRow('entry', id, 'tags', member.s, member.id),
    ),
    ...attachmentMembers.rest.map((member) =>
      fieldValueRow('entry', id, 'attachments', member.s, member.id),
    ),
    ...(entry.order
      ? [fieldValueRow('entry', id, 'order', entry.order.s, [...entry.order.v])]
      : []),
  );

  // Attachments: published ones as the state says; ones this device has not
  // published yet stay, after them.
  const rowById = new Map<string, { uri: string; descriptor: MediaDescriptor | null }>();
  const unpublished = new Set<string>();
  for (const row of existingMedia) {
    const s = attachmentMembers.first.get(row.asset_id);
    if (row.stamp_hlc === null && !s) {
      unpublished.add(row.asset_id);
      rowById.set(row.asset_id, { uri: row.local_uri ?? '', descriptor: null });
      continue;
    }
    if (row.stamp_hlc === null && s) {
      // Another device published an attachment this device holds unpublished
      // under the same ID (two devices after the v1 cutover, or one import on
      // both). The same blob: adopt that descriptor and stamp, or capture
      // would leave the member out and the join would read it as removed.
      // A different blob under one ID is never merged.
      const theirs = context.state.media.get(row.asset_id)!;
      if (
        row.kind !== theirs.kind ||
        row.blob_hash !== theirs.blobHash ||
        row.byte_size !== theirs.byteSize
      )
        throw new SyncJoinError('asset-id-collision', `Asset ${row.asset_id} differs`);
      await tx
        .update(mediaAssets)
        .set({
          stamp_hlc: s[0],
          stamp_device: s[1],
          mime_type: theirs.mimeType,
          width: theirs.width,
          height: theirs.height,
          duration_ms: theirs.durationMs,
          created_at: theirs.createdAt,
          ext_json: JSON.stringify(theirs.ext),
        })
        .where(eq(mediaAssets.asset_id, row.asset_id));
      rowById.set(row.asset_id, { uri: row.local_uri ?? '', descriptor: theirs });
      continue;
    }
    if (!s) {
      await retainRemovedMedia(tx, row, context.vaultId, now);
      continue;
    }
    if (row.stamp_hlc !== s[0] || row.stamp_device !== s[1])
      await tx
        .update(mediaAssets)
        .set({ stamp_hlc: s[0], stamp_device: s[1] })
        .where(eq(mediaAssets.asset_id, row.asset_id));
    rowById.set(row.asset_id, {
      uri: row.local_uri ?? '',
      descriptor: descriptorOf(row),
    });
  }
  for (const [assetId, s] of attachmentMembers.first) {
    if (rowById.has(assetId)) continue;
    const descriptor = context.state.media.get(assetId)!;
    const row = mediaRow(context, descriptor, s);
    writes.media.push(row);
    rowById.set(assetId, { uri: row.local_uri ?? '', descriptor });
  }
  const previous = context.entryAssets.get(id) ?? null;
  const localOrder = shownAssetOrder(
    previous,
    existingMedia.map((row) => ({ asset_id: row.asset_id, local_uri: row.local_uri })),
  ).filter((assetId) => unpublished.has(assetId));
  const assets: Asset[] = [];
  for (const assetId of [...attachmentIds(entry), ...localOrder]) {
    const row = rowById.get(assetId);
    if (!row) continue;
    if (!row.descriptor) {
      const listed = previous?.find(
        (asset) => asset.assetId === assetId || asset.uri === row.uri,
      );
      if (listed) assets.push(listed);
      continue;
    }
    assets.push(legacyAsset(row.descriptor, row.uri));
  }
  const values = {
    text_title: title.shown.v,
    text_content: text.shown.v,
    mood: entry.mood.v,
    assets,
    tags: [...tagMembers.first.keys()].sort().join(','),
    created_at: entry.date.v,
    updated_at: now,
  };
  if (context.entryAssets.has(id))
    await tx.update(entries).set(values).where(eq(entries.note_id, id));
  else writes.entries.push({ note_id: id, ...values });
  for (const [tagId, s] of tagMembers.first)
    writes.entryTags.push({
      note_id: id,
      tag_id: tagId,
      created_at: now,
      updated_at: now,
      stamp_hlc: s[0],
      stamp_device: s[1],
    });
}

/** Ids per statement: well below SQLite's parameter limit. */
const IDS_PER_BATCH = 400;

async function flushEntryWrites(tx: Tx, writes: Writes) {
  for (let offset = 0; offset < writes.cleared.length; offset += IDS_PER_BATCH) {
    const ids = writes.cleared.slice(offset, offset + IDS_PER_BATCH);
    await tx
      .delete(syncFieldValues)
      .where(
        and(
          eq(syncFieldValues.entity_type, 'entry'),
          inArray(syncFieldValues.entity_id, ids),
        ),
      );
    await tx
      .delete(syncDeletedRecords)
      .where(
        and(
          eq(syncDeletedRecords.entity_type, 'entry'),
          inArray(syncDeletedRecords.entity_id, ids),
        ),
      );
    await tx.delete(entryTags).where(inArray(entryTags.note_id, ids));
  }
  for (let offset = 0; offset < writes.hidden.length; offset += IDS_PER_BATCH)
    await tx
      .delete(entries)
      .where(
        inArray(entries.note_id, writes.hidden.slice(offset, offset + IDS_PER_BATCH)),
      );
  await writeBatches(writes.records, (batch) =>
    tx
      .insert(syncRecords)
      .values(batch)
      .onConflictDoUpdate({
        target: [syncRecords.entity_type, syncRecords.entity_id],
        set: {
          vv_json: sql`excluded.vv_json`,
          known_json: sql`excluded.known_json`,
          stamps_json: sql`excluded.stamps_json`,
          del_json: sql`excluded.del_json`,
          ext_json: sql`excluded.ext_json`,
          split_json: sql`excluded.split_json`,
          updated_at: sql`excluded.updated_at`,
        },
      }),
  );
  await writeBatches(writes.fieldValues, (batch) =>
    tx.insert(syncFieldValues).values(batch),
  );
  await writeBatches(writes.deleted, (batch) =>
    tx.insert(syncDeletedRecords).values(batch),
  );
  await writeBatches(writes.entries, (batch) => tx.insert(entries).values(batch));
  await writeBatches(writes.entryTags, (batch) => tx.insert(entryTags).values(batch));
  await writeBatches(writes.media, (batch) => tx.insert(mediaAssets).values(batch));
}

async function writeNamed(
  context: ApplyContext,
  kind: NamedKind,
  record: NamedRecord,
  shown: boolean,
) {
  const { tx, now } = context;
  await clearRecordRows(tx, kind, record.id);
  await putRecord(
    tx,
    kind,
    record.id,
    {
      vv: record.vv,
      known: null,
      stamps: { title: record.title.s },
      del: record.del,
      ext: record.ext,
      split: null,
    },
    now,
  );
  if (!isLive(record)) {
    const kept: DeletedNamedValues = { title: record.title };
    await tx.insert(syncDeletedRecords).values({
      entity_type: kind,
      entity_id: record.id,
      record_json: JSON.stringify(kept),
      deleted_at: now,
    });
  }
  const table = kind === 'tag' ? tags : customPrompts;
  const idColumn = kind === 'tag' ? tags.tag_id : customPrompts.prompt_id;
  const [current] = await tx
    .select({ id: idColumn })
    .from(table)
    .where(eq(idColumn, record.id));
  if (!shown) {
    if (current) await tx.delete(table).where(eq(idColumn, record.id));
    return;
  }
  if (current)
    await tx
      .update(table)
      .set({ title: record.title.v, updated_at: now })
      .where(eq(idColumn, record.id));
  else if (kind === 'tag')
    await tx.insert(tags).values({
      tag_id: record.id,
      title: record.title.v,
      created_at: now,
      updated_at: now,
    });
  else
    await tx.insert(customPrompts).values({
      prompt_id: record.id,
      title: record.title.v,
      created_at: now,
      updated_at: now,
    });
}

async function writeProfile(
  context: ApplyContext,
  before: ProfileRecord,
  profile: ProfileRecord,
) {
  const { tx, now } = context;
  await clearRecordRows(tx, 'profile', PROFILE);
  const name = splitShown(profile.name);
  const photo = splitShown(profile.photo);
  await putRecord(
    tx,
    'profile',
    PROFILE,
    {
      vv: profile.vv,
      known: null,
      stamps: {
        ...(name.shown ? { name: name.shown.s } : {}),
        ...(photo.shown ? { photo: photo.shown.s } : {}),
      },
      del: null,
      ext: profile.ext,
      split: null,
    },
    now,
  );
  await writeBatches(
    [
      ...name.rest.map((item) =>
        fieldValueRow('profile', PROFILE, 'name', item.s, item.v),
      ),
      ...photo.rest.map((item) =>
        fieldValueRow('profile', PROFILE, 'photo', item.s, item.v),
      ),
    ],
    (batch) => tx.insert(syncFieldValues).values(batch),
  );
  const wanted = new Set(
    profile.photo.flatMap((item) => (item.v === null ? [] : [item.v])),
  );
  for (const assetId of wanted)
    if (!context.mediaRows.has(assetId))
      await insertMediaRow(context, context.state.media.get(assetId)!, null);
  // Photos only the replaced versions used. Other profile rows (none the
  // capture read) are left alone.
  for (const item of before.photo) {
    if (item.v === null || wanted.has(item.v)) continue;
    const row = context.mediaRows.get(item.v);
    if (row) await retainRemovedMedia(tx, row, context.vaultId, now);
  }
  const values = {
    display_name: name.shown?.v ?? null,
    photo_asset_id: photo.shown?.v ?? null,
    updated_at: now,
  };
  const [current] = await tx
    .select({ id: userProfile.profile_id })
    .from(userProfile)
    .where(eq(userProfile.profile_id, SELF));
  if (current)
    await tx.update(userProfile).set(values).where(eq(userProfile.profile_id, SELF));
  else await tx.insert(userProfile).values({ profile_id: SELF, email: null, ...values });
}

/**
 * Writes `next` (a join of the captured state with other devices' states)
 * into the local journal, changing only records whose stored form differs.
 * Returns null, writing nothing, when a local write happened after the
 * capture: the caller captures and joins again. `within` runs in the same
 * transaction, for the engine's own bookkeeping.
 */
export async function applySyncState(
  captured: CapturedSyncState,
  next: SyncState,
  files: ApplyMediaFiles,
  within?: (tx: Tx) => Promise<void>,
): Promise<AppliedSyncState | null> {
  const local = captured.state;
  if (next.vaultId !== local.vaultId) throw new Error('Apply of another vault');
  const entryIds = changedIds(local.entries, next.entries);
  const tagIds = changedIds(local.tags, next.tags);
  const promptIds = changedIds(local.prompts, next.prompts);
  const profileChanged =
    canonicalize(local.profile as unknown as Json) !==
    canonicalize(next.profile as unknown as Json);
  const shownBefore = new Set(liveTags(local).map((tag) => tag.id));
  const shownAfter = new Set(liveTags(next).map((tag) => tag.id));
  for (const id of new Set([...shownBefore, ...shownAfter]))
    if (shownBefore.has(id) !== shownAfter.has(id) && !tagIds.includes(id))
      tagIds.push(id);

  return files.serialize(async () => {
    const created: string[] = [];
    let applied: AppliedSyncState | null = null;
    try {
      const existing = new Set(
        (
          await runExclusiveDbTransaction((tx) =>
            tx.select({ id: mediaAssets.asset_id }).from(mediaAssets),
          )
        ).map((row) => row.id),
      );
      const needed = shownMedia(next).filter((media) => !existing.has(media.assetId));
      const materialized =
        needed.length > 0 ? await files.materialize(needed, created) : new Map();
      applied = await runExclusiveDbTransaction(async (rawTx) => {
        const tx = rawTx as Tx;
        const [device] = await tx
          .select()
          .from(syncDevice)
          .where(eq(syncDevice.id, SELF));
        if (
          !device ||
          device.ctx_json !== captured.guard ||
          device.device_id !== captured.deviceId ||
          device.vault_id !== local.vaultId
        )
          return null;
        const now = Date.now();
        const mediaRows = new Map(
          (await tx.select().from(mediaAssets)).map((row) => [row.asset_id, row]),
        );
        const mediaByEntry = new Map<string, MediaRow[]>();
        for (const row of mediaRows.values()) {
          if (row.owner_type !== 'entry') continue;
          const list = mediaByEntry.get(row.owner_id);
          if (list) list.push(row);
          else mediaByEntry.set(row.owner_id, [row]);
        }
        const entryAssets = new Map<string, Asset[] | null>();
        for (let offset = 0; offset < entryIds.length; offset += IDS_PER_BATCH)
          for (const row of await tx
            .select({ id: entries.note_id, assets: entries.assets })
            .from(entries)
            .where(
              inArray(entries.note_id, entryIds.slice(offset, offset + IDS_PER_BATCH)),
            ))
            entryAssets.set(row.id, row.assets);
        const context: ApplyContext = {
          tx,
          vaultId: next.vaultId,
          now,
          files: materialized,
          mediaRows,
          mediaByEntry,
          entryAssets,
          state: next,
          writes: {
            cleared: [],
            hidden: [],
            records: [],
            fieldValues: [],
            deleted: [],
            entries: [],
            entryTags: [],
            media: [],
          },
        };
        // Profile first: entry media rows below are looked up by ID, and a
        // profile photo never shares an ID with an attachment.
        if (profileChanged) await writeProfile(context, local.profile, next.profile);
        for (const id of entryIds)
          await writeEntry(context, next.entries.get(id)!, local.entries.has(id));
        await flushEntryWrites(tx, context.writes);
        for (const id of tagIds)
          await writeNamed(context, 'tag', next.tags.get(id)!, shownAfter.has(id));
        for (const id of promptIds) {
          const record = next.prompts.get(id)!;
          await writeNamed(context, 'prompt', record, isLive(record));
        }
        // A deleted tag shown only while an entry used it goes once none does,
        // even when its own record did not change.
        for (const row of await tx.select({ id: tags.tag_id }).from(tags))
          if (!shownAfter.has(row.id))
            await tx.delete(tags).where(eq(tags.tag_id, row.id));
        await tx
          .update(syncDevice)
          .set({
            ctx_json: JSON.stringify(next.ctx),
            roster_json: JSON.stringify(next.roster),
            acks_json: JSON.stringify(next.acks),
            floor_json: next.floor === null ? null : JSON.stringify(next.floor),
            updated_at: now,
          })
          .where(eq(syncDevice.id, SELF));
        await within?.(tx);
        return {
          entries: entryIds.length,
          tags: tagIds.length,
          prompts: promptIds.length,
          profile: profileChanged,
        };
      });
      return applied;
    } finally {
      if (!applied) await files.discard(created);
    }
  });
}

// ---------------------------------------------------------------- rebuild

/**
 * Gives every tag and prompt whose ID is not title-derived (made before
 * 2.0.0, or by an import that kept an archive's ID) the ID `namedId` gives
 * its title, updating the entries that use it. Two titles that normalise
 * alike take the next `attempt`, in creation order.
 */
async function rekeyNamedInTransaction(tx: Tx): Promise<void> {
  for (const kind of ['tag', 'prompt'] as const) {
    const rows =
      kind === 'tag'
        ? (await tx.select().from(tags)).map((row) => ({ id: row.tag_id, ...row }))
        : (await tx.select().from(customPrompts)).map((row) => ({
            id: row.prompt_id,
            ...row,
          }));
    const taken = new Set(
      rows
        .filter((row) => NAMED_ID.test(row.id) && row.id.startsWith(`${kind}-`))
        .map((row) => row.id),
    );
    const legacy = rows
      .filter((row) => !taken.has(row.id))
      .sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1));
    for (const row of legacy) {
      let attempt = 0;
      let id = namedId(kind, row.title);
      while (taken.has(id)) id = namedId(kind, row.title, ++attempt);
      taken.add(id);
      if (kind === 'prompt') {
        await tx
          .update(customPrompts)
          .set({ prompt_id: id })
          .where(eq(customPrompts.prompt_id, row.id));
        continue;
      }
      await tx.update(tags).set({ tag_id: id }).where(eq(tags.tag_id, row.id));
      await tx.update(entryTags).set({ tag_id: id }).where(eq(entryTags.tag_id, row.id));
    }
  }
  // Each entry's tag list follows its memberships.
  await tx.run(sql`UPDATE entries SET tags = coalesce((
      SELECT group_concat(tag_id, ',') FROM (
        SELECT tag_id FROM entry_tags WHERE entry_tags.note_id = entries.note_id ORDER BY tag_id
      )
    ), '')`);
}

/**
 * Binds the sync metadata to `vaultId` and rebuilds it from the journal, as
 * one write by a new device: every record gets one initial stamp, every tag
 * and prompt a title-derived ID. Attachments stay unstamped until published.
 *
 * Runs when this device first syncs with a vault, or with a different one
 * than its metadata was built for. That covers the v1 → v2 cutover (v1's
 * remote applies never kept this metadata), a journal joining a new vault
 * after "Delete journal everywhere", and connecting to another vault. The
 * old ID is never reused; nothing it wrote is lost locally, since the
 * journal's values are written again under the new one.
 */
export async function rebuildSyncMetadataInTransaction(
  tx: Tx,
  vaultId: string,
  now: number,
): Promise<string> {
  await rekeyNamedInTransaction(tx);
  await resetSyncIdentityInTransaction(tx, now);
  const [device] = await tx.select().from(syncDevice).where(eq(syncDevice.id, SELF));
  const hlc = nextHlc({}, Math.min(now, Date.now()));
  const deviceId = device!.device_id;
  const vv = JSON.stringify({ [deviceId]: hlc });
  const all = (fields: string[]) =>
    JSON.stringify(Object.fromEntries(fields.map((field) => [field, [hlc, deviceId]])));
  await tx.run(sql`INSERT INTO sync_records (entity_type, entity_id, vv_json, stamps_json, updated_at)
    SELECT 'entry', note_id, ${vv}, ${all(['title', 'text', 'mood', 'date'])}, ${now} FROM entries`);
  await tx.run(sql`INSERT INTO sync_records (entity_type, entity_id, vv_json, stamps_json, updated_at)
    SELECT 'tag', tag_id, ${vv}, ${all(['title'])}, ${now} FROM tags`);
  await tx.run(sql`INSERT INTO sync_records (entity_type, entity_id, vv_json, stamps_json, updated_at)
    SELECT 'prompt', prompt_id, ${vv}, ${all(['title'])}, ${now} FROM custom_prompts`);
  await tx.update(entryTags).set({ stamp_hlc: hlc, stamp_device: deviceId });
  // Every attachment is published again, under this vault's stamps.
  await tx
    .update(mediaAssets)
    .set({ stamp_hlc: null, stamp_device: null })
    .where(isNotNull(mediaAssets.stamp_hlc));
  const [profile] = await tx
    .select()
    .from(userProfile)
    .where(eq(userProfile.profile_id, SELF));
  const profileFields = [
    ...(profile?.display_name != null ? ['name'] : []),
    ...(profile?.photo_asset_id != null ? ['photo'] : []),
  ];
  if (profileFields.length > 0)
    await tx.insert(syncRecords).values({
      entity_type: 'profile',
      entity_id: PROFILE,
      vv_json: vv,
      stamps_json: all(profileFields),
      updated_at: now,
    });
  // An attachment order other devices would not show by default is written.
  const media = await tx
    .select({
      asset_id: mediaAssets.asset_id,
      owner_id: mediaAssets.owner_id,
      local_uri: mediaAssets.local_uri,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.owner_type, 'entry'));
  const byEntry = new Map<string, typeof media>();
  for (const row of media) {
    const list = byEntry.get(row.owner_id);
    if (list) list.push(row);
    else byEntry.set(row.owner_id, [row]);
  }
  if (byEntry.size > 0) {
    const withMedia = await tx
      .select({ id: entries.note_id, assets: entries.assets })
      .from(entries)
      .where(inArray(entries.note_id, [...byEntry.keys()]));
    for (const row of withMedia) {
      const order = shownAssetOrder(row.assets, byEntry.get(row.id)!);
      if (canonicalize(order) === canonicalize(defaultAssetOrder(null, order))) continue;
      const stamps = parse<Record<string, Stamp>>(all(['title', 'text', 'mood', 'date']));
      await tx
        .update(syncRecords)
        .set({ stamps_json: JSON.stringify({ ...stamps, order: [hlc, deviceId] }) })
        .where(
          and(eq(syncRecords.entity_type, 'entry'), eq(syncRecords.entity_id, row.id)),
        );
      await tx
        .insert(syncFieldValues)
        .values(fieldValueRow('entry', row.id, 'order', [hlc, deviceId], order));
    }
  }
  const [anything] = await tx
    .select({ id: syncRecords.entity_id })
    .from(syncRecords)
    .limit(1);
  await tx
    .update(syncDevice)
    .set({
      vault_id: vaultId,
      ...(anything ? { ctx_json: vv, roster_json: vv } : {}),
      updated_at: now,
    })
    .where(eq(syncDevice.id, SELF));
  return deviceId;
}
