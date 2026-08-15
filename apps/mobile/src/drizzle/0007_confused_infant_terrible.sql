CREATE TABLE `cloud_v2_base_shadow` (
	`vault_id` text NOT NULL,
	`device_id` text NOT NULL,
	`shadow_format_version` integer NOT NULL,
	`snapshot_id` text NOT NULL,
	`file_name` text NOT NULL,
	`canonical_sha256` text NOT NULL,
	`byte_count` integer NOT NULL,
	`committed_generation` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_v2_pending_publication` (
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
CREATE TABLE `cloud_v2_shadow_reaper` (
	`file_name` text PRIMARY KEY NOT NULL,
	`queued_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_v2_sync_state` (
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
