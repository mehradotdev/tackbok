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
CREATE TABLE `cloud_vault` (
	`vault_id` text PRIMARY KEY NOT NULL,
	`provider_kind` text NOT NULL,
	`remote_root_id` text,
	`account_label` text,
	`device_id` text NOT NULL,
	`next_edit_sequence` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_connected_at` integer,
	`seeding_checkpoint` text,
	`format_version` integer DEFAULT 1 NOT NULL,
	`protocol_version` integer DEFAULT 1 NOT NULL,
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
CREATE TABLE `sync_change_queue` (
	`change_id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`base_head_hashes` text DEFAULT '[]' NOT NULL,
	`generation` integer NOT NULL,
	`batch_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_change_queue_entity_unique` ON `sync_change_queue` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `sync_change_queue_batch_idx` ON `sync_change_queue` (`batch_id`);--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`conflict_id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`head_hashes` text NOT NULL,
	`resolution_type` text NOT NULL,
	`recovered_entities` text DEFAULT '[]' NOT NULL,
	`alternate_scalars` text DEFAULT '[]' NOT NULL,
	`acknowledged_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_entity_state` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`current_head_hashes` text DEFAULT '[]' NOT NULL,
	`last_remote_head_hashes` text DEFAULT '[]' NOT NULL,
	`tombstone` integer DEFAULT false NOT NULL,
	`local_generation` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
--> statement-breakpoint
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
CREATE TABLE `sync_remote_objects` (
	`logical_key` text PRIMARY KEY NOT NULL,
	`content_hash` text NOT NULL,
	`provider_file_id` text,
	`status` text NOT NULL,
	`byte_count` integer,
	`resumable_session_uri` text,
	`resumable_session_expires_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_remote_objects_hash_idx` ON `sync_remote_objects` (`content_hash`);--> statement-breakpoint
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
CREATE TABLE `sync_versions` (
	`version_hash` text PRIMARY KEY NOT NULL,
	`vault_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`parent_hashes` text NOT NULL,
	`kind` text NOT NULL,
	`author_device_id` text,
	`edit_sequence` integer,
	`state` text NOT NULL,
	`applied` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`canonical_body` text,
	`body_path` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_versions_entity_idx` ON `sync_versions` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `sync_versions_vault_idx` ON `sync_versions` (`vault_id`);--> statement-breakpoint
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
ALTER TABLE `tags` ADD `conflict_origin_id` text;