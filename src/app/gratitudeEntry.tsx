import { useLocalSearchParams } from 'expo-router';
import { getGratitudeLogByDate } from '~/database';
import GratitudeEntryScreen from '~/screens/gratitudeEntry';

export default function GratitudeEntry() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let { entryDate, entryContent } = useLocalSearchParams<{
    entryDate: string;
    entryContent: string;
  }>();

  if (!entryDate) entryDate = today;
  if (!entryContent) {
    entryContent = getGratitudeLogByDate(entryDate)?.entryContent || '';
  }

  return <GratitudeEntryScreen entry={{ entryDate, entryContent }} />;
}
