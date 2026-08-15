import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  blob,
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
    conflict_origin_id: text('conflict_origin_id'),
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
  conflict_origin_id: text('conflict_origin_id'),
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
  conflict_origin_id: text('conflict_origin_id'),
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

/**
 * Local provider/vault configuration. Credentials are deliberately absent.
 * `account_label` is a reserved v1 column and must remain null: the UI receives
 * the connected account label from the authorization provider instead. The
 * full email stays in SecureStore beside the credentials (and in memory while
 * displayed), never in this table.
 */
export const cloudVault = sqliteTable('cloud_vault', {
  vault_id: text('vault_id').primaryKey().notNull(),
  provider_kind: text('provider_kind', { enum: ['google-drive', 'dropbox'] }).notNull(),
  remote_root_id: text('remote_root_id'),
  account_label: text('account_label'),
  device_id: text('device_id').notNull(),
  next_edit_sequence: integer('next_edit_sequence').notNull().default(1),
  status: text('status').notNull().default('disabled'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
  last_connected_at: integer('last_connected_at'),
  seeding_checkpoint: text('seeding_checkpoint'),
  format_version: integer('format_version').notNull().default(1),
  protocol_version: integer('protocol_version').notNull().default(1),
  revocation_kind: text('revocation_kind', {
    enum: ['journal-deleted', 'backup-deleted'],
  }),
  revocation_id: text('revocation_id'),
  revocation_acknowledged_at: integer('revocation_acknowledged_at'),
});

export const syncEntityState = sqliteTable(
  'sync_entity_state',
  {
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    current_head_hashes: text('current_head_hashes', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    last_remote_head_hashes: text('last_remote_head_hashes', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    tombstone: integer('tombstone', { mode: 'boolean' }).notNull().default(false),
    local_generation: integer('local_generation').notNull().default(0),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entity_type, table.entity_id] })],
);

