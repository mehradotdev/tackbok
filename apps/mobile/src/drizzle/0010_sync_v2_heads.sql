CREATE TABLE `sync_heads` (
	`vault_id` text NOT NULL,
	`device_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`device_sequence` integer NOT NULL,
	`ctx_json` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `device_id`)
);
