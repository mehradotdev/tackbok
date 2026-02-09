import { useLocalSearchParams } from 'expo-router';
import GratitudeEntryScreen from '~/screens/gratitudeEntry';

export default function NewGratitudeEntry() {
  const { dateMs } = useLocalSearchParams<{
    dateMs?: string;
  }>();

  // Parse dateMs, returning undefined for missing or invalid values (NaN).
  // GratitudeEntryScreen will default to Date.now() if undefined.
  const parsed = dateMs ? parseInt(dateMs, 10) : NaN;
  const initialDateMs = isNaN(parsed) ? undefined : parsed;

  return <GratitudeEntryScreen initialDateMs={initialDateMs} />;
}
