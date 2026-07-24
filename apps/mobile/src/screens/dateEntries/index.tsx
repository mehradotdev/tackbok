import React, { useState } from 'react';
import { View, FlatList, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { format, startOfDay } from 'date-fns';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { MOOD_OPTIONS } from '~/constants';
import { type Entry, type Asset } from '~/types';
import { combineDateWithCurrentTime } from '~/lib/utils';
import { getFullPhotoUri, filterExistingPhotos } from '~/lib/photoUtils';
import { filterExistingVoiceMemos } from '~/lib/voiceMemoUtils';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { useEntriesForDay, useTagMapping } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Badge } from '~/components/ui/badge';
import { ImageViewerModal } from '~/components/ImageViewerModal';
import { AudioPlayer } from '~/components/AudioPlayer';
import { ThemeBackdrop } from '~/components/backdrops/ThemeBackdrop';

interface IDateEntriesScreenProps {
  dateMs: number;
}

interface IEntryItemProps {
  entry: Entry;
  onPress: () => void;
  tagMap: ReturnType<typeof useTagMapping>;
  onPhotoPress: (photos: Asset[], index: number) => void;
}

function EntryItem({ entry, onPress, tagMap, onPhotoPress }: IEntryItemProps) {
  const { t } = useTranslation();
  const time = format(new Date(entry.created_at), 'HH:mm');

  const moodOption = entry.mood ? MOOD_OPTIONS.find((o) => o.value === entry.mood) : null;

  const tags = (entry.tags ? entry.tags.split(',') : [])
    .filter((id) => id.trim().length > 0)
    .map((id) => tagMap.get(id.trim())) // Trim whitespace from tag IDs if present
    .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));

  // Extract photo assets (only those whose files exist on disk)
  const photos = filterExistingPhotos(entry.assets ?? null);

  // Extract voice memo assets (only those whose files still exist on disk)
  const voiceMemos = filterExistingVoiceMemos(entry.assets ?? null);

  return (
    <Pressable
      onPress={onPress}
      className="flex-col w-full px-safe-or-3 border-b border-border py-3 active:bg-muted">
      <View>
        {/* Row 1: Time + Mood */}
        <View className="flex-row flex-wrap items-center gap-2 mb-2">
          {/* Time Badge - Preserving "Current" style but removing mood */}
          <Text
            className={cn(
              'self-start font-body-bold tracking-wider text-foreground/70',
              'py-1 px-3 bg-muted border border-border rounded-full',
            )}>
            {time}
          </Text>

          {/* Mood Badge - New Style from GratitudeEntryEdit */}
          {moodOption && (
            <View className="relative flex-row items-center px-3 py-0.5 gap-1.5 bg-primary/50 rounded-full border border-border">
              <Text className="text-xl">{moodOption.emoji}</Text>
              <Text className="text-sm tracking-wide font-body-medium text-primary-foreground">
                {t(`Feeling ${moodOption.label}`)}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        {entry.text_title && (
          <Text className="text-lg font-body-semibold text-foreground mb-1" numberOfLines={1}>
            {entry.text_title}
          </Text>
        )}

        {/* Content */}
        {entry.text_content && (
          <Text className="text-base text-foreground leading-6" numberOfLines={3}>
            {entry.text_content}
          </Text>
        )}

        {/* Tags - Last Row */}
        {tags.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag.tag_id}
                variant="secondary"
                className="px-2 py-1 rounded-md">
                <Text className="text-sm text-foreground/70 font-body-bold">#{tag.title}</Text>
              </Badge>
            ))}
          </View>
        )}
      </View>

      {/* Voice memo players */}
      {voiceMemos.length > 0 && (
        <View className="mt-2 gap-2">
          {voiceMemos.map((memo) => (
            <AudioPlayer key={memo.uri} uri={memo.uri} />
          ))}
        </View>
      )}

      {/* Photos — horizontal scroll thumbnails */}
      {photos.length > 0 && (
        <View className="h-[88px]">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-2"
            contentContainerClassName="gap-2">
            {photos.map((photo, index) => (
              <Pressable key={photo.uri} onPress={() => onPhotoPress(photos, index)}>
                <Image
                  source={{ uri: getFullPhotoUri(photo.uri) }}
                  className="w-20 h-20 rounded-lg"
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </Pressable>
  );
}

export default function DateEntriesScreen({ dateMs }: IDateEntriesScreenProps) {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const tagMap = useTagMapping();

  const [viewerPhotos, setViewerPhotos] = useState<Asset[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);

  const handlePhotoPress = (photos: Asset[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setIsViewerVisible(true);
  };

  // Get date string for display
  const dateStart = startOfDay(new Date(dateMs));
  const dateStr = format(dateStart, 'yyyy-MM-dd');
  const formattedDate = formatLocalizedDate(dateStr, t);

  // Load entries for this date
  const { data, isLoading } = useEntriesForDay(dateStart.getTime());

  const entries = data || [];

  const handleEntryPress = (entry: Entry) => {
    router.push({
      pathname: '/gratitudeEntry/[noteId]',
      params: { noteId: entry.note_id },
    });
  };

  const handleNewEntry = () => {
    const entryDate = combineDateWithCurrentTime(dateStart);
    router.push({
      pathname: '/gratitudeEntry',
      params: { dateMs: entryDate.getTime().toString() },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ThemeBackdrop />
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Button onPress={() => router.back()} variant="ghost" className="p-1">
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>

        <Text variant="h2" className="text-foreground font-heading">
          {formattedDate}
        </Text>

        <Button onPress={handleNewEntry} variant="ghost" className="p-1">
          <Icon as={Plus} className="text-foreground" />
        </Button>
      </View>

      {/* Entries list */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">{t('Loading...')}</Text>
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-muted-foreground text-center mb-4">
            {t('No entries for this date')}
          </Text>
          <Button onPress={handleNewEntry}>
            <Text>{t('Create Entry')}</Text>
          </Button>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.note_id}
          renderItem={({ item }) => (
            <EntryItem
              entry={item}
              onPress={() => handleEntryPress(item)}
              tagMap={tagMap}
              onPhotoPress={handlePhotoPress}
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