export const syncChangeQueue = sqliteTable(
  'sync_change_queue',
  {
    change_id: text('change_id').primaryKey().notNull(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    action: text('action', { enum: ['upsert', 'delete'] }).notNull(),
    base_head_hashes: text('base_head_hashes', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    generation: integer('generation').notNull(),
    batch_id: text('batch_id'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('sync_change_queue_entity_unique').on(
      table.entity_type,
      table.entity_id,
    ),
    index('sync_change_queue_batch_idx').on(table.batch_id),
  ],
);

export const syncVersions = sqliteTable(
  'sync_versions',
  {
    version_hash: text('version_hash').primaryKey().notNull(),
    vault_id: text('vault_id').notNull(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    parent_hashes: text('parent_hashes', { mode: 'json' }).$type<string[]>().notNull(),
    kind: text('kind', {
      enum: ['edit', 'resolution', 'recovery-init', 'join'],
    }).notNull(),
    author_device_id: text('author_device_id'),
    edit_sequence: integer('edit_sequence'),
    state: text('state', { enum: ['provisional', 'incomplete', 'complete'] }).notNull(),
    applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
    published: integer('published', { mode: 'boolean' }).notNull().default(false),
    canonical_body: text('canonical_body'),
    body_path: text('body_path'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [
    index('sync_versions_entity_idx').on(table.entity_type, table.entity_id),
    index('sync_versions_vault_idx').on(table.vault_id),
  ],
);

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

export const syncRemoteObjects = sqliteTable(
  'sync_remote_objects',
  {
    logical_key: text('logical_key').primaryKey().notNull(),
    content_hash: text('content_hash').notNull(),
    provider_file_id: text('provider_file_id'),
    status: text('status').notNull(),
    byte_count: integer('byte_count'),
    resumable_session_uri: text('resumable_session_uri'),
    resumable_session_expires_at: integer('resumable_session_expires_at'),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [index('sync_remote_objects_hash_idx').on(table.content_hash)],
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

/**
 * Atomic restart image for the deterministic sync state machine. The
 * normalized/domain and protocol tables remain authoritative; this row keeps
 * the pass-local cursor, staged page, seed cursor, and purge cursor together
 * so a process death cannot create a mixed checkpoint.
 */
export const syncEngineCheckpoints = sqliteTable(
  'sync_engine_checkpoints',
  {
    device_id: text('device_id').notNull(),
    vault_id: text('vault_id').notNull(),
    snapshot_json: text('snapshot_json').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.device_id, table.vault_id] })],
);

/** Per-entity dependency accounting kept outside the bounded pass checkpoint. */
export const syncEngineEntityMetadata = sqliteTable(
  'sync_engine_entity_metadata',
  {
    device_id: text('device_id').notNull(),
    vault_id: text('vault_id').notNull(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    fetched_dependencies_json: text('fetched_dependencies_json').notNull().default('[]'),
    recovery_dependencies_json: text('recovery_dependencies_json').notNull().default('[]'),
    degraded_reason: text('degraded_reason'),
  },
  (table) => [primaryKey({
    columns: [table.device_id, table.vault_id, table.entity_type, table.entity_id],
  })],
);

/** Dirty local state only; clean state is derived from its applied version. */
export const syncEngineLocalDomain = sqliteTable(
  'sync_engine_local_domain',
  {
    device_id: text('device_id').notNull(),
    vault_id: text('vault_id').notNull(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    generation: integer('generation').notNull(),
    state_json: text('state_json'),
  },
  (table) => [primaryKey({
    columns: [table.device_id, table.vault_id, table.entity_type, table.entity_id],
  })],
);

/** Gate-only inline blobs; production reconstructs file-backed byte sources. */
export const syncEngineLocalBlobs = sqliteTable(
  'sync_engine_local_blobs',
  {
    device_id: text('device_id').notNull(),
    vault_id: text('vault_id').notNull(),
    blob_hash: text('blob_hash').notNull(),
    body: blob('body', { mode: 'buffer' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.device_id, table.vault_id, table.blob_hash] })],
);

/**
 * Protocol-v2 snapshot publisher state. Credentials and provider identifiers
 * are deliberately absent; this row contains only restart-safe local intent.
 */
export const cloudV2SyncState = sqliteTable(
  'cloud_v2_sync_state',
  {
    vault_id: text('vault_id').notNull(),
    device_id: text('device_id').notNull(),
    journal_generation: integer('journal_generation').notNull().default(0),
    settled_generation: integer('settled_generation').notNull().default(0),
    next_device_sequence: integer('next_device_sequence').notNull().default(1),
    pause_reason: text('pause_reason'),
    pause_context_json: text('pause_context_json'),
    last_error_class: text('last_error_class'),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.vault_id, table.device_id] })],
);

/** One coalesced immutable candidate, advanced monotonically after each step. */
export const cloudV2PendingPublication = sqliteTable(
  'cloud_v2_pending_publication',
  {
    vault_id: text('vault_id').notNull(),
    device_id: text('device_id').notNull(),
    snapshot_id: text('snapshot_id').notNull(),
    device_sequence: integer('device_sequence').notNull(),
    captured_generation: integer('captured_generation').notNull(),
    compressed_bytes: blob('compressed_bytes', { mode: 'buffer' }).notNull(),
    media_hashes_json: text('media_hashes_json').notNull().default('[]'),
    stage: text('stage', {
      enum: [
        'candidate-persisted',
        'snapshot-uploaded',
        'snapshot-verified',
        'head-advanced',
        'domain-applied',
      ],
    }).notNull(),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.vault_id, table.device_id] })],
);

