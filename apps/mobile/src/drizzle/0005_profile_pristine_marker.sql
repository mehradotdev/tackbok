CREATE TABLE `profile_pristine_marker` (
	`profile_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
-- Only a provably fresh database starts pristine: nothing has ever written a
-- profile row, no cloud vault exists and there is no journal data. Existing
-- installs start touched; the profile backfill also checks legacy settings.
INSERT INTO `profile_pristine_marker` (`profile_id`)
SELECT 'self'
WHERE NOT EXISTS (SELECT 1 FROM `user_profile`)
  AND NOT EXISTS (SELECT 1 FROM `cloud_vault`)
  AND NOT EXISTS (SELECT 1 FROM `entries`)
  AND NOT EXISTS (SELECT 1 FROM `tags`)
  AND NOT EXISTS (SELECT 1 FROM `custom_prompts`)
  AND NOT EXISTS (SELECT 1 FROM `media_assets`);
