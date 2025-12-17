import { Text } from 'react-native';
import { SafeAreaView } from '~/components/ui/safe-area-view';

/**
 * Render the app's settings screen placeholder.
 *
 * Renders a SafeAreaView containing a "Settings" text; intended as a placeholder for the full settings UI.
 *
 * @returns A React element representing the settings screen
 */
export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <Text className="text-foreground">Settings</Text>
    </SafeAreaView>
  );
}