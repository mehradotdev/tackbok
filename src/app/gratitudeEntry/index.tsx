import { useLocalSearchParams } from 'expo-router';
import GratitudeEntryScreen from '~/screens/gratitudeEntry';

export default function NewGratitudeEntry() {
  const { dateMs } = useLocalSearchParams<{
    dateMs?: string;
  }>();

  // Parse dateMs if present, otherwise GratitudeEntryScreen will default to Date.now()
  const initialDateMs = dateMs ? parseInt(dateMs, 10) : undefined;

  return <GratitudeEntryScreen initialDateMs={initialDateMs} />;
}
