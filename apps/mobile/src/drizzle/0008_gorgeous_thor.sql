CREATE TABLE `cloud_v2_drive_objects` (
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
CREATE INDEX `cloud_v2_drive_objects_key_idx` ON `cloud_v2_drive_objects` (`connection_id`,`vault_id`,`logical_key`);--> statement-breakpoint
CREATE TABLE `cloud_v2_drive_state` (
	`connection_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`change_cursor` text,
	`inventory_complete` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`connection_id`, `vault_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_v2_drive_upload_sessions` (
	`connection_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`logical_key` text NOT NULL,
	`content_sha256` text NOT NULL,
	`session_uri` text NOT NULL,
	`expires_at` integer NOT NULL,
	`byte_count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`connection_id`, `vault_id`, `logical_key`, `content_sha256`)
);
