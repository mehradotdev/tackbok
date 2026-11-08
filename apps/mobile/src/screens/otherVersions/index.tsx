import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import type { Asset, Entry } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { useEntriesWithOtherVersions, useTagMapping } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { ImageViewerModal } from '~/components/ImageViewerModal';
import { ThemeBackdrop } from '~/components/backdrops/ThemeBackdrop';
import { EntryItem } from '~/screens/dateEntries';

/** Entries that were edited on two devices at once, with both versions kept. */
export default function OtherVersionsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const tagMap = useTagMapping();
  const { data, isLoading, isError, refetch } = useEntriesWithOtherVersions();
  const entries = data ?? [];

  const [viewerPhotos, setViewerPhotos] = useState<Asset[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);

  const handlePhotoPress = (photos: Asset[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setIsViewerVisible(true);
  };

  const handleEntryPress = (entry: Entry) => {
    router.push({
      pathname: '/gratitudeEntry/[noteId]',
      params: { noteId: entry.note_id },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ThemeBackdrop />
      <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
        <Button
          onPress={() => router.back()}
          variant="ghost"
          className="p-1"
          accessibilityLabel={t('common.back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text
          variant="h2"
          numberOfLines={2}
          adjustsFontSizeToFit
          className="flex-1 text-foreground font-heading">
          {t('cloud.conflicts.otherVersionsTitle')}
        </Text>
      </View>

      {isLoading ? null : isError ? (
        <View className="flex-1 items-center justify-center gap-4 px-4">
          <Text className="text-muted-foreground text-center">
            {t('cloud.conflicts.otherVersionsLoadFailed')}
          </Text>
          <Button variant="outline" onPress={() => void refetch()}>
            <Text>{t('common.retry')}</Text>
          </Button>
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-muted-foreground text-center">
            {t('cloud.conflicts.noOtherVersions')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.note_id}
          ListHeaderComponent={
            <Text className="text-sm text-muted-foreground px-safe-or-3 py-3">
              {t('cloud.conflicts.otherVersionsDescription')}
            </Text>
          }
          renderItem={({ item }) => (
            <EntryItem
              entry={item}
              onPress={() => handleEntryPress(item)}
              tagMap={tagMap}
              onPhotoPress={handlePhotoPress}
              showDate
            />
          )}
          contentContainerClassName="pb-safe-or-4"
        />
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
