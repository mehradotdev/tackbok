import React, { useState, useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { format, subDays, startOfDay } from 'date-fns';
import { LegendList } from '@legendapp/list';
import {
  type DayGroup,
  type MilestoneItem,
  type TimelineListItem,
  type Entry,
} from '~/types';
import { useTranslation } from '~/lib/i18n';
import { useEntriesGroupByDate } from '~/hooks/useGratitude';
import { TimelineItem } from './GratitudeTimelineItem';
import { GratitudeMilestone, isMilestone } from './GratitudeMilestone';

interface IGratitudeTimelineProps {
  onEntryPress: (entry: Entry) => void;
  onAddEntry?: (dateMs: number) => void;
}

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
}) => {
  const { t } = useTranslation();
  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);
  const todayMs = today.getTime();
  const yesterdayMs = yesterday.getTime();
  const { data, error } = useEntriesGroupByDate();

  // Track expanded state for each day group
  const [expandedDays, setExpandedDays] = useState<Set<number>>(
    new Set([todayMs, yesterdayMs]),
  );

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
    return <ActivityIndicator size="large" className="mt-20" />;
  }

  const groups = data;
  const totalContentDays = groups.size;

  // Convert to DayGroup array and apply view state
  const dayGroups = useMemo<DayGroup[]>(() => {
    return Array.from(groups).map(([dateMs, entries]) => ({
      dateMs,
      dateStr: format(new Date(dateMs), 'yyyy-MM-dd'),
      entries,
      isExpanded: expandedDays.has(dateMs),
      isToday: dateMs === todayMs,
      isYesterday: dateMs === yesterdayMs,
    }));
  }, [groups, expandedDays, todayMs, yesterdayMs]);

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
        isExpanded: expandedDays.has(todayMs),
        isToday: true,
        placeholderText: t('What are you grateful for today?'),
      });
    }

    if (!hasYesterday) {
      result.splice(1, 0, {
        dateMs: yesterdayMs,
        dateStr: format(yesterday, 'yyyy-MM-dd'),
        entries: [],
        isExpanded: expandedDays.has(yesterdayMs),
        isYesterday: true,
        placeholderText: t('What were you grateful for yesterday?'),
      });
    }

    return result;
  }, [dayGroups, groups, todayMs, yesterdayMs, today, yesterday, expandedDays, t]);

  // Insert milestones
  const finalList: TimelineListItem[] = useMemo(() => {
    const result: TimelineListItem[] = [];
    let processedDays = 0;

    finalDayGroups.forEach((group) => {
      // We know from DB that only entries with content are saved/returned usually,
      // but if we have checks, we validate here.
      // Placeholders have empty entries so hasContent is false.
      const hasContent = group.entries.some((e) => e.text_content);

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

  return (
    <View className="flex-1 bg-background w-full">
      <LegendList
        data={finalList}
        estimatedItemSize={100}
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
            />
          ) : null
        }
        ListFooterComponent={<View className="h-8" />}
        contentContainerClassName="pb-4"
      />
    </View>
  );
};
