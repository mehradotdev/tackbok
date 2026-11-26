import { useCallback, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';
import { appIconChangeClosesApp, useAppIconStore } from '~/lib/appIcon';
import { useAppLockStore } from '~/lib/appLock';
import { useTranslation } from '~/lib/i18n';
import {
  festivePromptFor,
  festiveSwitchFrom,
  type FestivePrompt as Prompt,
} from '~/lib/seasonal/festivePrompt';
import { flushSettings, useSettingsStore } from '~/lib/settings';
import { useSplashActive } from '~/lib/splash';
import { AppIconTile } from '~/screens/settings/AppIconPickerSheet';
import { homeTipsShowing } from './HomeCoachMarks';
import { Text } from '~/components/ui/text';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';

/** Lets the screen transition and any post-save achievement settle first. */
const SETTLE_MS = 800;
/** Android pauses JS timers in the background; a check that fires this late is
 *  running as the app reopens, which is not a moment to ask. */
const LATE_MS = SETTLE_MS + 2000;

type Shown = Exclude<Prompt, { kind: 'forget' }>;

/** True while something else owns the screen or the user is not on Home yet. */
function somethingElseFirst() {
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

/**
 * The once-per-season "Feeling festive?" suggestion, and from 2 Jan the offer to
 * switch back for people who took it. Never on opening the app and never while
 * writing: it is considered only when Home comes back into focus (after an
 * entry, or settings), and only when nothing else is on screen.
 */
export function FestivePrompt() {
  const router = useRouter();
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<Shown | null>(null);
  // Home's first focus is the app opening; later ones are returns from elsewhere.
  const returned = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!returned.current) {
        return () => {
          returned.current = true;
        };
      }
      let cancelled = false;
      const focusedAt = Date.now();
      const timer = setTimeout(async () => {
        // The OS owns the icon; read it before comparing or remembering it.
        await useAppIconStore.getState().refresh();
        if (cancelled || Date.now() - focusedAt > LATE_MS || somethingElseFirst()) return;
        const settings = useSettingsStore.getState();
        const now = new Date();
        const look = {
          festiveTouchesEnabled: settings.festiveTouchesEnabled,
          festivePromptSeason: settings.festivePromptSeason,
          festiveSwitch: settings.festiveSwitch,
          theme: settings.theme,
          icon: useAppIconStore.getState().current,
        };
        let next = festivePromptFor(now, look);
        if (next?.kind === 'forget') {
          settings.setFestiveSwitch(null);
          // This season's suggestion may be due instead.
          next = festivePromptFor(now, { ...look, festiveSwitch: null });
        }
        if (!next || next.kind === 'forget') return;
        // Counted as shown straight away, so closing the app doesn't bring it back.
        if (next.kind === 'suggest') settings.setFestivePromptSeason(next.season);
        setPrompt(next);
      }, SETTLE_MS);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        // Something opened over Home (a reminder tap): don't leave the dialog on top.
        setPrompt(null);
      };
    }, []),
  );

  const takeALook = () => {
    if (prompt?.kind !== 'suggest') return;
    const settings = useSettingsStore.getState();
    settings.setFestiveSwitch(
      festiveSwitchFrom(new Date(), prompt, {
        theme: settings.theme,
        icon: useAppIconStore.getState().current,
      }),
    );
    setPrompt(null);
    router.push('/appearance');
  };

  const switchBack = async () => {
    if (prompt?.kind !== 'switchBack') return;
    const { theme, icon } = prompt;
    setPrompt(null);
    const settings = useSettingsStore.getState();
    settings.setFestiveSwitch(null);
    if (theme) settings.setTheme(theme);
    if (icon) {
      // Android closes the app to change the icon: save the theme first.
      await flushSettings();
      await useAppIconStore.getState().setIcon(icon);
    }
  };

  /** "Not now", or "Keep it", which forgets the remembered look. */
  const decline = () => {
    if (prompt?.kind === 'switchBack') useSettingsStore.getState().setFestiveSwitch(null);
    setPrompt(null);
  };

  const suggest = prompt?.kind === 'suggest';
  const tile = suggest ? prompt.suggestion.icon : prompt?.icon;
  const closesApp =
    prompt?.kind === 'switchBack' && prompt.icon && appIconChangeClosesApp;

  return (
    <AlertDialog
      open={prompt !== null}
      // The buttons close the dialog before their own handlers run, and a tap
      // outside or Back just closes it: an unanswered switch-back comes back on
      // the next return to Home.
      onOpenChange={(open) => {
        if (!open) setPrompt(null);
      }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {tile ? (
            <View
              className="items-center pb-2"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <AppIconTile name={tile} size={72} />
            </View>
          ) : null}
          <AlertDialogTitle>
            {suggest ? t('festive.promptTitle') : t('festive.switchBackTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {suggest ? t('festive.promptMessage') : t('festive.switchBackMessage')}
            {closesApp ? `\n\n${t('appearance.changeAppIconMessage')}` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Labels can wrap at large text sizes; see backupHistory for the classes. */}
          <AlertDialogCancel className="h-auto min-h-10 py-1.5" onPress={decline}>
            <Text className="min-h-0 shrink py-0 text-center">
              {suggest ? t('festive.notNow') : t('festive.keepIt')}
            </Text>
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-auto min-h-10 border-[length:var(--theme-border-width)] py-1.5"
            onPress={suggest ? takeALook : () => void switchBack()}>
            <Text className="min-h-0 shrink border-0 py-0 text-center">
              {suggest ? t('festive.takeALook') : t('festive.switchBack')}
            </Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
