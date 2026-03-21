PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entries` (
	`note_id` text PRIMARY KEY NOT NULL,
	`text_title` text,
	`text_content` text,
	`mood` text,
	`assets` text,
	`tags` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_entries`("note_id", "text_title", "text_content", "mood", "assets", "tags", "created_at", "updated_at") SELECT "note_id", "text_title", "text_content", "mood", "assets", "tags", "created_at", "updated_at" FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `__new_entries` RENAME TO `entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;