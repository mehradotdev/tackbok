import '../global.css';

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useReducedMotion } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Stack, usePathname } from 'expo-router';
import { AppStatusBar } from '~/components/AppStatusBar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { Uniwind, useCSSVariable } from 'uniwind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '~/db';
import migrations from '~/drizzle/migrations';
import { useSettingsStore } from '~/lib/settings';
import { useAppIconStore } from '~/lib/appIcon';
import { useProfileBootstrap } from '~/lib/settings/useProfileBootstrap';
import { useTranslation, useLocaleStore } from '~/lib/i18n';
import { initReminders, useReminderTapObserver } from '~/lib/reminders';
import { initAnalytics, trackScreenView } from '~/lib/analytics';
import { cleanupDeferredBackupZipFiles } from '~/lib/backupExport';
import { getThemeConfig, DEFAULT_THEME_ID } from '~/lib/theme/themes';
import { AppLoadingScreen } from '~/components/AppLoadingScreen';
import { AppLockGate } from '~/components/AppLockGate';
import { PortalHost } from '~/components/primitives/portal';
import { Text } from '~/components/ui/text';
import { Toaster } from '~/components/ui/toast';
import { APP_FONT_ASSETS } from '~/lib/theme/fonts';
import { AchievementDialogHost } from '~/components/achievement-dialog-host';
import { SplashAnimation } from '~/components/SplashAnimation';
import {
  endSplash,
  getSplashMode,
  isLaunchFromLink,
  useSplashActive,
  useSplashIsDark,
  type SplashMode,
} from '~/lib/splash';
// A no-op module outside beta bundles; see metro.config.js.
import { DevSetupNavigation, useDevSetup } from '~/lib/devSetup';
import {
  getProductionSyncRuntime,
  isProductionCloudSyncConfigured,
  setCloudSyncBackgroundTaskEnabled,
} from '~/lib/cloudSync/runtime';
SplashScreen.preventAutoHideAsync();

// Hide the native splash once the first JS screen (or the launch animation,
// which starts on the same frame) has laid out, so the hand-off never shows a
// bare window background.
let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  void SplashScreen.hideAsync();
}

// A launch from a deep link or a reminder tap goes straight to its screen.
// Started at bundle load so the answer is usually ready by hydration. If it is
// slow, the animation starts anyway and stops as soon as a link turns up.
const LAUNCH_CHECK_TIMEOUT_MS = 300;
const openedFromLinkPromise: Promise<boolean> = Promise.all([
  Linking.getInitialURL().catch(() => null),
  Notifications.getLastNotificationResponseAsync().catch(() => null),
]).then(([url, response]) =>
  isLaunchFromLink(url, response?.notification.request.content.data),
);
const quickLaunchCheck: Promise<boolean> = Promise.race([
  openedFromLinkPromise,
  new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), LAUNCH_CHECK_TIMEOUT_MS),
  ),
]);

// Prime Uniwind before React mounts to limit flash. At module load,
// `useSettingsStore.getState().theme` is still the persist default (`DEFAULT_THEME_ID`)
// because Zustand rehydrates async from storage. After hydration,
// `onRehydrateStorage` calls `setTheme(safeThemeId)`, which updates the store and
// `Uniwind.setTheme` with the real persisted theme (and maps invalid ids).
const rawSavedTheme = useSettingsStore.getState().theme || DEFAULT_THEME_ID;
const activeThemeId = getThemeConfig(rawSavedTheme).id;

Uniwind.setTheme(activeThemeId);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data indefinitely — all mutations and direct DB operations
      // (import, delete-all) explicitly call invalidateQueries(), so the
      // cache stays correct without time-based expiry.  This avoids
      // redundant SQLite reads on every mount/focus and gives instant
      // results for previously-fetched queries (search, timeline, etc.).
      staleTime: Infinity,
    },
  },
});

const cloudSyncRuntime = getProductionSyncRuntime({
  onRemoteApplied: () => queryClient.invalidateQueries(),
});

// Rendered inside the navigator so reminder-tap navigation happens against a
// mounted router (covers both cold-start and warm notification taps).
function ReminderNavigationObserver() {
  useReminderTapObserver();
  return null;
}

// Android: an icon picked during onboarding switches only after onboarding,
// once the user next leaves the app, so onboarding never closes it.
function PendingAppIconObserver() {
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);
  const pending = useAppIconStore((s) => s.pending);
  useEffect(() => {
    if (hasCompletedOnboarding && pending) {
      void useAppIconStore.getState().applyPendingOnLeave();
    }
  }, [hasCompletedOnboarding, pending]);
  return null;
}

