CREATE TABLE `custom_prompts` (
	`prompt_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_prompts_title_unique` ON `custom_prompts` (`title`);