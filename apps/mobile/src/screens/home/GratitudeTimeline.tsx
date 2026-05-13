import React, { useState, useMemo } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { View } from 'react-native';
import { format, subDays, startOfDay } from 'date-fns';
import { LegendList } from '@legendapp/list';
import {
  type DayGroup,
  type MilestoneItem,
  type TimelineListItem,
  type Entry,
  AssetType,
} from '~/types';
import { useTranslation } from '~/lib/i18n';
import { useEntriesGroupByDate, useTagMapping } from '~/hooks/useGratitude';
import { AppLoadingScreen } from '~/components/AppLoadingScreen';
import { Text } from '~/components/ui/text';
import { TimelineItem } from './GratitudeTimelineItem';
import { GratitudeMilestone, isMilestone } from './GratitudeMilestone';

interface IGratitudeTimelineProps {
  onEntryPress: (entry: Entry) => void;
  onAddEntry?: (dateMs: number) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

const EMPTY_GROUPS = new Map<number, Entry[]>();

// Type guard to check if an item is a milestone
function isMilestoneItem(item: TimelineListItem): item is MilestoneItem {
  return 'type' in item && item.type === 'milestone';
}

// Type guard to check if an item is a day group
function isDayGroupItem(item: TimelineListItem): item is DayGroup {
  return 'dateMs' in item && 'entries' in item;
}

export const GratitudeTimeline: React.FC<IGratitudeTimelineProps> = ({
  onEntryPress,
  onAddEntry,
  onScroll,
}) => {
  const { t } = useTranslation();
  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);
  const todayMs = today.getTime();
  const yesterdayMs = yesterday.getTime();
  const { data, error } = useEntriesGroupByDate();
  const tagMap = useTagMapping();

  // Track expanded state for each day group
  const [expandedDays, setExpandedDays] = useState<Set<number>>(
    new Set([todayMs, yesterdayMs]),
  );

  // Use safe defaults when data is null
  const groups = data ?? EMPTY_GROUPS;
  const totalContentDays = groups.size;

  // Convert to DayGroup array and apply view state
  const dayGroups = useMemo<DayGroup[]>(() => {
    return Array.from(groups).map(([dateMs, entries]) => ({
      dateMs,
      dateStr: format(new Date(dateMs), 'yyyy-MM-dd'),
      entries,
      isExpanded: false, // Default to false, controlled via extraData
      isToday: dateMs === todayMs,
      isYesterday: dateMs === yesterdayMs,
    }));
  }, [groups, todayMs, yesterdayMs]);

  // Add placeholder groups for today and yesterday if they don't exist
  const finalDayGroups = useMemo(() => {
    const hasToday = groups.has(todayMs);
    const hasYesterday = groups.has(yesterdayMs);

    // If we have both, no need to copy, just use dayGroups
    if (hasToday && hasYesterday) {
      return dayGroups;
    }

    const result = [...dayGroups];

    if (!hasToday) {
      result.unshift({
        dateMs: todayMs,
        dateStr: format(today, 'yyyy-MM-dd'),
        entries: [],
        isExpanded: false,
        isToday: true,
        placeholderText: t('What are you grateful for today?'),
      });
    }

    if (!hasYesterday) {
      result.splice(1, 0, {
        dateMs: yesterdayMs,
        dateStr: format(yesterday, 'yyyy-MM-dd'),
        entries: [],
        isExpanded: false,
        isYesterday: true,
        placeholderText: t('What were you grateful for yesterday?'),
      });
    }

    return result;
  }, [dayGroups, groups, todayMs, yesterdayMs, today, yesterday, t]);

  // Insert milestones
  const finalList: TimelineListItem[] = useMemo(() => {
    const result: TimelineListItem[] = [];
    let processedDays = 0;

    finalDayGroups.forEach((group) => {
      // Placeholders have an empty entries array, so hasContent is false.
      // For real entries, check that at least one has substantive data.
      const hasContent = group.entries.some(
        (e) =>
          e.text_content || e.text_title || e.mood || (e.assets && e.assets.length > 0),
      );

      const remainingDays = totalContentDays - processedDays;

      if (hasContent && isMilestone(remainingDays)) {
        result.push({
          type: 'milestone',
          milestoneDays: remainingDays,
        });
      }

      result.push(group);
      if (hasContent) {
        processedDays += 1;
      }
    });

    // Add day 0 milestone at the end which is always last
    result.push({
      type: 'milestone',
      milestoneDays: 0,
      isLast: true,
    });

    return result;
  }, [finalDayGroups, totalContentDays]);

  const toggleDayExpanded = (dateMs: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateMs)) {
        next.delete(dateMs);
      } else {
        next.add(dateMs);
      }
      return next;
    });
  };

  if (!data) {
    if (error) {
      return (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-center text-red-600 mb-2">
            {t('Failed to load entries')}
          </Text>
          <Text className="text-center text-gray-500">
            {error?.message || t('Unknown error')}
          </Text>
        </View>
      );
    }
    return (
      <View className="flex-1 w-full bg-background">
        <AppLoadingScreen modal />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background w-full">
      <LegendList
        recycleItems={true}
        data={finalList}
        getItemType={(item) => (isMilestoneItem(item) ? 'milestone' : 'dayGroup')}
        getEstimatedItemSize={(_index, item, type) => {
          if (type === 'milestone') return 80;
          if (isDayGroupItem(item)) {
            const isExpanded = expandedDays.has(item.dateMs);
            const numEntries = item.entries.length;
            // Check if any entries have photos
            const hasPhotos = item.entries.some(
              (e) => e.assets && e.assets.some((a) => a.type === AssetType.IMAGE),
            );
            const hasText = item.entries.some(
              (e) => e.text_content && e.text_content.trim().length > 0,
            );
            const photosExtra = hasPhotos ? 80 : 0; // ~80px for horizontal scroll row
            const textExtra = hasText ? 40 : 0;
            // Collapsed: ~70px header + (~40px preview if has text) + optional photos
            // Expanded: ~70px header + ~150px per entry + optional photos
            return isExpanded
              ? 70 + numEntries * (150 + photosExtra)
              : 70 + textExtra + photosExtra;
          }
          return 150;
        }}
        extraData={[expandedDays, tagMap]}
        keyExtractor={(item) =>
          isMilestoneItem(item)
            ? `milestone-${item.milestoneDays}`
            : isDayGroupItem(item)
              ? `day-${item.dateMs}`
              : 'unknown'
        }
        renderItem={({ item }) =>
          isMilestoneItem(item) ? (
            <GratitudeMilestone milestone={item} />
          ) : isDayGroupItem(item) ? (
            <TimelineItem
              dayGroup={item}
              onEntryPress={onEntryPress}
              onToggleExpand={() => toggleDayExpanded(item.dateMs)}
              onPlaceholderPress={() => onAddEntry?.(item.dateMs)}
              isExpanded={expandedDays.has(item.dateMs)}
            />
          ) : null
        }
        ListFooterComponent={<View className="h-8" />}
        contentContainerClassName="pb-4"
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
    </View>
  );
};
