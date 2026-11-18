import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import type { Asset, Mood } from '~/types';

// ============================================================================
// Tables
// ============================================================================

/**
 * Core journal entries table.
 * - Primary Key: UUID (note_id)
 * - Assets: Stored as a JSON column (denormalized)
 * - Mood: One of 5 constant values
 * - Nullable Fields: Title, Content, Mood, and Assets are all optional; only Timestamp is required
 */
export const entries = sqliteTable(
  'entries',
  {
    note_id: text('note_id').primaryKey().notNull(),
    text_title: text('text_title'),
    text_content: text('text_content'),
    mood: text('mood').$type<Mood>(),
    assets: text('assets', { mode: 'json' }).$type<Asset[]>(),
    tags: text('tags').notNull().default(''),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [index('entries_created_at_idx').on(table.created_at)],
);

/**
 * Global tags table.
 * Allows for renaming tags application-wide.
 */
export const tags = sqliteTable('tags', {
  tag_id: text('tag_id').primaryKey().notNull(),
  title: text('title').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

/**
 * User-created reusable journal title prompts.
 * Built-in prompts remain static translation keys in code; only custom prompts live in DB.
 */
export const customPrompts = sqliteTable('custom_prompts', {
  prompt_id: text('prompt_id').primaryKey().notNull(),
  title: text('title').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

/** Normalized media metadata. File bytes remain outside SQLite. */
export const mediaAssets = sqliteTable(
  'media_assets',
  {
    asset_id: text('asset_id').primaryKey().notNull(),
    owner_type: text('owner_type', { enum: ['entry', 'profile'] }).notNull(),
    owner_id: text('owner_id').notNull(),
    kind: text('kind', { enum: ['photo', 'voice', 'profile-photo'] }).notNull(),
    local_uri: text('local_uri'),
    download_state: text('download_state', {
      enum: ['n/a', 'pending', 'downloading', 'verified', 'missing'],
    })
      .notNull()
      .default('n/a'),
    mime_type: text('mime_type'),
    byte_size: integer('byte_size'),
    width: integer('width'),
    height: integer('height'),
    duration_ms: integer('duration_ms'),
    blob_hash: text('blob_hash'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
    pending_local_delete_at: integer('pending_local_delete_at'),
    /**
     * Sync v2: the stamp of the attach. Set when the attachment is first
     * published (its blob is then on the provider), so null until P6.
     */
    stamp_hlc: integer('stamp_hlc'),
    stamp_device: text('stamp_device'),
    /**
     * Sync v2: the descriptor's feature-keyed `ext`, kept exactly as received
     * (a descriptor is immutable, so another copy must match it byte for byte).
     */
    ext_json: text('ext_json').notNull().default('{}'),
  },
  (table) => [
    index('media_assets_owner_idx').on(table.owner_type, table.owner_id),
    index('media_assets_blob_hash_idx').on(table.blob_hash),
  ],
);

export const entryTags = sqliteTable(
  'entry_tags',
  {
    note_id: text('note_id')
      .notNull()
      .references(() => entries.note_id, { onDelete: 'cascade' }),
    tag_id: text('tag_id')
      .notNull()
      .references(() => tags.tag_id, { onDelete: 'cascade' }),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
    /** Sync v2: the stamp of the add that put this tag on the entry. */
    stamp_hlc: integer('stamp_hlc'),
    stamp_device: text('stamp_device'),
  },
  (table) => [
    primaryKey({ columns: [table.note_id, table.tag_id] }),
    index('entry_tags_tag_idx').on(table.tag_id),
  ],
);

export const userProfile = sqliteTable('user_profile', {
  profile_id: text('profile_id').primaryKey().notNull(),
  display_name: text('display_name'),
  photo_asset_id: text('photo_asset_id').references(() => mediaAssets.asset_id, {
    onDelete: 'set null',
  }),
  email: text('email'),
  updated_at: integer('updated_at').notNull(),
});

/** Local provider/vault configuration. Credentials and account labels are absent. */
export const cloudVault = sqliteTable('cloud_vault', {
  vault_id: text('vault_id').primaryKey().notNull(),
  provider_kind: text('provider_kind', { enum: ['google-drive', 'dropbox'] }).notNull(),
  remote_root_id: text('remote_root_id'),
  device_id: text('device_id').notNull(),
  status: text('status').notNull().default('disabled'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
  last_connected_at: integer('last_connected_at'),
  revocation_kind: text('revocation_kind', {
    enum: ['journal-deleted', 'backup-deleted'],
  }),
  revocation_id: text('revocation_id'),
  revocation_acknowledged_at: integer('revocation_acknowledged_at'),
});

export const syncRetainedMedia = sqliteTable(
  'sync_retained_media',
  {
    ledger_id: text('ledger_id').primaryKey().notNull(),
    asset_id: text('asset_id').notNull(),
    original_owner_type: text('original_owner_type').notNull(),
    original_owner_id: text('original_owner_id').notNull(),
    original_uri: text('original_uri').notNull(),
    staged_uri: text('staged_uri'),
    kind: text('kind').notNull(),
    mime_type: text('mime_type'),
    byte_size: integer('byte_size'),
    blob_hash: text('blob_hash'),
    state: text('state', {
      enum: ['recorded', 'staged', 'uploaded', 'safe_to_delete', 'missing', 'failed'],
    })
      .notNull()
      .default('recorded'),
    attempt_count: integer('attempt_count').notNull().default(0),
    last_error_code: text('last_error_code'),
    delete_after: integer('delete_after'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    index('sync_retained_media_asset_idx').on(table.asset_id),
    index('sync_retained_media_hash_idx').on(table.blob_hash),
  ],
);

export const syncMediaObligations = sqliteTable(
  'sync_media_obligations',
  {
    obligation_id: text('obligation_id').primaryKey().notNull(),
    ledger_id: text('ledger_id')
      .notNull()
      .references(() => syncRetainedMedia.ledger_id, { onDelete: 'cascade' }),
    blob_hash: text('blob_hash'),
    obligation_kind: text('obligation_kind').notNull(),
    obligation_key: text('obligation_key').notNull(),
    completed_at: integer('completed_at'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('sync_media_obligation_unique').on(
      table.ledger_id,
      table.obligation_kind,
      table.obligation_key,
    ),
    index('sync_media_obligation_hash_idx').on(table.blob_hash),
  ],
);

export const syncProviderState = sqliteTable('sync_provider_state', {
  provider_kind: text('provider_kind').primaryKey().notNull(),
  change_cursor: text('change_cursor'),
  last_attempt_at: integer('last_attempt_at'),
  last_success_at: integer('last_success_at'),
  last_verify_at: integer('last_verify_at'),
  last_full_listing_at: integer('last_full_listing_at'),
  pause_code: text('pause_code'),
  error_code: text('error_code'),
  updated_at: integer('updated_at').notNull(),
});

/** Snapshot publisher state. Credentials and provider identifiers are absent. */
export const cloudSyncState = sqliteTable(
  'cloud_sync_state',
  {
    vault_id: text('vault_id').notNull(),
    device_id: text('device_id').notNull(),
    journal_generation: integer('journal_generation').notNull().default(0),
    settled_generation: integer('settled_generation').notNull().default(0),
    next_device_sequence: integer('next_device_sequence').notNull().default(1),
    pause_reason: text('pause_reason'),
    pause_context_json: text('pause_context_json'),
    last_error_class: text('last_error_class'),
    /** Other devices' heads the last pass skipped (`SkippedHead[]`), or null. */
    skipped_heads_json: text('skipped_heads_json'),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.vault_id, table.device_id] })],
);

/**
 * Durable Drive discovery cursor, isolated by a random connection epoch kept
 * beside the Google credentials in SecureStore. The epoch is not an account
 * identifier and prevents a new Google connection from reusing stale file IDs
 * or a cursor belonging to the previous account.
 */
export const cloudDriveState = sqliteTable(
  'cloud_drive_state',
  {
    connection_id: text('connection_id').notNull(),
    vault_id: text('vault_id').notNull(),
    change_cursor: text('change_cursor'),
    inventory_complete: integer('inventory_complete', { mode: 'boolean' })
      .notNull()
      .default(false),
    retry_not_before: integer('retry_not_before').notNull().default(0),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.connection_id, table.vault_id] })],
);

/** Provider metadata only: never tokens, account labels, bodies, or journal text. */
export const cloudDriveObjects = sqliteTable(
  'cloud_drive_objects',
  {
    connection_id: text('connection_id').notNull(),
    vault_id: text('vault_id').notNull(),
    file_id: text('file_id').notNull(),
    logical_key: text('logical_key').notNull(),
    object_kind: text('object_kind', {
      enum: ['snapshot', 'head', 'media', 'revocation'],
    }).notNull(),
    content_sha256: text('content_sha256').notNull(),
    byte_count: integer('byte_count').notNull(),
    created_at: integer('created_at'),
    head_json: text('head_json'),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connection_id, table.vault_id, table.file_id] }),
    index('cloud_drive_objects_key_idx').on(
      table.connection_id,
      table.vault_id,
      table.logical_key,
    ),
  ],
);

