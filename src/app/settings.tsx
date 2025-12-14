import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

const StyledSafeAreaView = withUniwind(SafeAreaView);

// TODO: Implement settings page
export default function Settings() {
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <Text className="text-foreground">Settings</Text>
    </StyledSafeAreaView>
  );
}
