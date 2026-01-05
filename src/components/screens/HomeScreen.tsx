import { useState } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Header } from '~/components/Header';
import { SearchResults } from '~/components/SearchResults';
import { GratitudeTimeline } from '~/components/GratitudeTimeline';
import { GratitudeDatepicker } from '~/components/GratitudeDatepicker';

export default function HomeScreen() {
  const router = useRouter();
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleGratitudeDatepickerPress = (date: Date) => {
    router.push({
      pathname: '/gratitudeEntry',
      params: {
        entryDate: format(date, 'yyyy-MM-dd'),
      },
    });
  };

  const handleSearchPress = () => {
    setIsSearchMode(true);
    setSearchQuery('');
  };

  const handleBackPress = () => {
    setIsSearchMode(false);
    setSearchQuery('');
  };

  const handleEntryPress = (item: { entryDate: string; entryContent: string }) => {
    router.push({
      pathname: '/gratitudeEntry',
      params: {
        entryDate: item.entryDate,
        entryContent: item.entryContent,
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-primary items-center justify-center">
      <Header
        isSearchMode={isSearchMode}
        onSearchPress={handleSearchPress}
        onBackPress={handleBackPress}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      {isSearchMode ? (
        <SearchResults searchQuery={searchQuery} onEntryPress={handleEntryPress} />
      ) : (
        <>
          <GratitudeTimeline onEntryPress={handleEntryPress} />
          <GratitudeDatepicker onDateSelect={handleGratitudeDatepickerPress} />
        </>
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
