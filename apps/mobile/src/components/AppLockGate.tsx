import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, View } from 'react-native';
import { AppStatusBar } from '~/components/AppStatusBar';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { attemptUnlock, canUseDeviceAuth, useAppLockStore } from '~/lib/appLock';
import { normalizeAppLockDelay } from '~/lib/appLockSession';
import {
  appLockSession,
  refreshExternalAuthentication,
  useExternalAuthentication,
} from '~/lib/externalAuthentication';
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
 * - backgrounding re-locks after the chosen grace period; `inactive` blips (app switcher peek,
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
  const externalAuthenticationActive = useExternalAuthentication((s) => s.active);
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

  // Re-checks enrollment on every attempt: if the user removed all device
  // auth (passcode off kills biometrics too) after enabling the lock,
  // there is nothing left to authenticate against — clear the lock and
  // turn the setting off instead of trapping them on the lock screen.
  const tryUnlock = useCallback(async () => {
    if (useExternalAuthentication.getState().active) return;
    if (await canUseDeviceAuth()) {
      await attemptUnlock({
        promptMessage: t('security.unlockTackbok'),
        cancelLabel: t('common.cancel'),
      });
    } else {
      useSettingsStore.getState().setBiometricUnlockEnabled(false);
      useAppLockStore.getState().unlock();
    }
  }, [t]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setAppStateStatus(next);
      const settings = useSettingsStore.getState();
      if (!useAppLockStore.getState().isAuthenticating) {
        const shouldLock = appLockSession.transition(
          next,
          normalizeAppLockDelay(settings.appLockDelaySeconds),
        );
        if (settings.biometricUnlockEnabled && shouldLock) {
          autoPromptedRef.current = false;
          useAppLockStore.getState().lock();
        }
      }
      refreshExternalAuthentication();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (locked && active && !externalAuthenticationActive && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      void tryUnlock();
    }
  }, [locked, active, externalAuthenticationActive, tryUnlock]);

  return (
    <>
      {everUnlocked ? children : null}
      <AppLockScreen
        visible={enabled && (locked || !active)}
        nativeModal={!externalAuthenticationActive}
        showUnlockButton={locked && !externalAuthenticationActive}
        onUnlockPress={() => void tryUnlock()}
      />
    </>
  );
}

interface AppLockScreenProps {
  visible: boolean;
  nativeModal: boolean;
  /** False while the cover is only acting as a privacy screen (not locked). */
  showUnlockButton: boolean;
  onUnlockPress: () => void;
}

function AppLockScreen({
  visible,
  nativeModal,
  showUnlockButton,
  onUnlockPress,
}: AppLockScreenProps) {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const themeConfig = getThemeConfig(theme);
  const [foregroundColor] = useCSSVariable(['--color-foreground']);

  const content = (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-primary"
      edges={['top', 'left', 'right', 'bottom']}>
      <AppStatusBar style={themeConfig.variant === 'dark' ? 'light' : 'dark'} />
      <View className="flex-1 items-center justify-center gap-10">
        <TackbokLogo size={LOCK_LOGO_SIZE} color={foregroundColor as string} />
        {showUnlockButton ? (
          <Button variant="primary" size="lg" onPress={onUnlockPress}>
            <Text>{t('security.unlock')}</Text>
          </Button>
        ) : null}
      </View>
    </SafeAreaView>
  );
  // Never present a competing native modal over the Google chooser/browser.
  // The in-app cover still hides journal content in the task switcher.
  if (!nativeModal) {
    return visible ? (
      <View className="absolute inset-0 z-50" accessibilityViewIsModal>
        {content}
      </View>
    ) : null;
  }
  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {}}>
      {content}
    </Modal>
  );
}
