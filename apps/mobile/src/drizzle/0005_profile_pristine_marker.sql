CREATE TABLE `profile_pristine_marker` (
	`profile_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
-- Only a provably fresh database starts pristine: nothing has ever written a
-- profile row and no cloud vault exists. Existing installs start touched.
INSERT INTO `profile_pristine_marker` (`profile_id`)
SELECT 'self'
WHERE NOT EXISTS (SELECT 1 FROM `user_profile`)
  AND NOT EXISTS (SELECT 1 FROM `cloud_vault`);
