import { useLocalSearchParams } from 'expo-router';
import { EntryShareScreen } from '~/screens/sharing/entry-share-screen';

export default function ShareEntryRoute() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  return <EntryShareScreen noteId={noteId} />;
}

