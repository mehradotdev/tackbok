import React from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { TimelineItem } from './GratitudeTimelineItem';
import { useGratitudeLogs } from '~/hooks/useGratitude';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GratitudeLog } from '~/types';

// const DATA = [
//   {
//     id: '1',
//     date: 'February 16, 2019',
//     text: 'What are you grateful for today?',
//     filled: true,
//   },
//   {
//     id: '2',
//     date: 'February 15, 2019',
//     text: 'Sesame seeds and sushi rice',
//     filled: false,
//   },
//   {
//     id: '3',
//     date: 'February 14, 2019',
//     text: 'Puppy kisses and getting to see Lily again. This text is longer to show how the line stretches automatically!',
//     filled: false,
//   },
// ];

// export function TimelineScreenz() {
//   return (
//     // Ensure the main container is flex-1 and full width
//     <View className="flex-1 bg-[#EBE5da] pt-14 w-full">
//       <Text className="text-2xl font-bold text-center mb-5 text-black font-serif">
//         Presently
//       </Text>

//       <FlatList
//         data={DATA}
//         keyExtractor={(item) => item.id}
//         renderItem={({ item }) => <TimelineItemz item={item} />}
//         // contentContainerStyle needs to be passed via props or standard style object in some versions of NativeWind,
//         // but className usually works for the outer wrapper.
//         contentContainerClassName="pb-12"
//       />
//     </View>
//   );
// }

interface GratitudeTimelineProps {
  onEntryPress: (entry: GratitudeLog) => void;
  onNewPress: () => void;
}

export const GratitudeTimeline: React.FC<GratitudeTimelineProps> = ({ onEntryPress, onNewPress }) => {
  const { data: logs, isLoading } = useGratitudeLogs();

  if (isLoading) return <ActivityIndicator size="large" className="mt-20" />;

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