/** SQLite half of ADR V7-0005's atomically paired base-shadow checkpoint. */
export const cloudV2BaseShadow = sqliteTable(
  'cloud_v2_base_shadow',
  {
    vault_id: text('vault_id').notNull(),
    device_id: text('device_id').notNull(),
    shadow_format_version: integer('shadow_format_version').notNull(),
    snapshot_id: text('snapshot_id').notNull(),
    file_name: text('file_name').notNull(),
    canonical_sha256: text('canonical_sha256').notNull(),
    byte_count: integer('byte_count').notNull(),
    committed_generation: integer('committed_generation').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.vault_id, table.device_id] })],
);

/** Old shadow files are deleted only after their replacement checkpoint commits. */
export const cloudV2ShadowReaper = sqliteTable(
  'cloud_v2_shadow_reaper',
  {
    file_name: text('file_name').primaryKey().notNull(),
    queued_at: integer('queued_at').notNull(),
  },
);

/** Protocol-v2 deletion intent retained independently from the live domain. */
export const cloudV2Tombstones = sqliteTable(
  'cloud_v2_tombstones',
  {
    vault_id: text('vault_id').notNull(),
    entity_type: text('entity_type', {
      enum: ['entry', 'tag', 'prompt', 'profile'],
    }).notNull(),
    entity_id: text('entity_id').notNull(),
    base_state_hash: text('base_state_hash'),
    deleted_state_hash: text('deleted_state_hash'),
    deleted_by_device_id: text('deleted_by_device_id').notNull(),
    deletion_sequence: integer('deletion_sequence').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({
    columns: [table.vault_id, table.entity_type, table.entity_id],
  })],
);

/** Exact protocol-v2 conflict envelopes plus local review state. */
export const cloudV2Conflicts = sqliteTable(
  'cloud_v2_conflicts',
  {
    vault_id: text('vault_id').notNull(),
    conflict_id: text('conflict_id').notNull(),
    conflict_json: text('conflict_json').notNull(),
    acknowledged_at: integer('acknowledged_at'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.vault_id, table.conflict_id] })],
);

/**
 * Durable Drive discovery cursor, isolated by a random connection epoch kept
 * beside the Google credentials in SecureStore. The epoch is not an account
 * identifier and prevents a new Google connection from reusing stale file IDs
 * or a cursor belonging to the previous account.
 */
export const cloudV2DriveState = sqliteTable(
  'cloud_v2_drive_state',
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
export const cloudV2DriveObjects = sqliteTable(
  'cloud_v2_drive_objects',
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
    index('cloud_v2_drive_objects_key_idx').on(
      table.connection_id,
      table.vault_id,
      table.logical_key,
    ),
  ],
);

/** Resumable session URIs are local restart state and are never logged/evidenced. */
export const cloudV2DriveUploadSessions = sqliteTable(
  'cloud_v2_drive_upload_sessions',
  {
    connection_id: text('connection_id').notNull(),
    vault_id: text('vault_id').notNull(),
    logical_key: text('logical_key').notNull(),
    content_sha256: text('content_sha256').notNull(),
    session_uri: text('session_uri').notNull(),
    expires_at: integer('expires_at').notNull(),
    byte_count: integer('byte_count').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({
    columns: [
      table.connection_id,
      table.vault_id,
      table.logical_key,
      table.content_sha256,
    ],
  })],
);

export const syncConflicts = sqliteTable('sync_conflicts', {
  conflict_id: text('conflict_id').primaryKey().notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  head_hashes: text('head_hashes', { mode: 'json' }).$type<string[]>().notNull(),
  resolution_type: text('resolution_type').notNull(),
  recovered_entities: text('recovered_entities', { mode: 'json' })
    .$type<{ entityType: string; entityId: string }[]>()
    .notNull()
    .default([]),
  alternate_scalars: text('alternate_scalars', { mode: 'json' })
    .$type<unknown[]>()
    .notNull()
    .default([]),
  acknowledged_at: integer('acknowledged_at'),
  created_at: integer('created_at').notNull(),
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
export type SyncEntityState = typeof syncEntityState.$inferSelect;
export type SyncChange = typeof syncChangeQueue.$inferSelect;
