import { useLocalSearchParams } from 'expo-router';
import { GratitudeEntry } from '~/components/GratitudeEntry';

export default function GratitudeEntryScreen() {
  const { entryDate, entryContent } = useLocalSearchParams<{
    entryDate: string;
    entryContent: string;
  }>();

  return <GratitudeEntry entry={{ entryDate, entryContent }} />;
}
