import React from 'react';
import { View, FlatList, ActivityIndicator } from 'react-native';
import { IGratitudeDBLog } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { useSearchGratitudeLogs } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { SearchResultItem } from './SearchResultItem';

interface ISearchResultsProps {
  searchQuery: string;
  onEntryPress: (entry: IGratitudeDBLog) => void;
}

export const SearchResults: React.FC<ISearchResultsProps> = ({
  searchQuery,
  onEntryPress,
}) => {
  const { t } = useTranslation();
  const {
    data: results,
    isLoading,
    isError,
    error,
  } = useSearchGratitudeLogs(searchQuery);
  const safeResults = results || [];

  // Show prompt to search when no query
  if (!searchQuery.trim()) {
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

  if (isError) {
    return (
      <View className="flex-1 bg-background w-full items-center justify-center px-4">
        <Text className="text-center text-red-600 mb-2">{t('Search failed')}</Text>
        <Text className="text-center text-muted-foreground">
          {error?.message || t('Unknown error')}
        </Text>
      </View>
    );
  }

  if (safeResults.length === 0) {
    return (
      <View className="flex-1 bg-background w-full items-center justify-center px-4">
        <Text className="text-muted-foreground text-center">{t('No results')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background w-full">
      <FlatList
        data={safeResults}
        keyExtractor={(item) => item.entryDate}
        renderItem={({ item }) => (
          <SearchResultItem item={item} onPress={() => onEntryPress(item)} />
        )}
        contentContainerClassName="pb-4"
      />
    </View>
  );
};
