-- Pause reasons only the v1 engine set (#185, P8). The v2 engine never sets
-- them and no screen explains them any more, so a device that stopped on one
-- syncs again: its next pass checks the backup from scratch.
UPDATE `cloud_sync_state`
SET `pause_reason` = NULL, `pause_context_json` = NULL, `last_error_class` = NULL
WHERE `pause_reason` IN ('frontier-too-wide', 'derived-id-collision', 'cleanup-inconsistent');
