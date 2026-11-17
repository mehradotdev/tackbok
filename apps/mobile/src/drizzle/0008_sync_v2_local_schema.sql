CREATE TABLE `sync_deleted_records` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`record_json` text NOT NULL,
	`deleted_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_device` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`ctx_json` text DEFAULT '{}' NOT NULL,
	`roster_json` text DEFAULT '{}' NOT NULL,
	`acks_json` text DEFAULT '{}' NOT NULL,
	`floor_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_field_values` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field` text NOT NULL,
	`stamp_hlc` integer NOT NULL,
	`stamp_device` text NOT NULL,
	`value_json` text NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`, `field`, `stamp_hlc`, `stamp_device`)
);
--> statement-breakpoint
CREATE TABLE `sync_records` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`vv_json` text NOT NULL,
	`known_json` text,
	`stamps_json` text DEFAULT '{}' NOT NULL,
	`del_json` text,
	`ext_json` text DEFAULT '{}' NOT NULL,
	`split_json` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
--> statement-breakpoint
ALTER TABLE `entry_tags` ADD `stamp_hlc` integer;--> statement-breakpoint
ALTER TABLE `entry_tags` ADD `stamp_device` text;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `stamp_hlc` integer;--> statement-breakpoint
ALTER TABLE `media_assets` ADD `stamp_device` text;--> statement-breakpoint
-- Sync v2 (#185). This install's sync identity: a random device ID (UUID v4
-- form), made once, here, at the first launch of this version. The time is
-- the HLC of every initial stamp below.
INSERT INTO `sync_device` (`id`, `device_id`, `created_at`, `updated_at`)
SELECT 'self',
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000;
--> statement-breakpoint
-- Existing rows get an initial stamp from this device: one write that set
-- every field. Nothing reads these until the v2 engine ships.
INSERT INTO `sync_records` (`entity_type`, `entity_id`, `vv_json`, `stamps_json`, `updated_at`)
SELECT 'entry', e.`note_id`,
  json_object(d.`device_id`, d.`created_at`),
  json_object(
    'title', json_array(d.`created_at`, d.`device_id`),
    'text', json_array(d.`created_at`, d.`device_id`),
    'mood', json_array(d.`created_at`, d.`device_id`),
    'date', json_array(d.`created_at`, d.`device_id`)
  ),
  d.`created_at`
FROM `entries` e, `sync_device` d WHERE d.`id` = 'self';
--> statement-breakpoint
INSERT INTO `sync_records` (`entity_type`, `entity_id`, `vv_json`, `stamps_json`, `updated_at`)
SELECT 'tag', t.`tag_id`,
  json_object(d.`device_id`, d.`created_at`),
  json_object('title', json_array(d.`created_at`, d.`device_id`)),
  d.`created_at`
FROM `tags` t, `sync_device` d WHERE d.`id` = 'self';
--> statement-breakpoint
INSERT INTO `sync_records` (`entity_type`, `entity_id`, `vv_json`, `stamps_json`, `updated_at`)
SELECT 'prompt', p.`prompt_id`,
  json_object(d.`device_id`, d.`created_at`),
  json_object('title', json_array(d.`created_at`, d.`device_id`)),
  d.`created_at`
FROM `custom_prompts` p, `sync_device` d WHERE d.`id` = 'self';
--> statement-breakpoint
INSERT INTO `sync_records` (`entity_type`, `entity_id`, `vv_json`, `stamps_json`, `updated_at`)
SELECT 'profile', 'profile',
  json_object(d.`device_id`, d.`created_at`),
  json_object(
    'name', json_array(d.`created_at`, d.`device_id`),
    'photo', json_array(d.`created_at`, d.`device_id`)
  ),
  d.`created_at`
FROM `sync_device` d
WHERE d.`id` = 'self' AND EXISTS (SELECT 1 FROM `user_profile`);
--> statement-breakpoint
UPDATE `entry_tags` SET
  `stamp_hlc` = (SELECT `created_at` FROM `sync_device` WHERE `id` = 'self'),
  `stamp_device` = (SELECT `device_id` FROM `sync_device` WHERE `id` = 'self');
--> statement-breakpoint
-- The context and roster name this device once it has written anything.
UPDATE `sync_device` SET
  `ctx_json` = json_object(`device_id`, `created_at`),
  `roster_json` = json_object(`device_id`, `created_at`)
WHERE `id` = 'self' AND EXISTS (SELECT 1 FROM `sync_records`);
