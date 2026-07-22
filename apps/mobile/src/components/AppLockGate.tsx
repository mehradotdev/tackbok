import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { attemptUnlock, useAppLockStore, type AuthPrompt } from '~/lib/appLock';
import { getThemeConfig } from '~/lib/theme/themes';
import { TackbokLogo } from '~/components/TackbokLogo';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

/** Square logo — matches `AppLoadingScreen` for a seamless splash → lock handoff. */
const LOCK_LOGO_SIZE = 108;

/**
 * Root gate for the app lock. When `biometricUnlockEnabled` is on:
 * - cold start renders the opaque lock screen instead of app content (no
 *   flash of journal entries) and auto-triggers the OS auth prompt;
 * - real backgrounding re-locks; brief `inactive` blips (app switcher peek,
 *   permission dialogs, the auth sheet itself) do not;
 * - while the app is not `active` the same opaque screen doubles as a
 *   task-switcher privacy cover.
 *
 * The cover is a native `Modal` so it also hides any native modals
 * (image viewer, pickers) that would otherwise sit above a plain overlay.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.biometricUnlockEnabled);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const [appStateStatus, setAppStateStatus] = useState(AppState.currentState);

  // Pre-init `null` counts as locked so content never paints first.
  const locked = enabled && (isLocked ?? true);
  const active = appStateStatus === 'active';

  // Once unlocked, keep the app mounted across later locks so navigation and
  // screen state survive; the opaque modal does the hiding from then on.
  const [everUnlocked, setEverUnlocked] = useState(!locked);
  if (!locked && !everUnlocked) {
    setEverUnlocked(true);
  }

  // One automatic OS prompt per lock cycle; after a cancel the user retries
  // via the button. Prevents a cancel → foreground → prompt → cancel loop.
  const autoPromptedRef = useRef(false);

  const unlockPrompt = (): AuthPrompt => ({
    promptMessage: t('Unlock Tackbok'),
    cancelLabel: t('Cancel'),
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setAppStateStatus(next);
      if (
        next === 'background' &&
        useSettingsStore.getState().biometricUnlockEnabled &&
        !useAppLockStore.getState().isAuthenticating
      ) {
        autoPromptedRef.current = false;
        useAppLockStore.getState().lock();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (locked && active && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      void attemptUnlock({
        promptMessage: t('Unlock Tackbok'),
        cancelLabel: t('Cancel'),
      });
    }
  }, [locked, active, t]);

  return (
    <>
      {everUnlocked ? children : null}
      <AppLockScreen
        visible={enabled && (locked || !active)}
        showUnlockButton={locked}
        onUnlockPress={() => void attemptUnlock(unlockPrompt())}
      />
    </>
  );
}

interface AppLockScreenProps {
  visible: boolean;
  /** False while the cover is only acting as a privacy screen (not locked). */
  showUnlockButton: boolean;
  onUnlockPress: () => void;
}

function AppLockScreen({ visible, showUnlockButton, onUnlockPress }: AppLockScreenProps) {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const themeConfig = getThemeConfig(theme);
  const [foregroundColor] = useCSSVariable(['--color-foreground']);

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {}}>
      <SafeAreaView
        className="flex-1 bg-background dark:bg-primary"
        edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={themeConfig.variant === 'dark' ? 'light' : 'dark'} />
        <View className="flex-1 items-center justify-center gap-10">
          <TackbokLogo size={LOCK_LOGO_SIZE} color={foregroundColor as string} />
          {showUnlockButton ? (
            <Button variant="primary" size="lg" onPress={onUnlockPress}>
              <Text>{t('Unlock')}</Text>
            </Button>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
