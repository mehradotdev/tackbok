import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import { format } from 'date-fns';
import { CircleMinus, CirclePlus, Minus, Plus } from 'lucide-react-native';
import { type DayGroup, type Entry } from '~/types';
import { MOOD_EMOJI } from '~/constants';
import { cn } from '~/lib/utils';
import { useSettingsStore } from '~/lib/settings';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { useTagMapping } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';

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
    .map((id) => tagMap.get(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <View
      className={cn(
        'flex-1 flex-row',
        showTimelineBorders && 'border-border border-t-2',
      )}>
      {/* Timeline Column */}
      <View
        className={cn(
          'w-4 items-end h-full z-5',
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
      <View className="flex-1 pt-2 pl-0">
        {/* Heading Time & Mood */}
        <Badge variant="outline" className="self-start py-0.5 mb-2 pl-3 pr-2 bg-muted">
          <Text className="text-sm font-black tracking-wider text-foreground/80">
            {time}
          </Text>
          {entry.mood && <Text className="text-base">{MOOD_EMOJI[entry.mood]}</Text>}
        </Badge>

        {/* Body Content */}
        <Button
          variant="ghost"
          size="flex"
          onPress={onPress}
          className="flex-col items-start pl-3 pr-2 pb-2">
          {/* Title */}
          {entry.text_title && (
            <Text className="text-lg font-semibold text-foreground" numberOfLines={2}>
              {entry.text_title}
            </Text>
          )}

          {/* Content preview */}
          {entry.text_content && (
            <Text
              className="text-base text-foreground/80"
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
        </Button>
      </View>
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

  const isExpanded = isExpandedProp ?? dayGroup.isExpanded;

  const formattedDate = formatLocalizedDate(dayGroup.dateStr, t);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isToday = dayGroup.dateStr === todayStr;
  const hasEntries = dayGroup.entries.length > 0;

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
        <Pressable
          onPress={onToggleExpand}
          hitSlop={4}
          className={cn(
            'z-10 mt-3 bg-background rounded-full right-[-8px] active:scale-125',
            isToday && 'bg-foreground p-0.5 mt-5',
          )}>
          <Icon
            as={
              isToday
                ? isExpanded
                  ? Minus
                  : Plus
                : isExpanded
                  ? CircleMinus
                  : CirclePlus
            }
            className={cn('text-foreground size-5', isToday && 'text-background size-4')}
          />
        </Pressable>
      </View>

      {/* Content Column */}
      <View className="flex-1 flex-col items-start">
        {/* Date Header - Clickable to expand/collapse */}
        <Button
          variant="ghost"
          size="flex"
          onPress={onToggleExpand}
          className={cn('pt-2 pb-1 px-4', isToday && 'pt-4')}>
          <Text className="text-lg font-bold text-foreground font-serif">
            {formattedDate}
            {hasEntries && (
              <Text className="text-sm text-muted-foreground font-bold">
                {' '}
                ({dayGroup.entries.length})
              </Text>
            )}
          </Text>
        </Button>

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
          <Text
            className="text-base px-4 pb-2 text-foreground"
            numberOfLines={timelineEntryLength}>
            {dayGroup.entries
              .map((e) => e.text_content)
              .filter((text) => text && text.trim().length > 0)
              .join('\n')}
          </Text>
        )}
      </View>
    </View>
  );
};