/** Resumable session URIs are local restart state and are never logged/evidenced. */
export const cloudDriveUploadSessions = sqliteTable(
  'cloud_drive_upload_sessions',
  {
    connection_id: text('connection_id').notNull(),
    vault_id: text('vault_id').notNull(),
    logical_key: text('logical_key').notNull(),
    content_sha256: text('content_sha256').notNull(),
    session_uri: text('session_uri').notNull(),
    expires_at: integer('expires_at').notNull(),
    byte_count: integer('byte_count').notNull(),
    uploaded_bytes: integer('uploaded_bytes').notNull().default(0),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.connection_id,
        table.vault_id,
        table.logical_key,
        table.content_sha256,
      ],
    }),
  ],
);

/**
 * Local only, never part of a snapshot: SHA-256 of media files keyed by their
 * path relative to the document directory. A row is trusted only while the
 * file keeps the size and modification time it had when hashed; losing the
 * table only means hashing again.
 */
export const cloudSyncMediaHashCache = sqliteTable('cloud_sync_media_hash_cache', {
  path: text('path').primaryKey().notNull(),
  size: integer('size').notNull(),
  modified_at: integer('modified_at').notNull(),
  sha256: text('sha256').notNull(),
  hashed_at: integer('hashed_at').notNull(),
  /** Rows from another hashing or key format are deleted on load. */
  format_version: integer('format_version').notNull(),
});

