CREATE TABLE `sync_media_gc` (
	`vault_id` text NOT NULL,
	`blob_hash` text NOT NULL,
	`unreferenced_since` integer NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `blob_hash`)
);
--> statement-breakpoint
CREATE TABLE `sync_snapshot_media` (
	`vault_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`blobs_json` text NOT NULL,
	PRIMARY KEY(`vault_id`, `snapshot_id`)
);
