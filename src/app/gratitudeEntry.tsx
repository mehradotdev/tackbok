import { useLocalSearchParams } from 'expo-router';
import { GratitudeEntry } from '~/components/GratitudeEntry';

/**
 * Renders a GratitudeEntry component for the entry specified in the router's local search parameters.
 *
 * @returns The GratitudeEntry element populated with `entryDate` and `entryContent` from local search params.
 */
export default function GratitudeEntryScreen() {
  const { entryDate, entryContent } = useLocalSearchParams<{
    entryDate: string;
    entryContent: string;
  }>();

  return <GratitudeEntry entry={{ entryDate, entryContent }} />;
}