import React, { useState } from 'react';
import { View, Pressable, Platform, FlatList, Image, ScrollView } from 'react-native';
import { format } from 'date-fns';
import { MOOD_EMOJI } from '~/constants';
import { type DayGroup, type Entry } from '~/types';
import { cn } from '~/lib/utils';
import { useSettingsStore } from '~/lib/settings';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { getFullPhotoUri, filterExistingPhotos } from '~/lib/photoUtils';
import { useTagMapping } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { AnimatedButton } from '~/components/ui/animated-button';
import { ImageViewerModal } from '~/components/ImageViewerModal';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { TimelineDotAnimated } from './TimelineDot';

// ============================================================================
// Types
// ============================================================================

interface ITimelineItemProps {
  dayGroup: DayGroup;
  onEntryPress: (entry: Entry) => void;
  onToggleExpand: () => void;
  onPlaceholderPress?: () => void;
  isExpanded?: boolean;
}

interface IEntryRowProps {
  entry: Entry;
  onPress: () => void;
  isFirst: boolean;
  isLast: boolean;
  isRTL: boolean;
  timelineEntryLength: number;
  tagMap: ReturnType<typeof useTagMapping>;
}

// ============================================================================
// Expanded Entry Row Component
// ============================================================================

function ExpandedEntryRow({
  entry,
  onPress,
  isFirst,
  isLast,
  isRTL = false,
  timelineEntryLength,
  tagMap,
}: IEntryRowProps) {
  const time = format(new Date(entry.created_at), 'HH:mm');
  const showTimelineBorders = useSettingsStore((state) => state.showTimelineBorders);

  const tags = (entry.tags ? entry.tags.split(',') : [])
    .filter((id) => id.trim().length > 0)
    .map((id) => tagMap.get(id.trim()))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));

  // Extract photo assets for this entry (only those whose files exist on disk)
  const photos = filterExistingPhotos(entry.assets ?? null);

  // Image Viewer State
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  return (
    <View
      className={cn(
        'flex-1 flex-row',
        showTimelineBorders && 'border-border border-t-2',
      )}>
      {/* Timeline Column */}
      <View
        className={cn(
          'w-4 items-end h-full z-10',
          showTimelineBorders && 'border-muted-foreground/80',
          showTimelineBorders && 'border-r-2',
          showTimelineBorders &&
            isRTL &&
            Platform.OS === 'ios' &&
            'border-l-2 border-r-0',
        )}>
        {/* The Entry Dot */}
        <View
          className={cn(
            'w-[14px] h-[14px] rounded-full z-10 mt-3.5 right-[-7px] bg-background',
            'border-3 border-foreground/60',
            showTimelineBorders && 'right-[-8px]',
          )}
        />
        {/* Git Commit branch style Timeline. Only show when showTimelineBorders is false */}
        {!showTimelineBorders && (
          <React.Fragment>
            {/* 1. First Entry: Curved branch connector from main timeline (top-right curve) */}
            {isFirst && (
              <View
                className={cn(
                  'absolute left-0 w-4 h-4',
                  'border-t-[2px] border-border rounded-tr-full border-r-[2px]',
                  isRTL && Platform.OS === 'ios' && 'border-l-[2px] border-r-0',
                )}
              />
            )}

            {/* 2. Straight vertical line - dynamic top/bottom based on isFirst and isLast */}
            <View
              className={cn(
                'w-[2px] bg-border absolute right-[-1px]',
                // Top position: starts from top for non-first, below the curve for first
                isFirst ? 'top-4' : 'top-0',
                // Bottom position: extends to bottom for non-last, stops at dot for last
                isLast ? 'h-4' : 'bottom-0',
              )}
            />

            {/* 3. Last Entry: Reddit-style curved closer - curves outward to encompass the entry */}
            {isLast && (
              <View
                className={cn(
                  'absolute top-6 bottom-0 w-3',
                  'border-border border-b-[2px] left-4',
                  'border-l-[2px] rounded-bl-full',
                  isRTL &&
                    Platform.OS === 'ios' &&
                    'border-r-[2px] rounded-br-full border-l-0',
                )}
              />
            )}
          </React.Fragment>
        )}
      </View>

      {/* --- Content Column --- */}
      <Pressable
        onPress={onPress}
        className="flex-1 flex-col pt-2 pl-0 pb-2 active:bg-muted">
        <View className="flex-col items-start pl-3 pr-2">
          {/* Time & Mood */}
          <Badge
            variant="outline"
            className="self-start -left-3 py-0.5 mb-2 pl-3 pr-2 bg-muted shadow-lg shadow-foreground/50">
            <Text className="text-sm font-black tracking-wider text-foreground/80">
              {time}
            </Text>
            {entry.mood && <Text className="text-base">{MOOD_EMOJI[entry.mood]}</Text>}
          </Badge>

          {/* Title */}
          {entry.text_title && (
            <Text className="text-lg font-semibold text-foreground" numberOfLines={2}>
              {entry.text_title}
            </Text>
          )}

          {/* Content preview */}
          {entry.text_content && (
            <Text
              className="text-base text-foreground"
              numberOfLines={timelineEntryLength}>
              {entry.text_content}
            </Text>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.tag_id}
                  variant="secondary"
                  className="px-2 py-1 rounded-md">
                  <Text className="text-sm text-foreground/70 font-bold">
                    #{tag.title}
                  </Text>
                </Badge>
              ))}
            </View>
          )}
        </View>

        {/* Photos — horizontal scroll thumbnails */}
        {photos.length > 0 && (
          <View className="h-[88px] mt-2 pr-3">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="pl-3 gap-2">
              {photos.map((photo, index) => (
                <Pressable
                  key={photo.uri}
                  onPress={() => {
                    setViewerIndex(index);
                    setIsViewerVisible(true);
                  }}>
                  <Image
                    source={{ uri: getFullPhotoUri(photo.uri) }}
                    className="w-20 h-20 rounded-lg"
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>

            <ImageViewerModal
              visible={isViewerVisible}
              initialIndex={viewerIndex}
              photos={photos}
              onClose={() => setIsViewerVisible(false)}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export const TimelineItem: React.FC<ITimelineItemProps> = ({
  dayGroup,
  onEntryPress,
  onToggleExpand,
  onPlaceholderPress,
  isExpanded: isExpandedProp,
}) => {
  const { t, isRTL } = useTranslation();
  const timelineEntryLength = useSettingsStore((state) => state.timelineEntryLength);
  const showTimelineBorders = useSettingsStore((state) => state.showTimelineBorders);
  const tagMap = useTagMapping();

  // Image Viewer State
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const isExpanded = isExpandedProp ?? dayGroup.isExpanded;

  const formattedDate = formatLocalizedDate(dayGroup.dateStr, t);
  const isToday = dayGroup.isToday ?? false;
  const hasEntries = dayGroup.entries.length > 0;

  // Pre-compute all photos across all entries for the collapsed view (only existing files)
  const allPhotos = dayGroup.entries.flatMap((e) =>
    filterExistingPhotos(e.assets ?? null),
  );

  return (
    <View
      className={cn(
        'flex-row w-full',
        showTimelineBorders && 'border-b-2 border-border',
      )}>
      {/* Timeline Column */}
      <View className="w-6 items-end">
        {/* Continuous Line */}
        <View className={cn('w-[4px] bg-foreground absolute top-0 bottom-0')} />

        {/* The Dot */}
        <View className={cn('absolute z-10 mt-5 right-[-8px]')}>
          <TimelineDotAnimated isExpanded={isExpanded} isToday={isToday} />
        </View>
      </View>

      {/* Content Column */}
      <View className="flex-1 flex-col items-start">
        {/* Date Header - Clickable to expand/collapse */}
        <AnimatedButton
          variant="outline"
          size="flex"
          onPress={onToggleExpand}
          containerClassName={cn('self-start mb-2', 'mt-2')}
          className="bg-muted active:bg-muted py-0.5 pl-3 pr-2 rounded-full border-2 border-transparent shadow-none">
          <Text className="text-lg font-bold text-foreground font-serif">
            {formattedDate}
            {hasEntries && (
              <Text className="text-sm text-muted-foreground font-bold">
                {' '}
                ({dayGroup.entries.length})
              </Text>
            )}
          </Text>
        </AnimatedButton>

        {/* Placeholder (when expanded and no entries) */}
        {isExpanded && !hasEntries && (
          <Button
            variant="ghost"
            size="flex"
            onPress={onPlaceholderPress}
            className="w-full justify-start">
            <Text className="text-base px-4 pb-4 text-muted-foreground leading-6">
              {dayGroup.placeholderText || t('What were you grateful for?')}
            </Text>
          </Button>
        )}

        {/* Entries List (when expanded) */}
        {isExpanded && hasEntries && (
          <View className="w-full p-0 m-0 flex-1">
            {dayGroup.entries.map((entry, index) => (
              <ExpandedEntryRow
                key={entry.note_id}
                entry={entry}
                onPress={() => onEntryPress(entry)}
                isRTL={isRTL}
                isFirst={index === 0}
                isLast={index === dayGroup.entries.length - 1}
                timelineEntryLength={timelineEntryLength}
                tagMap={tagMap}
              />
            ))}
          </View>
        )}

        {/* Entries List Collapsed View (when not expanded and has entries) */}
        {!isExpanded && hasEntries && (
          <Pressable
            onPress={onToggleExpand}
            className="w-full active:bg-muted rounded-lg">
            <Text
              className="text-base px-4 pb-2 text-foreground"
              numberOfLines={timelineEntryLength}>
              {dayGroup.entries
                .map((e) => e.text_content)
                .filter((text) => text && text.trim().length > 0)
                .join('\n')}
            </Text>

            {/* Collapsed photos — all photos from all entries for this day */}
            {allPhotos.length > 0 && (
              // h-18 needed to limit height of FlatList
              <View className="h-18 pr-4">
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={allPhotos}
                  keyExtractor={(item, idx) => `${item.uri}-${idx}`}
                  contentContainerClassName="gap-2 pb-2 pl-4"
                  onStartShouldSetResponder={() => true}
                  renderItem={({ item: photo, index }) => (
                    <Pressable
                      onPress={() => {
                        setViewerIndex(index);
                        setIsViewerVisible(true);
                      }}>
                      <Image
                        source={{ uri: getFullPhotoUri(photo.uri) }}
                        className="w-16 h-16 rounded-lg"
                        resizeMode="cover"
                      />
                    </Pressable>
                  )}
                />

                <ImageViewerModal
                  visible={isViewerVisible}
                  initialIndex={viewerIndex}
                  photos={allPhotos}
                  onClose={() => setIsViewerVisible(false)}
                />
              </View>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
};
