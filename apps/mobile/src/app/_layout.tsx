import '../global.css';

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { Uniwind, useCSSVariable } from 'uniwind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '~/db';
import migrations from '~/drizzle/migrations';
import { useSettingsStore } from '~/lib/settings';
import { useLocaleStore } from '~/lib/i18n';
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
import { runNormalizedModelBackfill } from '~/lib/cloudSync/storage/backfill';

SplashScreen.preventAutoHideAsync();

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

// Rendered inside the navigator so reminder-tap navigation happens against a
// mounted router (covers both cold-start and warm notification taps).
function ReminderNavigationObserver() {
  useReminderTapObserver();
  return null;
}

// Maps route changes to screen_viewed events (logical screen names only —
// no raw paths/params). No-ops entirely while analytics is disabled.
function ScreenViewObserver() {
  const pathname = usePathname();
  useEffect(() => {
    trackScreenView(pathname);
  }, [pathname]);
  return null;
}

export default function Layout() {
  const { success, error } = useMigrations(db, migrations);
  const theme = useSettingsStore((s) => s.theme);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);
  const localeHasHydrated = useLocaleStore((s) => s._hasHydrated);
  const themeConfig = getThemeConfig(theme);
  const [normalizedModelReady, setNormalizedModelReady] = useState(false);
  const [backfillError, setBackfillError] = useState<Error | null>(null);

  const [fontsLoaded, fontsError] = useFonts(APP_FONT_ASSETS);

  const [primaryColor, primaryForeground, backgroundColor] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
    '--color-background',
  ]);

  const isBootstrapLoading =
    !error &&
    !backfillError &&
    (!success || !normalizedModelReady || (!fontsLoaded && !fontsError));

  useEffect(() => {
    if (!success || !hasHydrated || normalizedModelReady || backfillError) return;
    const settings = useSettingsStore.getState();
    void runNormalizedModelBackfill({
      profileName: settings.profileName,
      profileEmail: settings.profileEmail,
      profileImageUri: settings.profileImageUri,
    })
      .then(() => setNormalizedModelReady(true))
      .catch((cause: unknown) => {
        setBackfillError(
          cause instanceof Error ? cause : new Error('Cloud-sync backfill failed'),
        );
      });
  }, [backfillError, hasHydrated, normalizedModelReady, success]);

  // Keep native splash until persisted settings (and Uniwind theme) are ready
  useEffect(() => {
    if (hasHydrated || error) {
      SplashScreen.hideAsync();
    }
  }, [hasHydrated, error]);

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
  // (notification text is baked at schedule time) before it can run.
  useEffect(() => {
    if (hasHydrated && localeHasHydrated) {
      initReminders();
    }
  }, [hasHydrated, localeHasHydrated]);

  // Analytics starts only after hydration so the persisted consent flag
  // (analyticsEnabled) is trustworthy; it stays fully inert when disabled.
  useEffect(() => {
    if (hasHydrated) {
      initAnalytics();
    }
  }, [hasHydrated]);

  // Show migration error
  if (error || backfillError) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-destructive text-center">
          Database migration error: {(error ?? backfillError)?.message}
        </Text>
      </View>
    );
  }

  // Keep the splash screen visible while loading
  if (!hasHydrated) {
    return null;
  }

  if (isBootstrapLoading) {
    return <AppLoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                  headerTintColor: primaryForeground as string,
                  headerStyle: { backgroundColor: primaryColor as string },
                  headerTitleStyle: { fontWeight: 'bold' },
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
                  name="dev-diagnostics"
                  options={{
                    title: 'Phase-0 Diagnostics',
                    headerShown: false,
                  }}
                />
              </Stack>
              <ReminderNavigationObserver />
              <ScreenViewObserver />
              <AchievementDialogHost />
            </AppLockGate>
            <StatusBar style={themeConfig.variant === 'dark' ? 'light' : 'dark'} />
            <Toaster />
            <PortalHost />
          </KeyboardProvider>
        </SafeAreaListener>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
