CREATE TABLE `sync_engine_checkpoints` (
	`device_id` text NOT NULL,
	`vault_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `vault_id`)
);
