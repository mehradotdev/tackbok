import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import HomeScreen from '~/screens/home';
import { useSettingsStore } from '~/lib/settings';
import { hasAnyEntries } from '~/db/queries';

export default function Home() {
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);
  // Existing installs predate the onboarding flag: a non-empty journal means this
  // isn't a fresh install, so silently mark onboarding done instead of showing it.
  const [bootstrapChecked, setBootstrapChecked] = useState(hasCompletedOnboarding);
  // If the entries check itself fails we can't tell a fresh install from an
  // existing one — fail open to Home for this launch (nothing is persisted, so
  // the next launch retries) rather than sending a long-time user to onboarding.
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    if (bootstrapChecked) return;
    let cancelled = false;
    hasAnyEntries()
      .then((hasEntries) => {
        if (hasEntries) {
          // Existing pre-onboarding install: skip the flow AND the coach marks —
          // long-time users shouldn't get first-run tooltips after an update.
          const settings = useSettingsStore.getState();
          settings.setHasCompletedOnboarding(true);
          settings.setHasSeenHomeCoachMarks(true);
        }
      })
      .catch((error) => {
        console.warn('Onboarding bootstrap check failed', error);
        if (!cancelled) setCheckFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBootstrapChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapChecked]);

  if (!bootstrapChecked) return null;
  if (!hasCompletedOnboarding && !checkFailed) {
    return <Redirect href="/onboarding/welcome" />;
  }
  return <HomeScreen />;
}
