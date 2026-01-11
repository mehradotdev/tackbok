import React from 'react';
import { View, Pressable } from 'react-native';
import { IGratitudeDBLog } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { MONTH_ABBREVIATED_KEYS } from '~/lib/i18n/dateFormatting';
import { Text } from '~/components/ui/text';

interface ISearchResultItemProps {
  item: IGratitudeDBLog;
  onPress: () => void;
}

export const SearchResultItem: React.FC<ISearchResultItemProps> = ({ item, onPress }) => {
  const { t } = useTranslation();
  const dateObj = new Date(item.entryDate);
  const day = dateObj.getDate();
  const month = t(MONTH_ABBREVIATED_KEYS[dateObj.getMonth()]); // Translate month abbreviation
  const year = dateObj.getFullYear();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row w-full px-safe-or-4 py-3 border-b border-border active:bg-muted">
      {/* Column 1: Date */}
      <View className="w-16 items-center justify-center mr-3">
        <Text className="text-sm font-semibold text-foreground">{month}</Text>
        <Text className="text-xl font-semibold text-foreground">{day}</Text>
        <Text className="text-xs font-semibold text-muted-foreground">{year}</Text>
      </View>

      {/* Column 2: Gratitude Content */}
      <View className="flex-1 justify-center">
        <Text className="text-base text-foreground leading-5">{item.entryContent}</Text>
      </View>
    </Pressable>
  );
};
