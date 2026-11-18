DROP TABLE `cloud_base_shadow`;--> statement-breakpoint
DROP TABLE `cloud_conflicts`;--> statement-breakpoint
DROP TABLE `cloud_pending_publication`;--> statement-breakpoint
DROP TABLE `cloud_shadow_reaper`;--> statement-breakpoint
DROP TABLE `cloud_tombstones`;--> statement-breakpoint
DROP TABLE `profile_pristine_marker`;--> statement-breakpoint
ALTER TABLE `cloud_vault` DROP COLUMN `restore_conflict_ids_json`;--> statement-breakpoint
ALTER TABLE `cloud_vault` DROP COLUMN `conflicts_imported_at`;--> statement-breakpoint
ALTER TABLE `custom_prompts` DROP COLUMN `conflict_origin_id`;--> statement-breakpoint
ALTER TABLE `entries` DROP COLUMN `conflict_origin_id`;--> statement-breakpoint
ALTER TABLE `tags` DROP COLUMN `conflict_origin_id`;