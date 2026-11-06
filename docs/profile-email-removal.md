# Profile email removal (issue #111)

Tackbok no longer stores a profile email. Settings version 2 removes the old key,
including for users upgrading from version 0. SQLite migration 0005 clears existing
values. The nullable `user_profile.email` column remains for database compatibility;
profile writes and cloud snapshot restores always leave it null. Cloud snapshot
profiles contain only the display name, photo asset ID, and update timestamp, so
no cloud schema change is needed. The connected Google account email remains in
SecureStore for the account label and is removed on disconnect.

Tackbok ZIP backups remain at version 1: email is no longer exported, and old
importers tolerate its absence (`email ?? null`). Current imports accept existing
version 1 backups and Gratitude archives containing email but ignore that value.
Existing backup files are not rewritten or deleted.

## Store-console follow-up

These changes require access to the store consoles and are not performed by the
repository change:

- Review each localized store listing and remove claims that Tackbok collects a
  profile email. Keep accurate information about the connected Google account.
- In Google Play Console, review the Data safety declaration. Remove “Screen
  content” if no current collection or sharing qualifies for that data type.
  Journal content remains local or goes to the user's own Google Drive; removing
  a profile email alone does not determine the classification. Check the current
  analytics events and enabled SDK behavior against Google's definitions before
  submitting the form.
- Save the updated disclosures and review them together with this app change
  before releasing it. No build, OTA update, or store submission is included here.
