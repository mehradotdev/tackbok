import '../global.css';

import { Stack } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { PortalHost } from '~/components/primitives/portal';
import { SettingsDropdownMenu } from '~/components/SettingsDropdownMenu';

export default function Layout() {
  const [primaryColor, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
  ]);

  return (
    <>
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
          name="settings"
          options={{
            title: 'Settings',
            headerShown: false,
          }}
        />
      </Stack>
      <PortalHost />
    </>
  );
}
