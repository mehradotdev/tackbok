import { useLocalSearchParams } from 'expo-router';
import { getGratitudeLogByDate } from '~/database';
import { GratitudeEntry } from '~/components/GratitudeEntry';

export default function GratitudeEntryScreen() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let { entryDate, entryContent } = useLocalSearchParams<{
    entryDate: string;
    entryContent: string;
  }>();

  if (!entryDate) entryDate = today;
  if (!entryContent) {
    entryContent = getGratitudeLogByDate(entryDate)?.entryContent || '';
  }

  return <GratitudeEntry entry={{ entryDate, entryContent }} />;
}
