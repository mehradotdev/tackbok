import { useEffect, useState } from 'react';
import { runNormalizedModelBackfill } from '~/lib/cloudSync/storage/backfill';
import { useSettingsStore } from './store';

/** Restore the SQLite profile before mounting screens that read its cache. */
export function useProfileBootstrap(databaseReady: boolean, settingsReady: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!databaseReady || !settingsReady) return;
    let cancelled = false;
    const settings = useSettingsStore.getState();
    // Profiles leave persisted settings after migration. The completed backfill
    // path still reloads their cache; the sync runtime skips that path when ready.
    void runNormalizedModelBackfill({
      profileName: settings.profileName,
      profileEmail: settings.profileEmail,
      profileImageUri: settings.profileImageUri,
    })
      .catch(() => console.warn('Profile initialization failed'))
      .finally(() => {
        // Preserve the nonfatal backfill policy; sync can retry migration errors.
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [databaseReady, settingsReady]);
  return ready;
}
