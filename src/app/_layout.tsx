import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initDB } from '~/database';
import { PortalHost } from '~/components/primitives/portal';
import { SettingsDropdownMenu } from '~/components/SettingsDropdownMenu';

const queryClient = new QueryClient();

export default function Layout() {
  const [primaryColor, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
  ]);

  useEffect(() => {
    initDB(); // Initialize DB on boot
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
        <PortalHost />
      </QueryClientProvider>
    </>
  );
}
