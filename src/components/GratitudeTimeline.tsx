import React from 'react';
import { format, subDays } from 'date-fns';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { TimelineItem } from './GratitudeTimelineItem';
import { useGratitudeLogs } from '~/hooks/useGratitude';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { IGratitudeDBLog, IGratitudeLogItem } from '~/types';

interface IGratitudeTimelineProps {
  onEntryPress: (entry: IGratitudeDBLog) => void;
}

export const GratitudeTimeline: React.FC<IGratitudeTimelineProps> = ({
  onEntryPress,
}) => {
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
      placeholderText: 'What are you grateful for today?',
    });
  }

  // 2. Check if second item is Yesterday
  // After step 1, index 0 is guaranteed to be Today (either existing or added).
  // So we check index 1.
  if (updatedLogs.length < 2 || updatedLogs[1].entryDate !== yesterdayStr) {
    updatedLogs.splice(1, 0, {
      entryDate: yesterdayStr,
      entryContent: '',
      placeholderText: 'What were you grateful for yesterday?',
    });
  }

  // 3. Mark the last item as isLast
  if (updatedLogs.length > 0) {
    const lastIndex = updatedLogs.length - 1;
    // Clone the last item to avoid mutating the original object from the hook
    updatedLogs[lastIndex] = { ...updatedLogs[lastIndex], isLast: true };
  }

  if (isLoading) return <ActivityIndicator size="large" className="mt-20" />;

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-center text-red-600 mb-2">Failed to load entries</Text>
        <Text className="text-center text-gray-500">
          {error?.message || 'Unknown error'}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background w-full">
      <FlatList
        data={updatedLogs}
        keyExtractor={(item) => item.entryDate}
        renderItem={({ item }) => (
          <TimelineItem item={item} onPress={() => onEntryPress(item)} />
        )}
        contentContainerClassName="pb-4"
      />
    </View>
  );
};
