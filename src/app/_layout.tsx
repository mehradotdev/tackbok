import '../global.css';

import { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';
import { Stack } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initDB } from '~/database';
import { useTranslation } from '~/lib/i18n';
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
  const { isRTL, isReady } = useTranslation();
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

  // Handle RTL layout direction
  // Note: Per Expo docs, I18nManager changes require app restart to take effect
  useEffect(() => {
    if (!isReady) return;

    const shouldBeRTL = isRTL;
    const currentIsRTL = I18nManager.isRTL;

    if (shouldBeRTL !== currentIsRTL && Platform.OS !== 'web') {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
      // Reload app for RTL changes to take effect
      // Updates.reloadAsync();
      reloadAppAsync('Language Change detected');
    }
  }, [isRTL, isReady]);

  return (
    <>
      <QueryClientProvider client={queryClient}>
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
        <Toaster />
        <PortalHost />
      </QueryClientProvider>
    </>
  );
}
