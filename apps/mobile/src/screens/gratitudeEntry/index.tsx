import { useState, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEntry } from '~/hooks/useGratitude';
import { useTranslation } from '~/lib/i18n';
import type { Asset } from '~/types';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { ImageViewerModal } from '~/components/ImageViewerModal';
import { ThemeBackdrop } from '~/components/backdrops/ThemeBackdrop';
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
  const { t } = useTranslation();
  const { data: entry, isLoading } = useEntry(noteId);

  // Deleting an entry clears its cache before the delayed back-navigation runs,
  // so keep the last loaded entry on screen instead of flashing "not found".
  const lastEntryRef = useRef(entry);
  if (entry) lastEntryRef.current = entry;
  const displayEntry = entry ?? lastEntryRef.current;

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
      <ThemeBackdrop />
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
      ) : !displayEntry && noteId ? (
        isLoading ? (
          <View className="flex-1 items-center justify-center">
            {/* Native loading indicator */}
            <ActivityIndicator size="large" />
          </View>
        ) : (
          /* Query settled without a result — the entry no longer exists */
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-lg font-body-medium text-muted-foreground">
              {t('Entry not found')}
            </Text>
            <Button variant="outline" onPress={() => router.back()}>
              <Text>{t('Back')}</Text>
            </Button>
          </View>
        )
      ) : (
        /* View Mode */
        displayEntry && (
          <GratitudeEntryView
            entry={displayEntry}
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
