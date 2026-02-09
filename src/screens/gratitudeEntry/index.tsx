import { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEntry } from '~/hooks/useGratitude';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { GratitudeEntryView } from './GratitudeEntryView';
import { GratitudeEntryEdit } from './GratitudeEntryEdit';

interface IGratitudeEntryProps {
  noteId?: string;
  initialDateMs?: number;
}

export default function GratitudeEntryScreen({
  noteId,
  initialDateMs,
}: IGratitudeEntryProps) {
  const [isEditMode, setIsEditMode] = useState(!noteId);
  const router = useRouter();
  const { data: entry } = useEntry(noteId);

  const handleEditSaveSuccess = () => {
    if (noteId) {
      // Existing entry was updated
      setIsEditMode(false);
    } else {
      // New entry created
      router.back();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {isEditMode ? (
        <GratitudeEntryEdit
          initialEntry={entry}
          initialDateMs={initialDateMs}
          onSaveSuccess={handleEditSaveSuccess}
          onCancel={() => {
            if (noteId) {
              setIsEditMode(false);
            } else {
              router.back();
            }
          }}
        />
      ) : !entry && noteId ? (
        <View className="flex-1 items-center justify-center">
          {/* Native loading indicator */}
          <ActivityIndicator size="large" />
        </View>
      ) : (
        /* View Mode */
        entry && (
          <GratitudeEntryView
            entry={entry}
            onEdit={() => setIsEditMode(true)}
            onBack={() => router.back()}
          />
        )
      )}
    </SafeAreaView>
  );
}