// Maps route changes to standard $screen events (logical screen names only —
// no raw paths/params). No-ops entirely while analytics is disabled.
function ScreenViewObserver() {
  const pathname = usePathname();
  useEffect(() => {
    trackScreenView(pathname);
  }, [pathname]);
  return null;
}

export default function Layout() {
  const { t } = useTranslation();
  const { success, error } = useMigrations(db, migrations);
  const theme = useSettingsStore((s) => s.theme);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);
  const localeHasHydrated = useLocaleStore((s) => s._hasHydrated);
  const profileReady = useProfileBootstrap(success, hasHydrated);
  const devSetupReady = useDevSetup(profileReady && localeHasHydrated);
  const themeConfig = getThemeConfig(theme);
  const statusBarStyle = themeConfig.variant === 'dark' ? 'light' : 'dark';

  const [fontsLoaded, fontsError] = useFonts(APP_FONT_ASSETS);
  const reduceMotion = useReducedMotion();
  // undefined: not decided yet; null: the launch animation is done or skipped.
  // A remount after it has finished (e.g. Fast Refresh) does not replay it.
  const [splashMode, setSplashMode] = useState<
    Exclude<SplashMode, 'none'> | null | undefined
  >(() => (useSplashActive.getState().active ? undefined : null));
  const appLockEnabled = useSettingsStore((s) => s.biometricUnlockEnabled);

  useEffect(() => {
    if (!hasHydrated || splashMode !== undefined) return;
    let cancelled = false;
    // With app lock on there is nothing to wait for: the lock skips the animation.
    const launchCheck = appLockEnabled ? Promise.resolve(false) : quickLaunchCheck;
    void launchCheck.then((openedFromLink) => {
      if (cancelled) return;
      const mode = getSplashMode({
        appLockEnabled,
        openedFromLink,
        reduceMotion,
      });
      setSplashMode(mode === 'none' ? null : mode);
    });
    return () => {
      cancelled = true;
    };
  }, [appLockEnabled, hasHydrated, reduceMotion, splashMode]);
  // A link that answers after the quick check still cuts the animation short.
  useEffect(() => {
    let mounted = true;
    void openedFromLinkPromise.then((openedFromLink) => {
      if (mounted && openedFromLink) setSplashMode(null);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const finishSplash = useCallback(() => setSplashMode(null), []);
  const splashActive = hasHydrated && splashMode !== null && !error;
  useEffect(() => {
    if (splashMode !== null && !error) return;
    endSplash();
    if (!hasHydrated) return;
    // The content may have laid out while the animation owned the hand-off, and
    // a later onLayout prop change fires no event; hide here so it never sticks.
    const frame = requestAnimationFrame(hideSplash);
    return () => cancelAnimationFrame(frame);
  }, [error, hasHydrated, splashMode]);
  // While the launch animation is on screen it decides when the native splash goes.
  const onContentLayout = splashActive ? undefined : hideSplash;
  // Light icons over the black splash, whatever the theme.
  const barStyle = useSplashIsDark() ? 'light' : statusBarStyle;
  // Screen readers stay on the overlay, not the app hidden under it.
  const contentA11y = splashActive ? HIDDEN_FROM_A11Y : undefined;

  const [primaryColor, primaryForeground, backgroundColor] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
    '--color-background',
  ]);

  const isBootstrapLoading =
    !error &&
    (!success ||
      !profileReady ||
      !localeHasHydrated ||
      !devSetupReady ||
      (!fontsLoaded && !fontsError));

  useEffect(() => {
    if (!success || !hasHydrated || !profileReady || !devSetupReady) return;
    let cancelled = false;
    void (async () => {
      try {
        await cloudSyncRuntime.start();
        if (cancelled) return;
        const configured = await isProductionCloudSyncConfigured();
        if (!cancelled) await setCloudSyncBackgroundTaskEnabled(configured);
      } catch {
        console.warn('Cloud sync runtime initialization failed');
      }
    })();
    return () => {
      cancelled = true;
      cloudSyncRuntime.stop();
    };
  }, [devSetupReady, hasHydrated, profileReady, success]);

  // Sync native root background once theme is trustworthy (hydrated), or on migration error
  useEffect(() => {
    if ((hasHydrated || error) && backgroundColor) {
      SystemUI.setBackgroundColorAsync(backgroundColor as string);
    }
  }, [hasHydrated, error, backgroundColor]);

  useEffect(() => {
    if (hasHydrated) {
      // On app launch we can safely clear deferred backup ZIPs that were kept to avoid the iOS share-sheet race.
      cleanupDeferredBackupZipFiles(0);
    }
  }, [hasHydrated]);

  // Reminder resync needs persisted settings (enabled/time) and the locale
  // (notification text is baked at schedule time) before it can run, and the
  // beta dev setup, which can change both.
  useEffect(() => {
    if (hasHydrated && localeHasHydrated && devSetupReady) {
      initReminders();
    }
  }, [devSetupReady, hasHydrated, localeHasHydrated]);

  // Analytics starts only after hydration so the persisted consent flag
  // (analyticsEnabled) is trustworthy; it stays fully inert when disabled.
  useEffect(() => {
    if (hasHydrated) {
      initAnalytics();
    }
  }, [hasHydrated]);

  // SQL schema migration errors are fatal; the resumable data backfill is not.
  if (error) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background p-4"
        onLayout={hideSplash}>
        <AppStatusBar style={statusBarStyle} />
        <Text className="text-destructive text-center">
          {t('common.databaseUpdateFailed', { message: error.message })}
        </Text>
      </View>
    );
  }

  // Keep the native splash visible until persisted settings (and Uniwind theme) are ready
  if (!hasHydrated) {
    return null;
  }

  // One stable parent, so the launch animation keeps running when bootstrap
  // finishes underneath it.
  return (
    <View className="flex-1">
      {isBootstrapLoading ? (
        <View className="flex-1" onLayout={onContentLayout} {...contentA11y}>
          <AppLoadingScreen />
        </View>
      ) : (
        <AppContent
          onLayout={onContentLayout}
          a11yProps={contentA11y}
          statusBarStyle={barStyle}
          primaryColor={primaryColor as string}
          primaryForeground={primaryForeground as string}
        />
      )}
      {/* Until the mode is decided the native splash itself holds the frame. */}
      {splashActive && splashMode ? (
        <SplashAnimation mode={splashMode} onReady={hideSplash} onFinish={finishSplash} />
      ) : null}
    </View>
  );
}

