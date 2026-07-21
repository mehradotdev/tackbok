import { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEntry } from '~/hooks/useGratitude';
import type { Asset } from '~/types';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { ImageViewerModal } from '~/components/ImageViewerModal';
import { GratitudeEntryView } from './GratitudeEntryView';
import { GratitudeEntryEdit } from './GratitudeEntryEdit';

interface IGratitudeEntryProps {
  noteId?: string;
  initialDateMs?: number;
  initialPromptTitle?: string;
}

export default function GratitudeEntryScreen({
  noteId,
  initialDateMs,
  initialPromptTitle,
}: IGratitudeEntryProps) {
  const [isEditMode, setIsEditMode] = useState(!noteId);
  const router = useRouter();
  const { data: entry } = useEntry(noteId);

  // Image Viewer — single instance shared by both View and Edit modes
  const [viewerPhotos, setViewerPhotos] = useState<Asset[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);

  const handlePhotoPress = (photos: Asset[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setIsViewerVisible(true);
  };

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
          initialPromptTitle={initialPromptTitle}
          onSaveSuccess={handleEditSaveSuccess}
          onCancel={() => {
            if (noteId) {
              setIsEditMode(false);
            } else {
              router.back();
            }
          }}
          onPhotoPress={handlePhotoPress}
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
            onPhotoPress={handlePhotoPress}
          />
        )
      )}

      <ImageViewerModal
        visible={isViewerVisible}
        initialIndex={viewerIndex}
        photos={viewerPhotos}
        onClose={() => setIsViewerVisible(false)}
      />
    </SafeAreaView>
  );
}
