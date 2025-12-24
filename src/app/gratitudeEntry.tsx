import { useLocalSearchParams } from 'expo-router';
import { GratitudeEntry } from '~/components/GratitudeEntry';

export default function GratitudeEntryScreen() {
  // Provide defaults for new entries
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const { entryDate, entryContent } = useLocalSearchParams<{
    entryDate: string;
    entryContent: string;
  }>();

  return (
    <GratitudeEntry
      entry={{
        entryDate: (entryDate as string) || today,
        entryContent: (entryContent as string) || '',
      }}
    />
  );
}