/** Application-level backfill checkpoint; deliberately separate from SQL migrations. */
export const cloudSyncMigration = sqliteTable('cloud_sync_migration', {
  migration_id: text('migration_id').primaryKey().notNull(),
  phase: text('phase').notNull(),
  cursor: text('cursor'),
  status: text('status').notNull(),
  updated_at: integer('updated_at').notNull(),
  completed_at: integer('completed_at'),
});

export const cloudSyncMigrationItems = sqliteTable(
  'cloud_sync_migration_items',
  {
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    normalized_at: integer('normalized_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entity_type, table.entity_id] })],
);

// ============================================================================
// Cloud sync v2 (issue #185). Local only until the v2 engine ships; nothing in
// the app reads these yet. Device IDs and vectors use the in-memory form of
// `src/lib/cloudSync/v2/types.ts`: a stamp is [hlc, deviceId], a version
// vector is a JSON object {deviceId: hlc}.
// ============================================================================

/**
 * This install's sync identity and clock. One row ('self'), created by the
 * 0008 migration with a random device ID. A wipe must replace the device ID
 * and reset the context (done from P4 on): an ID is never reused once local
 * state is lost. The row is in the database, so an OS backup restores it;
 * `install_id` binds it to a marker the backup leaves out
 * (`installBinding.ts`, P13). The metadata belongs to one vault
 * (`vault_id`): binding to another, or to the first one, rebuilds it with a
 * new device ID (`rebuildSyncMetadataInTransaction`).
 */
export const syncDevice = sqliteTable('sync_device', {
  id: text('id').primaryKey().notNull(),
  device_id: text('device_id').notNull(),
  /** The vault this metadata was built for; null until the first v2 sync. */
  vault_id: text('vault_id'),
  /**
   * The install marker this row belongs to (`installBinding.ts`); null until
   * the first check after the upgrade that added it.
   */
  install_id: text('install_id'),
  /** Highest HLC seen per device (the state's context). */
  ctx_json: text('ctx_json').notNull().default('{}'),
  /** Device -> last-seen HLC. */
  roster_json: text('roster_json').notNull().default('{}'),
  /** Device -> acknowledged context (`markSeen`). */
  acks_json: text('acks_json').notNull().default('{}'),
  /** Highest compaction floor used, or null. */
  floor_json: text('floor_json'),
  /**
   * Old device IDs of this install waiting to be retired in their vault
   * (`PendingRetirement[]`, `syncStamps.ts`): kept across a reset, written
   * into the state at the next pass in that vault.
   */
  retired_json: text('retired_json').notNull().default('[]'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

/**
 * Per-record sync metadata for entries, tags, prompts and the profile. The
 * values stay in their own tables (the shown value of each field); this row
 * holds what the v2 join needs beside them.
 */
export const syncRecords = sqliteTable(
  'sync_records',
  {
    entity_type: text('entity_type', {
      enum: ['entry', 'tag', 'prompt', 'profile'],
    }).notNull(),
    entity_id: text('entity_id').notNull(),
    /** Every write to the record, including replaced values. */
    vv_json: text('vv_json').notNull(),
    /** Writes the record holds values for, when less than `vv_json` (entries). */
    known_json: text('known_json'),
    /** Field -> [hlc, deviceId] of the shown value (title, text, mood, date, order, name, photo). */
    stamps_json: text('stamps_json').notNull().default('{}'),
    /** Tombstone: {at, seen, ackSeen, ext}, or null. Kept while the record is shown again. */
    del_json: text('del_json'),
    /** Feature -> stamped items, kept for features this build does not know. */
    ext_json: text('ext_json').notNull().default('{}'),
    /** Set on an entry made by "Keep both": {from, field, s}. */
    split_json: text('split_json'),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entity_type, table.entity_id] })],
);

/**
 * Values beside the shown one: the other open versions of a multi-value
 * field (title, text, profile name or photo), and a set member's extra
 * stamps (field 'tags' or 'attachments', value = the member ID). One write
 * can add several members under one stamp, so the value is in the key.
 */
export const syncFieldValues = sqliteTable(
  'sync_field_values',
  {
    entity_type: text('entity_type', {
      enum: ['entry', 'tag', 'prompt', 'profile'],
    }).notNull(),
    entity_id: text('entity_id').notNull(),
    field: text('field').notNull(),
    stamp_hlc: integer('stamp_hlc').notNull(),
    stamp_device: text('stamp_device').notNull(),
    value_json: text('value_json').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.entity_type,
        table.entity_id,
        table.field,
        table.stamp_hlc,
        table.stamp_device,
        table.value_json,
      ],
    }),
  ],
);

