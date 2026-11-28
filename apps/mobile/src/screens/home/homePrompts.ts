import { AppState } from 'react-native';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';
import { useAppLockStore } from '~/lib/appLock';
import { useSettingsStore } from '~/lib/settings';
import { useSplashActive } from '~/lib/splash';
import { settingsSheetShowing } from '~/components/SettingsBottomSheet';
import { homeTipsShowing } from './HomeCoachMarks';

/**
 * True while something else owns the screen or the user is not on Home yet:
 * the launch animation, the app lock, onboarding or its Home tips, an
 * achievement, or the profile sheet (it has a name field). Home's one-off sheets wait for all of these.
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
    settingsSheetShowing() ||
    settings.pendingAchievement !== null ||
    useAchievementDialogStore.getState().manualAchievement !== null
  );
}
