DROP TABLE `entry_tags`;--> statement-breakpoint
ALTER TABLE `entries` ADD `tags` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` DROP COLUMN `is_favorite`;