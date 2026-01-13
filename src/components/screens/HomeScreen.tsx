import { useState } from 'react';
import { format } from 'date-fns';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { IGratitudeDBLog } from '~/types';
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

  const handleEntryPress = (item: IGratitudeDBLog) => {
    router.push({
      pathname: '/gratitudeEntry',
      params: {
        entryDate: item.entryDate,
        entryContent: item.entryContent,
      },
    });
  };

  return (
    <View className="flex-1 bg-primary items-center justify-center pt-safe">
      <Header
        isSearchMode={isSearchMode}
        onSearchPress={handleSearchPress}
        onBackPress={handleBackPress}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 w-full"
        keyboardVerticalOffset={0}>
        {isSearchMode ? (
          <SearchResults searchQuery={searchQuery} onEntryPress={handleEntryPress} />
        ) : (
          <>
            <GratitudeTimeline onEntryPress={handleEntryPress} />
            <GratitudeDatepicker onDateSelect={handleGratitudeDatepickerPress} />
          </>
        )}
      </KeyboardAvoidingView>
      <StatusBar style="auto" />
    </View>
  );
}
