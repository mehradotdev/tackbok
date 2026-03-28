import React from 'react';
import { View, ScrollView } from 'react-native';
import { Search, ArrowLeft, ArrowRight } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { useTags } from '~/hooks/useGratitude';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { SettingsBottomSheet } from '~/components/SettingsBottomSheet';

interface IHeaderProps {
  isSearchMode?: boolean;
  onSearchPress: () => void;
  onBackPress: () => void;
  searchQuery?: string;
  onSearchQueryChange: (text: string) => void;
  selectedTagIds?: string[];
  onTagsChange?: (tagIds: string[]) => void;
}

export const Header: React.FC<IHeaderProps> = ({
  isSearchMode = false,
  onSearchPress,
  onBackPress,
  searchQuery = '',
  onSearchQueryChange,
  selectedTagIds = [],
  onTagsChange,
}) => {
  const { t, isRTL } = useTranslation();
  const { data: allTags } = useTags();
  const safeTags = allTags || [];
  const showTagFilter = isSearchMode && safeTags.length > 0;

  if (isSearchMode) {
    return (
      <View className="w-full bg-primary">
        {/* Search Input Row */}
        <View className="flex-row w-full items-center justify-between px-safe-or-4 py-2">
          {/* Back Button */}
          <Button className="p-1" onPress={onBackPress} variant="ghost">
            <Icon
              as={isRTL ? ArrowRight : ArrowLeft}
              className="text-primary-foreground"
            />
          </Button>

          {/* Search Input */}
          <View className="flex-1 mx-3">
            <Input
              className="bg-background rounded-lg px-3 py-2 text-foreground"
              placeholder={t('Search gratitude logs...')}
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              autoFocus
              returnKeyType="search"
            />
          </View>

          {/* Search Icon (decorative) */}
          <View className="p-1">
            <Icon as={Search} className="text-primary-foreground" />
          </View>
        </View>

        {/* Tag Filter using ToggleGroup */}
        {showTagFilter && (
          <View className="pb-2 px-safe-or-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2">
              <ToggleGroup
                type="multiple"
                layout="pills"
                variant="outline"
                size="xs"
                value={selectedTagIds}
                onValueChange={(value) => onTagsChange?.(value)}>
                {safeTags.map((tag) => (
                  <ToggleGroupItem
                    key={tag.tag_id}
                    value={tag.tag_id}
                    className={cn(
                      'border',
                      selectedTagIds.includes(tag.tag_id)
                        ? 'bg-primary-foreground border-primary-foreground'
                        : 'bg-primary/20 border-primary-foreground/30',
                    )}>
                    <Text
                      className={cn(
                        'text-sm font-body-medium',
                        selectedTagIds.includes(tag.tag_id)
                          ? 'text-primary'
                          : 'text-primary-foreground',
                      )}>
                      #{tag.title}
                    </Text>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="flex-row w-full items-center justify-between px-safe-or-4 py-2 bg-primary">
      {/* Search Button */}
      <Button className="p-1" onPress={onSearchPress} variant="ghost">
        <Icon as={Search} className="text-primary-foreground" />
      </Button>

      <Text variant="h2" className="text-primary-foreground font-heading">
        {t('Tackbok')}
      </Text>

      <SettingsBottomSheet />
    </View>
  );
};
