ALTER TABLE `media_assets` ADD `ext_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_device` ADD `vault_id` text;