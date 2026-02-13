import React from 'react';
import { View, Pressable } from 'react-native';
import { format } from 'date-fns';
import { MOOD_EMOJI, MONTH_SHORT_KEYS } from '~/constants';
import { type Entry } from '~/types';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { useTagMapping } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';

// ============================================================================
// Types
// ============================================================================
interface ISearchResultItemProps {
  item: Entry;
  onPress: () => void;
}

// ============================================================================
// Component
// ============================================================================
export const SearchResultItem: React.FC<ISearchResultItemProps> = ({ item, onPress }) => {
  const { t } = useTranslation();
  const dateObj = new Date(item.created_at);
  const day = dateObj.getDate();
  const month = t(MONTH_SHORT_KEYS[dateObj.getMonth()]);
  const year = dateObj.getFullYear();
  const time = format(dateObj, 'HH:mm');

  const tagMap = useTagMapping();
  const tags = (item.tags ? item.tags.split(',') : [])
    .filter((id) => id.trim().length > 0)
    .map((id) => tagMap.get(id))
    .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Pressable
      onPress={onPress}
      className="flex-row w-full px-safe-or-3 py-3 border-b border-border active:bg-muted">
      {/* Column 1: Date */}
      <View className="items-center justify-center pr-2 mr-3 border-r-2 border-border">
        <Text className="text-sm font-semibold text-foreground">{month}</Text>
        <Text className="text-xl font-semibold text-foreground">{day}</Text>
        <Text className="text-xs font-semibold text-foreground">{year}</Text>
      </View>

      {/* Column 2: Content */}
      <View className="flex-1 justify-center">
        {/* Time + Mood + Tags */}
        <View className="flex-row flex-wrap items-center gap-2 mb-2">
          <Text
            className={cn(
              'self-start font-black tracking-wider text-foreground/70',
              'py-0.5 px-3 pr-2 bg-muted border border-border rounded-full',
            )}>
            {time}{' '}
            {item.mood && <Text className="text-base">{MOOD_EMOJI[item.mood]}</Text>}
          </Text>

          {/* Tags */}
          {tags.length > 0 &&
            tags.map((tag) => (
              <View key={tag.tag_id}>
                <Text className="text-sm text-foreground/70 font-medium">
                  #{tag.title}
                </Text>
              </View>
            ))}
        </View>

        {/* Title */}
        {item.text_title && (
          <Text
            className="text-base font-semibold text-foreground flex-1 mb-1"
            numberOfLines={1}>
            {item.text_title}
          </Text>
        )}

        {/* Content */}
        {item.text_content && (
          <Text className="text-base text-foreground leading-5" numberOfLines={2}>
            {item.text_content}
          </Text>
        )}
      </View>
    </Pressable>
  );
};
