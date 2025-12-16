import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { GratitudeLog } from '~/types';

interface TimelineItemProps {
  item: GratitudeLog;
  onPress: () => void;
}

export const TimelineItem: React.FC<TimelineItemProps> = ({ item, onPress }) => {
  // Convert YYYY-MM-DD to a pretty format
  const dateObj = new Date(item.entryDate);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} className="flex-row w-full">
      {/* --- Left Column: Timeline --- */}
      <View className="w-[60px] items-center">
        {/* Continuous Line */}
        <View className="w-[2px] bg-foreground absolute top-0 bottom-0" />

        {/* Dot */}
        <View className="w-[14px] h-[14px] rounded-full bg-foreground border-2 border-foreground z-10 mt-6" />
      </View>

      {/* --- Right Column: Content --- */}
      <View className="flex-1 pb-8 pr-5">
        <Text className="text-lg font-bold text-[#333] mb-1 font-serif">
          {formattedDate}
        </Text>
        <Text className="text-base text-[#555] leading-6" numberOfLines={3}>
          {item.entryContent}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// export const TimelineItemz = ({ item }: { item: any }) => {
//   return (
//     // ADDED: w-full to ensure the row takes full width
//     <View className="flex-row w-full">
//       {/* --- Left Column: Timeline --- */}
//       {/* w-[60px] fixes the width of the timeline track */}
//       <View className="w-[60px] items-center">
//         {/* The Line: absolute positioning makes it stretch top-to-bottom */}
//         <View className="w-[2px] bg-[#333] absolute top-0 bottom-0" />

//         {/* The Dot: z-10 puts it above the line */}
//         <View
//           className={`w-[14px] h-[14px] rounded-full border-2 border-[#333] z-10 mt-6 ${
//             item.filled ? 'bg-[#333]' : 'bg-[#EBE5da]'
//           }`}
//         />
//       </View>

//       {/* --- Right Column: Content --- */}
//       {/* flex-1 allows this column to take ALL remaining width */}
//       <View className="flex-1 pb-8 pr-5">
//         <Text className="text-lg font-bold text-[#333] mb-1 font-serif">{item.date}</Text>
//         <Text className="text-base text-[#555] leading-6">{item.text}</Text>
//       </View>
//     </View>
//   );
// };
