import { useLocalSearchParams } from 'expo-router';
import GratitudeEntryScreen from '~/screens/gratitudeEntry';

export default function ExistingGratitudeEntry() {
  const { noteId } = useLocalSearchParams<{
    noteId: string;
  }>();

  return <GratitudeEntryScreen noteId={noteId} />;
}
