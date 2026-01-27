CREATE TABLE `entries` (
	`note_id` text PRIMARY KEY NOT NULL,
	`text_title` text,
	`text_content` text,
	`mood` text,
	`assets` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`is_favorite` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`entry_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`entry_id`, `tag_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`note_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`tag_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_title_unique` ON `tags` (`title`);--> statement-breakpoint
DROP TABLE `users_table`;