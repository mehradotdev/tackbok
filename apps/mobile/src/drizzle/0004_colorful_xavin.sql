CREATE TABLE `cloud_base_shadow` (
	`vault_id` text NOT NULL,
	`device_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`file_name` text NOT NULL,
	`canonical_sha256` text NOT NULL,
	`byte_count` integer NOT NULL,
	`committed_generation` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_conflicts` (
	`vault_id` text NOT NULL,
	`conflict_id` text NOT NULL,
	`conflict_json` text NOT NULL,
	`acknowledged_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `conflict_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_drive_objects` (
	`connection_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`file_id` text NOT NULL,
	`logical_key` text NOT NULL,
	`object_kind` text NOT NULL,
	`content_sha256` text NOT NULL,
	`byte_count` integer NOT NULL,
	`created_at` integer,
	`head_json` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`connection_id`, `vault_id`, `file_id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_drive_objects_key_idx` ON `cloud_drive_objects` (`connection_id`,`vault_id`,`logical_key`);--> statement-breakpoint
CREATE TABLE `cloud_drive_state` (
	`connection_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`change_cursor` text,
	`inventory_complete` integer DEFAULT false NOT NULL,
	`retry_not_before` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`connection_id`, `vault_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_drive_upload_sessions` (
	`connection_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`logical_key` text NOT NULL,
	`content_sha256` text NOT NULL,
	`session_uri` text NOT NULL,
	`expires_at` integer NOT NULL,
	`byte_count` integer NOT NULL,
	`uploaded_bytes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`connection_id`, `vault_id`, `logical_key`, `content_sha256`)
);
--> statement-breakpoint
CREATE TABLE `cloud_pending_publication` (
	`vault_id` text NOT NULL,
	`device_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`device_sequence` integer NOT NULL,
	`captured_generation` integer NOT NULL,
	`compressed_bytes` blob NOT NULL,
	`media_hashes_json` text DEFAULT '[]' NOT NULL,
	`stage` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_shadow_reaper` (
	`file_name` text PRIMARY KEY NOT NULL,
	`queued_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_sync_migration` (
	`migration_id` text PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`cursor` text,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `cloud_sync_migration_items` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`normalized_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_sync_state` (
	`vault_id` text NOT NULL,
	`device_id` text NOT NULL,
	`journal_generation` integer DEFAULT 0 NOT NULL,
	`settled_generation` integer DEFAULT 0 NOT NULL,
	`next_device_sequence` integer DEFAULT 1 NOT NULL,
	`pause_reason` text,
	`pause_context_json` text,
	`last_error_class` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_tombstones` (
	`vault_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`base_state_hash` text,
	`deleted_state_hash` text,
	`deleted_by_device_id` text NOT NULL,
	`deletion_sequence` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_vault` (
	`vault_id` text PRIMARY KEY NOT NULL,
	`provider_kind` text NOT NULL,
	`remote_root_id` text,
	`device_id` text NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_connected_at` integer,
	`revocation_kind` text,
	`revocation_id` text,
	`revocation_acknowledged_at` integer
);
--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `entries`(`note_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`tag_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_tags_tag_idx` ON `entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`local_uri` text,
	`download_state` text DEFAULT 'n/a' NOT NULL,
	`mime_type` text,
	`byte_size` integer,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`blob_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`pending_local_delete_at` integer
);
--> statement-breakpoint
CREATE INDEX `media_assets_owner_idx` ON `media_assets` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `media_assets_blob_hash_idx` ON `media_assets` (`blob_hash`);--> statement-breakpoint
CREATE TABLE `sync_media_obligations` (
	`obligation_id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`blob_hash` text,
	`obligation_kind` text NOT NULL,
	`obligation_key` text NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`) REFERENCES `sync_retained_media`(`ledger_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_media_obligation_unique` ON `sync_media_obligations` (`ledger_id`,`obligation_kind`,`obligation_key`);--> statement-breakpoint
CREATE INDEX `sync_media_obligation_hash_idx` ON `sync_media_obligations` (`blob_hash`);--> statement-breakpoint
CREATE TABLE `sync_provider_state` (
	`provider_kind` text PRIMARY KEY NOT NULL,
	`change_cursor` text,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_verify_at` integer,
	`last_full_listing_at` integer,
	`pause_code` text,
	`error_code` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_retained_media` (
	`ledger_id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`original_owner_type` text NOT NULL,
	`original_owner_id` text NOT NULL,
	`original_uri` text NOT NULL,
	`staged_uri` text,
	`kind` text NOT NULL,
	`mime_type` text,
	`byte_size` integer,
	`blob_hash` text,
	`state` text DEFAULT 'recorded' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`delete_after` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_retained_media_asset_idx` ON `sync_retained_media` (`asset_id`);--> statement-breakpoint
CREATE INDEX `sync_retained_media_hash_idx` ON `sync_retained_media` (`blob_hash`);--> statement-breakpoint
CREATE TABLE `user_profile` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`photo_asset_id` text,
	`email` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`photo_asset_id`) REFERENCES `media_assets`(`asset_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
DROP INDEX `custom_prompts_title_unique`;--> statement-breakpoint
ALTER TABLE `custom_prompts` ADD `conflict_origin_id` text;--> statement-breakpoint
DROP INDEX `tags_title_unique`;--> statement-breakpoint
ALTER TABLE `tags` ADD `conflict_origin_id` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `conflict_origin_id` text;