/**
 * A deleted record's values, kept behind its tombstone so an edit the
 * deleter had not seen brings it back whole (the record's row in its own
 * table is gone). The vector and tombstone stay in `sync_records` only.
 * Compaction deletes the row.
 */
export const syncDeletedRecords = sqliteTable(
  'sync_deleted_records',
  {
    entity_type: text('entity_type', {
      enum: ['entry', 'tag', 'prompt', 'profile'],
    }).notNull(),
    entity_id: text('entity_id').notNull(),
    /** The record's last values and their stamps, as JSON. */
    record_json: text('record_json').notNull(),
    deleted_at: integer('deleted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entity_type, table.entity_id] })],
);

/**
 * Sync v2 engine bookkeeping, per vault and device: the head snapshot this
 * device last took in from each other device (so a pass downloads only
 * heads that changed), and for this device the snapshot it last published
 * with the context it held (`ctx_json`), which tells it whether it has
 * writes it has not published yet.
 */
export const syncHeads = sqliteTable(
  'sync_heads',
  {
    vault_id: text('vault_id').notNull(),
    device_id: text('device_id').notNull(),
    snapshot_id: text('snapshot_id').notNull(),
    device_sequence: integer('device_sequence').notNull(),
    /** This device's row only: the context it published. */
    ctx_json: text('ctx_json'),
    /**
     * This device's row only: the snapshot its head is about to move to, so
     * a pass stopped after the move does not take the head for another
     * install's.
     */
    pending_snapshot_id: text('pending_snapshot_id'),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.vault_id, table.device_id] })],
);

// ============================================================================
// Inferred Types
// ============================================================================

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type CustomPrompt = typeof customPrompts.$inferSelect;
export type NewCustomPrompt = typeof customPrompts.$inferInsert;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type UserProfile = typeof userProfile.$inferSelect;
