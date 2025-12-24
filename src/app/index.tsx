import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GratitudeTimeline } from '~/components/GratitudeTimeline';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-background items-center justify-center px-2">
      <GratitudeTimeline
        onEntryPress={(item) =>
          router.push({
            pathname: '/gratitudeEntry',
            params: {
              entryDate: item.entryDate,
              entryContent: item.entryContent,
            },
          })
        }
        onNewPress={() => router.push('/gratitudeEntry')}
      />
      <StatusBar style="auto" />
    </View>
  );
}
