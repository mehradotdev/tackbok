import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GratitudeTimeline } from '~/components/GratitudeTimeline';

/**
 * Renders the home screen containing a GratitudeTimeline and manages navigation to the gratitude entry screen.
 *
 * Pressing an existing timeline entry navigates to `/gratitudeEntry` and supplies `entryDate` and `entryContent` as route params; pressing the "new" action navigates to `/gratitudeEntry` without params.
 *
 * @returns The JSX element for the Home screen.
 */
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