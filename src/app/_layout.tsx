import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initDB } from '~/database';
import { PortalHost } from '~/components/primitives/portal';
import { SettingsDropdownMenu } from '~/components/SettingsDropdownMenu';
import { Toaster, toast } from '~/components/ui/toast';

const queryClient = new QueryClient();

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
        <Stack
          screenOptions={{
            headerShown: true,
            headerTitleAlign: 'center',
            headerTintColor: primaryForeground as string,
            headerStyle: { backgroundColor: primaryColor as string },
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        >
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
