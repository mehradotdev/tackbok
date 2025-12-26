import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GratitudeTimeline } from '~/components/GratitudeTimeline';
import { GratitudeDatepicker } from '~/components/GratitudeDatepicker';
import { format } from 'date-fns';

export default function HomeScreen() {
  const router = useRouter();

  const handleGratitudeDatepickerPress = (date: Date) => {
    router.push({
      pathname: '/gratitudeEntry',
      params: {
        entryDate: format(date, 'yyyy-MM-dd'),
      },
    });
  };

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
      <GratitudeDatepicker onDateSelect={handleGratitudeDatepickerPress} />
      <StatusBar style="auto" />
    </View>
  );
}
