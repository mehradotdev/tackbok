import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { useUniwind } from 'uniwind';
import { format } from 'date-fns';
import { IGratitudeLogItem } from '~/types';
import { cn } from '~/lib/utils';
import { Text } from '~/components/ui/text';

interface ITimelineItemProps {
  item: IGratitudeLogItem;
  onPress: () => void;
}

export const TimelineItem: React.FC<ITimelineItemProps> = ({ item, onPress }) => {
  const { theme } = useUniwind();
  const dateObj = new Date(item.entryDate);
  const formattedDate = format(dateObj, 'MMMM d, yyyy');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <Pressable onPress={onPress} className="flex-row w-full active:bg-muted">
      {/* --- Left Column: Timeline --- */}
      <View className="w-14 items-center">
        {/* Continuous Line */}
        <View
          className={cn(
            'w-[2px] bg-foreground absolute top-0 bottom-3',
            item.isLast ? 'bottom-4' : 'bottom-0',
          )}
        />

        {/* The Dot: z-10 puts it above the line */}
        <View
          className={cn(
            'w-[14px] h-[14px] rounded-full border-2 border-foreground z-10 mt-6',
            item.entryDate === todayStr ? 'bg-foreground' : 'bg-background',
          )}
        />
        {item.isLast && (
          <View className="w-[14px] h-[14px] rounded-full bg-foreground border-2 border-foreground z-10 absolute bottom-4" />
        )}
      </View>

      {/* --- Right Column: Content --- */}
      <View className="flex-1 py-4 pr-4">
        <Text className="text-lg font-bold text-foreground/80 mb-1 font-serif">
          {formattedDate}
        </Text>
        {item.entryContent ? (
          <Text className="text-base text-foreground leading-6" numberOfLines={4}>
            {item.entryContent}
          </Text>
        ) : (
          <Text className="text-base text-muted-foreground leading-6">
            {item?.placeholderText || 'What are you grateful for?'}
          </Text>
        )}
        {item.isLast && (
          <View className="items-center">
            {theme === 'dark' ? (
              <Image
                source={require('~/../assets/images/logo_transparent_dark.png')}
                className="w-28 h-28 opacity-80"
              />
            ) : (
              <Image
                source={require('~/../assets/images/logo_transparent_light.png')}
                className="w-28 h-28 opacity-80"
              />
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
};
