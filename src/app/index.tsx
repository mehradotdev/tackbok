import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Text } from '~/components/ui/text';

export default function App() {
  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      {/* Heading */}
      <Text className="text-4xl font-extrabold text-foreground mb-3 tracking-tight">
        🚀 Welcome
      </Text>

      {/* Subheading */}
      <Text className="text-xl text-foreground mb-8 text-center leading-relaxed">
        Build beautiful apps with{' '}
        <Text className="text-blue-400 font-semibold">Expo (Router) + Uniwind 🔥</Text>
      </Text>

      {/* Instruction text */}
      <Text className="text-base text-foreground text-center max-w-sm">
        Start customizing your app by editing{' '}
        <Text className="font-semibold text-foreground">app/index.tsx</Text>
      </Text>

      <StatusBar style="auto" />
    </View>
  );
}
