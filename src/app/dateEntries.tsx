import { useLocalSearchParams } from 'expo-router';
import DateEntriesScreen from '~/screens/dateEntries';

export default function DateEntries() {
  const { dateMs } = useLocalSearchParams<{ dateMs: string }>();

  // Parse dateMs or default to today
  const dateMsNum = dateMs ? parseInt(dateMs, 10) : Date.now();

  return <DateEntriesScreen dateMs={dateMsNum} />;
}
