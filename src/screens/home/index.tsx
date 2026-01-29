import { useState, useCallback } from 'react';
import { View, KeyboardAvoidingView } from 'react-native';
import { startOfDay } from 'date-fns';
import { useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { type Entry } from '~/types';
import { getEntriesForDate } from '~/db/queries';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { GratitudeDatepickerModal } from '~/components/GratitudeDatepickerModal';
import { Icon } from '~/components/ui/icon';
import { Header } from './Header';
import { SearchResults } from './SearchResults';
import { GratitudeTimeline } from './GratitudeTimeline';

export default function HomeScreen() {
  const router = useRouter();
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const handleGratitudeDatepickerPress = useCallback(
    async (date: Date) => {
      const dateStart = startOfDay(date);
      const dateMs = dateStart.getTime();

      // Check if entries exist for this date
      const entries = await getEntriesForDate(dateMs);

      if (entries.length > 0) {
        // Has entries - go to date entries page
        router.push({
          pathname: '/dateEntries',
          params: { dateMs: dateMs.toString() },
        });
      } else {
        // No entries - go directly to new entry with current time
        const now = new Date();
        const entryDate = new Date(dateStart);
        // Combine selected date with current time of day.
        // We do this to avoid entries defaulting to midnight (00:00:00) when backdating,
        // ensuring the entry captures "when" it was written on that specific day.
        entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

        router.push({
          pathname: '/gratitudeEntry',
          params: { dateMs: entryDate.getTime().toString() },
        });
      }
    },
    [router],
  );

  const handleSearchPress = () => {
    setIsSearchMode(true);
    setSearchQuery('');
    setSelectedTagIds([]);
  };

  const handleBackPress = () => {
    setIsSearchMode(false);
    setSearchQuery('');
    setSelectedTagIds([]);
  };

  const handleEntryPress = (entry: Entry) => {
    router.push({
      pathname: '/gratitudeEntry',
      params: {
        noteId: entry.note_id,
        dateMs: entry.created_at.toString(),
      },
    });
  };

  const handleAddEntry = useCallback(
    (dateMs: number) => {
      const now = new Date();
      const entryDate = new Date(dateMs);
      // Combine selected date with current time of day.
      // We do this to avoid entries defaulting to midnight (00:00:00) when backdating,
      // ensuring the entry captures "when" it was written on that specific day.
      entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      router.push({
        pathname: '/gratitudeEntry',
        params: { dateMs: entryDate.getTime().toString() },
      });
    },
    [router],
  );

  return (
    <View className="flex-1 bg-primary items-center justify-center pt-safe">
      <Header
        isSearchMode={isSearchMode}
        onSearchPress={handleSearchPress}
        onBackPress={handleBackPress}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedTagIds={selectedTagIds}
        onTagsChange={setSelectedTagIds}
      />

      {isSearchMode ? (
        <KeyboardAvoidingView
          keyboardVerticalOffset={0}
          behavior="padding"
          className="flex-1 w-full">
          <SearchResults
            searchQuery={searchQuery}
            selectedTagIds={selectedTagIds}
            onEntryPress={handleEntryPress}
          />
        </KeyboardAvoidingView>
      ) : (
        <>
          <GratitudeTimeline
            onEntryPress={handleEntryPress}
            onAddEntry={handleAddEntry}
          />
          <GratitudeDatepickerModal onDateSelect={handleGratitudeDatepickerPress}>
            {/* FAB (Floating Action Button) - positioned independently */}
            <Button
              size="icon"
              variant="primary"
              className={cn(
                'absolute bottom-safe-or-12 right-safe-or-6 z-50',
                'h-14 w-14 items-center justify-center rounded-full',
                'shadow-lg shadow-black/25',
                'active:bg-primary/90 active:scale-125',
              )}>
              <Icon as={Calendar} className="text-primary-foreground" />
            </Button>
          </GratitudeDatepickerModal>
        </>
      )}
    </View>
  );
}