const HIDDEN_FROM_A11Y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

function AppContent({
  onLayout,
  a11yProps,
  statusBarStyle,
  primaryColor,
  primaryForeground,
}: {
  onLayout: (() => void) | undefined;
  a11yProps: typeof HIDDEN_FROM_A11Y | undefined;
  statusBarStyle: 'light' | 'dark';
  primaryColor: string;
  primaryForeground: string;
}) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout} {...a11yProps}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaListener
          onChange={({ insets }) => {
            Uniwind.updateInsets(insets);
          }}>
          <KeyboardProvider>
            <AppLockGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  headerTitleAlign: 'center',
                  headerTintColor: primaryForeground,
                  headerStyle: { backgroundColor: primaryColor },
                  headerTitleStyle: { fontWeight: 'bold' },
                  // iOS native-stack screens default to 'auto', which follows the system
                  // appearance and overrides <AppStatusBar>. Android keeps AppStatusBar as the
                  // only writer (see its native workaround).
                  statusBarStyle:
                    process.env.EXPO_OS === 'ios' ? statusBarStyle : undefined,
                }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen
                  name="gratitudeEntry/index"
                  options={{
                    title: 'Gratitude Entry',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="gratitudeEntry/[noteId]"
                  options={{
                    title: 'Gratitude Entry View',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="dateEntries/[dateMs]"
                  options={{
                    title: 'Date Entries',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="share-entry/[noteId]"
                  options={{ title: 'Share Entry', headerShown: false }}
                />
                <Stack.Screen
                  name="insights"
                  options={{
                    title: 'Insights',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="appearance"
                  options={{
                    title: 'Appearance',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="settings"
                  options={{
                    title: 'Settings',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="support"
                  options={{ title: 'Support Tackbok', headerShown: false }}
                />
                <Stack.Screen
                  name="cloud-backup"
                  options={{ title: 'Cloud Backup & Sync', headerShown: false }}
                />
                <Stack.Screen
                  name="other-versions"
                  options={{ title: 'Other Versions', headerShown: false }}
                />
                <Stack.Screen
                  name="backup-history"
                  options={{ title: 'Backup History', headerShown: false }}
                />
              </Stack>
              <ReminderNavigationObserver />
              <PendingAppIconObserver />
              <DevSetupNavigation />
              <ScreenViewObserver />
              <AchievementDialogHost />
            </AppLockGate>
            <AppStatusBar style={statusBarStyle} />
            <Toaster />
            <PortalHost />
          </KeyboardProvider>
        </SafeAreaListener>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
