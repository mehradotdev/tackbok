import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { GratitudeTimeline } from '~/components/GratitudeTimeline';
import { GratitudeDatepicker } from '~/components/GratitudeDatepicker';
import { format } from 'date-fns';
import { Header } from '~/components/Header';

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
    <SafeAreaView className="flex-1 bg-primary items-center justify-center">
      <Header />
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
      />
      <GratitudeDatepicker onDateSelect={handleGratitudeDatepickerPress} />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
