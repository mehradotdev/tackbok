CREATE TABLE `entries` (
	`note_id` text PRIMARY KEY NOT NULL,
	`text_title` text,
	`text_content` text NOT NULL,
	`mood` text,
	`assets` text,
	`tags` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_title_unique` ON `tags` (`title`);