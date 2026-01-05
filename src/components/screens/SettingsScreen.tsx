import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Text } from '~/components/ui/text';

// TODO: Implement settings page
export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <Text className="text-foreground">Settings</Text>
    </SafeAreaView>
  );
}
