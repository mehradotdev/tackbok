PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entries` (
	`note_id` text PRIMARY KEY NOT NULL,
	`text_title` text,
	`text_content` text NOT NULL,
	`mood` text,
	`assets` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`is_favorite` integer DEFAULT false
);
--> statement-breakpoint
INSERT INTO `__new_entries`("note_id", "text_title", "text_content", "mood", "assets", "created_at", "updated_at", "is_favorite") SELECT "note_id", "text_title", COALESCE("text_content", ''), "mood", "assets", "created_at", "updated_at", "is_favorite" FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `__new_entries` RENAME TO `entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;