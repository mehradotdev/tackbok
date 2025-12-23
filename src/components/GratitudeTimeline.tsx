import React from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { TimelineItem } from './GratitudeTimelineItem';
import { useGratitudeLogs } from '~/hooks/useGratitude';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GratitudeLog } from '~/types';

interface GratitudeTimelineProps {
  onEntryPress: (entry: GratitudeLog) => void;
  onNewPress: () => void;
}

export const GratitudeTimeline: React.FC<GratitudeTimelineProps> = ({
  onEntryPress,
  onNewPress,
}) => {
  const { data: logs, isLoading, isError, error } = useGratitudeLogs();

  if (isLoading) return <ActivityIndicator size="large" className="mt-20" />;
  if (isError) {
    // TODO: remove hardcoded styles, make it dynamic
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
    <View className="flex-1 bg-[#EBE5da] w-full">
      <SafeAreaView className="flex-1">
        <View className="pt-4 pb-4 px-4 flex-row justify-between items-center">
          <View className="w-10" />
          <Text className="text-2xl font-bold text-foreground font-serif">Presently</Text>
          <TouchableOpacity onPress={onNewPress}>
            <Text className="text-lg font-bold text-foreground">+</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={logs}
          keyExtractor={(item) => item.entryDate}
          renderItem={({ item }) => (
            <TimelineItem item={item} onPress={() => onEntryPress(item)} />
          )}
          contentContainerClassName="pb-20 pt-4"
          ListEmptyComponent={
            <Text className="text-center text-gray-500 mt-10 italic">
              No entries yet. Tap + to start.
            </Text>
          }
        />
      </SafeAreaView>
    </View>
  );
};
