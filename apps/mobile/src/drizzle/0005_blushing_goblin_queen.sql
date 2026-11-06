ALTER TABLE `cloud_conflicts` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `cloud_vault` ADD `restore_conflict_ids_json` text;--> statement-breakpoint
ALTER TABLE `cloud_vault` ADD `conflicts_imported_at` integer;--> statement-breakpoint
-- One-time archive of name conflicts that have no common base and existed
-- before this version. Most are first-join artifacts, but a real one cannot be
-- told apart, so they are kept and listed under "older name versions" instead
-- of on the conflicts card. Runs once, in the migration transaction.
UPDATE `cloud_conflicts` SET `archived_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE `acknowledged_at` IS NULL
  AND json_extract(`conflict_json`, '$.entityType') = 'profile'
  AND json_extract(`conflict_json`, '$.field') = 'displayName'
  AND json_extract(`conflict_json`, '$.baseValueHash') IS NULL;
