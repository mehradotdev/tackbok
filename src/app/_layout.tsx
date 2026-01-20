import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Uniwind, useCSSVariable } from 'uniwind';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initDB } from '~/database';
import { PortalHost } from '~/components/primitives/portal';
import { SettingsDropdownMenu } from '~/components/SettingsDropdownMenu';
import { Toaster, toast } from '~/components/ui/toast';

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
  const [primaryColor, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
  ]);

  useEffect(() => {
    try {
      initDB(); // Initialize DB on boot
    } catch (error) {
      console.error('Failed to initialize database:', error);
      toast.error('Failed to initialize database');
    }
  }, []);

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <SafeAreaListener
          onChange={({ insets }) => {
            Uniwind.updateInsets(insets);
          }}>
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
              name="gratitudeEntry"
              options={{
                title: 'Gratitude Entry',
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
        </SafeAreaListener>
      </QueryClientProvider>
    </>
  );
}
