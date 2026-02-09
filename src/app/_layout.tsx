import '../global.css';

import { Text, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Uniwind, useCSSVariable } from 'uniwind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '~/db';
import migrations from '~/drizzle/migrations';
import { PortalHost } from '~/components/primitives/portal';
import { SettingsDropdownMenu } from '~/components/SettingsDropdownMenu';
import { Toaster } from '~/components/ui/toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetch on mount if data is stale (includes after invalidation)
      refetchOnMount: true,
      // Refetch when app comes to foreground
      refetchOnWindowFocus: true,
      // Consider data stale after 0ms (always refetch if invalidated)
      staleTime: 0,
    },
  },
});

export default function Layout() {
  const { success, error } = useMigrations(db, migrations);
  const [primaryColor, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
  ]);

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

  // Show loading while migrating
  if (!success) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  return (
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
            <Stack.Screen
              name="index"
              options={{
                title: 'Tackbok',
                headerRight: () => <SettingsDropdownMenu />,
              }}
            />
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
              }}
            />
          </Stack>
          <StatusBar style="auto" />
          <Toaster />
          <PortalHost />
        </KeyboardProvider>
      </SafeAreaListener>
    </QueryClientProvider>
  );
}
