import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import DateEntriesScreen from '~/screens/dateEntries';

export default function DateEntries() {
  const { dateMs } = useLocalSearchParams<{ dateMs: string }>();
  // Fallback for missing/invalid dateMs, frozen at mount so re-renders
  // don't shift the screen to a different day.
  const [fallbackMs] = useState(() => Date.now());

  const parsed = dateMs ? parseInt(dateMs, 10) : NaN;
  const dateMsNum = isNaN(parsed) ? fallbackMs : parsed;

  return <DateEntriesScreen dateMs={dateMsNum} />;
}
