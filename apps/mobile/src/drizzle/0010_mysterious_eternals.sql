CREATE TABLE `cloud_v2_conflicts` (
	`vault_id` text NOT NULL,
	`conflict_id` text NOT NULL,
	`conflict_json` text NOT NULL,
	`acknowledged_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `conflict_id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_v2_tombstones` (
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
ALTER TABLE `entries` ADD `conflict_origin_id` text;