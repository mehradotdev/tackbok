import { useLocalSearchParams } from 'expo-router';
import DateEntriesScreen from '~/screens/dateEntries';

export default function DateEntries() {
  const { dateMs } = useLocalSearchParams<{ dateMs: string }>();

  // Parse dateMs, defaulting to Date.now() for missing or invalid values (NaN).
  const parsed = dateMs ? parseInt(dateMs, 10) : NaN;
  const dateMsNum = isNaN(parsed) ? Date.now() : parsed;

  return <DateEntriesScreen dateMs={dateMsNum} />;
}
