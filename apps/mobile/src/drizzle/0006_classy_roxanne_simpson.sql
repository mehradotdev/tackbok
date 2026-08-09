CREATE TABLE `sync_engine_entity_metadata` (
	`device_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`fetched_dependencies_json` text DEFAULT '[]' NOT NULL,
	`recovery_dependencies_json` text DEFAULT '[]' NOT NULL,
	`degraded_reason` text,
	PRIMARY KEY(`device_id`, `vault_id`, `entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_engine_local_blobs` (
	`device_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`blob_hash` text NOT NULL,
	`body` blob NOT NULL,
	PRIMARY KEY(`device_id`, `vault_id`, `blob_hash`)
);
--> statement-breakpoint
CREATE TABLE `sync_engine_local_domain` (
	`device_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`generation` integer NOT NULL,
	`state_json` text,
	PRIMARY KEY(`device_id`, `vault_id`, `entity_type`, `entity_id`)
);
