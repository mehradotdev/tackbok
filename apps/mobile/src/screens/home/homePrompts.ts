import { AppState } from 'react-native';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';
import { useAppLockStore } from '~/lib/appLock';
import { useSettingsStore } from '~/lib/settings';
import { useSplashActive } from '~/lib/splash';
import { currentAppVersion, shouldShowWhatsNew } from '~/lib/whatsNew';
import { homeTipsShowing } from './HomeCoachMarks';

/**
 * True while something else owns the screen or the user is not on Home yet:
 * the launch animation, the app lock, onboarding or its Home tips, or an
 * achievement. Home's one-off sheets wait for all of these.
 */
export function somethingElseOnHome(): boolean {
  const settings = useSettingsStore.getState();
  return (
    AppState.currentState !== 'active' ||
    useSplashActive.getState().active ||
    (settings.biometricUnlockEnabled && useAppLockStore.getState().isLocked !== false) ||
    !settings.hasCompletedOnboarding ||
    !settings.hasSeenHomeCoachMarks ||
    // Marked seen as soon as the tips start, so also check they're gone.
    homeTipsShowing() ||
    settings.pendingAchievement !== null ||
    useAchievementDialogStore.getState().manualAchievement !== null
  );
}

let whatsNewShowing = false;
export const setWhatsNewShowing = (showing: boolean) => {
  whatsNewShowing = showing;
};

/** Whether "What's new" is on screen or still due; other Home sheets wait for it. */
export function whatsNewFirst(): boolean {
  if (whatsNewShowing) return true;
  const settings = useSettingsStore.getState();
  return shouldShowWhatsNew({
    hasCompletedOnboarding: settings.hasCompletedOnboarding,
    lastSeenAppVersion: settings.lastSeenAppVersion,
    appVersion: currentAppVersion(),
  });
}
