import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { IGratitudeLogItem } from '~/types';
import { Text } from '~/components/ui/text';
import { format } from 'date-fns';

interface ITimelineItemProps {
  item: IGratitudeLogItem;
  onPress: () => void;
}

export const TimelineItem: React.FC<ITimelineItemProps> = ({ item, onPress }) => {
  const dateObj = new Date(item.entryDate);
  const formattedDate = format(dateObj, 'MMMM d, yyyy');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <Pressable onPress={onPress} className="flex-row w-full">
      {/* --- Left Column: Timeline --- */}
      <View className="w-14 items-center">
        {/* Continuous Line */}
        <View className="w-[2px] bg-foreground absolute top-0 bottom-0" />

        {/* The Dot: z-10 puts it above the line */}
        <View
          className={`w-[14px] h-[14px] rounded-full border-2 border-foreground z-10 mt-6 ${
            item.entryDate === todayStr ? 'bg-foreground' : 'bg-background'
          }`}
        />
        {item.isLast && (
          <View className="w-[14px] h-[14px] rounded-full bg-foreground border-2 border-foreground z-10 absolute bottom-0" />
        )}
      </View>

      {/* --- Right Column: Content --- */}
      <View className="flex-1 py-4 pr-4">
        <Text className="text-lg font-bold text-[#333] mb-1 font-serif">
          {formattedDate}
        </Text>
        {item.entryContent ? (
          <Text className="text-base text-[#555] leading-6" numberOfLines={3}>
            {item.entryContent}
          </Text>
        ) : (
          <Text className="text-base text-[#555] leading-6">
            {item?.placeholderText || 'What are you grateful for?'}
          </Text>
        )}
        {item.isLast && (
          <View className="items-center">
            <Image
              source={require('~/../assets/images/icon_transparent.png')}
              className="w-28 h-28 opacity-80"
            />
          </View>
        )}
      </View>
    </Pressable>
  );
};
