import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { type Entry } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { track } from '~/lib/analytics';
import { useSearchEntries } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { SearchResultItem } from './SearchResultItem';

interface ISearchResultsProps {
  searchQuery: string;
  selectedTagIds: string[];
  onEntryPress: (entry: Entry) => void;
}

export const SearchResults: React.FC<ISearchResultsProps> = ({
  searchQuery,
  selectedTagIds,
  onEntryPress,
}) => {
  const { t } = useTranslation();
  const {
    data: results = [],
    error,
    isLoading,
  } = useSearchEntries(searchQuery, selectedTagIds);

  // One search_used per search session (mount), not per keystroke.
  const hasTrackedSearch = React.useRef(false);
  React.useEffect(() => {
    if (!hasTrackedSearch.current && (searchQuery.trim() || selectedTagIds.length > 0)) {
      hasTrackedSearch.current = true;
      track('search_used');
    }
  }, [searchQuery, selectedTagIds]);

  // Show prompt to search when no query and no tags selected
  if (!searchQuery.trim() && selectedTagIds.length === 0) {
    return (
      <View className="flex-1 bg-background w-full items-center justify-center px-4">
        <Text className="text-muted-foreground text-center">
          {t('Start typing to search your gratitude logs')}
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background w-full items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background w-full items-center justify-center px-4">
        <Text className="text-center text-red-600 mb-2">{t('Search failed')}</Text>
        <Text className="text-center text-muted-foreground">
          {error?.message || t('Unknown error')}
        </Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View className="flex-1 bg-background w-full items-center justify-center px-4">
        <Text className="text-muted-foreground text-center">{t('No results')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background w-full">
      <LegendList
        recycleItems={true}
        data={results}
        estimatedItemSize={100}
        keyExtractor={(item) => item.note_id}
        renderItem={({ item }) => (
          <SearchResultItem item={item} onPress={() => onEntryPress(item)} />
        )}
        contentContainerClassName="pb-safe-or-4"
      />
    </View>
  );
};
