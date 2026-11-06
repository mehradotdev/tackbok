-- Retain the nullable column for database compatibility, but erase unused profile emails.
UPDATE `user_profile` SET `email` = NULL WHERE `email` IS NOT NULL;
