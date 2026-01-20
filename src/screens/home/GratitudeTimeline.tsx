import React from 'react';
import { format, subDays } from 'date-fns';
import { View, Text, ActivityIndicator, FlatList } from 'react-native';
import { IGratitudeDBLog, IGratitudeLogItem } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { useGratitudeLogs } from '~/hooks/useGratitude';
import { TimelineItem } from './GratitudeTimelineItem';
import { GratitudeMilestone, IMilestoneItem, isMilestone } from './GratitudeMilestone';

interface IGratitudeTimelineProps {
  onEntryPress: (entry: IGratitudeDBLog) => void;
}

// Union type for all items that can appear in the timeline
type TimelineListItem = IGratitudeLogItem | IMilestoneItem;

// Type guard to check if an item is a milestone
function isMilestoneItem(item: TimelineListItem): item is IMilestoneItem {
  return 'type' in item && item.type === 'milestone';
}

export const GratitudeTimeline: React.FC<IGratitudeTimelineProps> = ({
  onEntryPress,
}) => {
  const { t } = useTranslation();
  const today = new Date();
  const yesterday = subDays(today, 1);
  const todayStr = format(today, 'yyyy-MM-dd');
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
  const { data: logs, isLoading, isError, error } = useGratitudeLogs();
  const safeLogs = logs || [];

  // Create a shallow copy to manipulate
  const updatedLogs: IGratitudeLogItem[] = [...safeLogs];

  // 1. Check if first item is Today
  if (updatedLogs.length === 0 || updatedLogs[0].entryDate !== todayStr) {
    updatedLogs.unshift({
      entryDate: todayStr,
      entryContent: '',
      placeholderText: t('What are you grateful for today?'),
    });
  }

  // 2. Check if second item is Yesterday
  // After step 1, index 0 is guaranteed to be Today (either existing or added).
  // So we check index 1.
  if (updatedLogs.length < 2 || updatedLogs[1].entryDate !== yesterdayStr) {
    updatedLogs.splice(1, 0, {
      entryDate: yesterdayStr,
      entryContent: '',
      placeholderText: t('What were you grateful for yesterday?'),
    });
  }

  // 3. Insert milestones into the timeline
  // Count only entries that have actual content (not placeholders)
  const entriesWithContent = safeLogs.filter((log) => log.entryContent);
  const totalEntriesCount = entriesWithContent.length;

  // Build the final list with milestones interspersed
  const finalList: TimelineListItem[] = [];
  let entriesProcessed = 0;

  for (let i = 0; i < updatedLogs.length; i++) {
    const log = updatedLogs[i];

    // Check if we should insert a milestone before this entry
    // Milestones appear after X entries, so we check remaining entries count
    // Only insert milestone if the current log is a real entry (has content)
    // to avoid duplicates for placeholder entries
    const remainingEntries = totalEntriesCount - entriesProcessed;
    if (log.entryContent && isMilestone(remainingEntries)) {
      finalList.push({
        type: 'milestone',
        milestoneDays: remainingEntries,
      });
    }

    finalList.push(log);

    // Only count entries that have content
    if (log.entryContent) {
      entriesProcessed++;
    }
  }

  // 4. Mark the last item as isLast
  if (finalList.length > 0) {
    const lastIndex = finalList.length - 1;
    const lastItem = finalList[lastIndex];
    finalList[lastIndex] = { ...lastItem, isLast: true };
  }

  if (isLoading) return <ActivityIndicator size="large" className="mt-20" />;

  if (isError) {
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
    <View className="flex-1 bg-background w-full px-safe mb-safe">
      <FlatList
        data={finalList}
        keyExtractor={(item) =>
          isMilestoneItem(item) ? `milestone-${item.milestoneDays}` : item.entryDate
        }
        renderItem={({ item }) =>
          isMilestoneItem(item) ? (
            <GratitudeMilestone milestone={item} />
          ) : (
            <TimelineItem item={item} onPress={() => onEntryPress(item)} />
          )
        }
        ListFooterComponent={<View className="h-8" />}
        contentContainerClassName="pb-4"
      />
    </View>
  );
};
