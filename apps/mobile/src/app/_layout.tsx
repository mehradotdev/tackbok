import '../global.css';

import { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { Uniwind, useCSSVariable, useUniwind } from 'uniwind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '~/db';
import migrations from '~/drizzle/migrations';
import { PortalHost } from '~/components/primitives/portal';
import { Toaster } from '~/components/ui/toast';

// Keep the splash screen visible while we run DB migrations
SplashScreen.preventAutoHideAsync();

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

export default function Layout() {
  const { success, error } = useMigrations(db, migrations);
  const { theme } = useUniwind();
  const [primaryColor, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
  ]);

  // Sync the native root view background color with the active theme
  // so that overscroll / bounce areas match the app's background.
  // TODO: hardcoded colors should reference theme variables
  useEffect(() => {
    const bg = theme === 'dark' ? '#6A755A' : '#E4D7B0';
    SystemUI.setBackgroundColorAsync(bg);
  }, [theme]);

  // Hide the splash screen once the DB migration is complete (or errors out).
  useEffect(() => {
    if (success || error) {
      SplashScreen.hide();
    }
  }, [success, error]);

  // Show migration error
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-destructive text-center">
          Database migration error: {error.message}
        </Text>
      </View>
    );
  }

  // Keep the splash screen visible while migrating
  if (!success) {
    return null;
    // return (
    //   <View className="flex-1 items-center justify-center bg-background">
    //     <Text className="text-muted-foreground">Loading...</Text>
    //   </View>
    // );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaListener
          onChange={({ insets }) => {
            Uniwind.updateInsets(insets);
          }}>
          <KeyboardProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                headerTitleAlign: 'center',
                headerTintColor: primaryForeground as string,
                headerStyle: { backgroundColor: primaryColor as string },
                headerTitleStyle: { fontWeight: 'bold' },
              }}>
              <Stack.Screen name="index" />
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
                name="settings"
                options={{
                  title: 'Settings',
                  headerShown: false,
                  presentation: 'formSheet',
                  sheetAllowedDetents:
                    Platform.OS === 'android' ? [0.7, 0.95] : [0.75, 1],
                  sheetInitialDetentIndex: 0,
                  sheetCornerRadius: 24,
                  sheetGrabberVisible: true,
                }}
              />
            </Stack>
            <StatusBar style="auto" />
            <Toaster />
            <PortalHost />
          </KeyboardProvider>
        </SafeAreaListener>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
