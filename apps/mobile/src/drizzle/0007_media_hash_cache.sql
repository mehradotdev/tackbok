CREATE TABLE `cloud_sync_media_hash_cache` (
	`path` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`modified_at` integer NOT NULL,
	`sha256` text NOT NULL,
	`hashed_at` integer NOT NULL,
	`format_version` integer NOT NULL
);
