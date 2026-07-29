import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { startOfDay } from 'date-fns';
import { useRouter } from 'expo-router';
import { type Entry } from '~/types';
import { getEntriesForDay, getRandomEntryId } from '~/db/queries';
import { combineDateWithCurrentTime } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { useGratitudeActionDockScrollBehavior } from '~/hooks/useGratitudeActionDockScrollBehavior';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { GratitudeDatepickerModal } from '~/components/GratitudeDatepickerModal';
import { toast } from '~/components/ui/toast';
import { Header } from './Header';
import { SearchResults } from './SearchResults';
import { GratitudeTimeline } from './GratitudeTimeline';
import { GratitudeActionDock } from './GratitudeActionDock';
import { HomeCoachMarks } from './HomeCoachMarks';

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const {
    isExpanded: isActionDockExpanded,
    onToggle: handleActionDockToggle,
    onScroll: handleTimelineScroll,
    onScrollBeginDrag: handleTimelineScrollBeginDrag,
  } = useGratitudeActionDockScrollBehavior();

  const handleGratitudeDatepickerPress = useCallback(
    async (date: Date) => {
      const dateStart = startOfDay(date);
      const dateMs = dateStart.getTime();

      const navigateToNewEntry = () => {
        const entryDate = combineDateWithCurrentTime(dateStart);
        router.push({
          pathname: '/gratitudeEntry',
          params: { dateMs: entryDate.getTime().toString() },
        });
      };

      try {
        // Check if entries exist for this date
        const entries = await getEntriesForDay(dateMs);

        if (entries.length > 0) {
          // Has entries - go to date entries page
          router.push({
            pathname: '/dateEntries/[dateMs]',
            params: { dateMs: dateMs.toString() },
          });
        } else {
          // No entries - go directly to new entry
          navigateToNewEntry();
        }
      } catch (error) {
        console.error('Failed to fetch entries for date:', error);
        toast.error(t('Something went wrong. Creating new entry.'));
        // Fallback: navigate to new entry anyway so user isn't blocked
        navigateToNewEntry();
      }
    },
    [router, t],
  );

  const handleRandomEntryPress = useCallback(async () => {
    try {
      const noteId = await getRandomEntryId();
      if (noteId) {
        router.push({
          pathname: '/gratitudeEntry/[noteId]',
          params: { noteId },
        });
      }
    } catch (error) {
      console.error('Failed to open a random entry:', error);
      toast.error(t('Unknown error'));
    }
  }, [router, t]);

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
      pathname: '/gratitudeEntry/[noteId]',
      params: { noteId: entry.note_id },
    });
  };

  const handleAddEntry = useCallback(
    (dateMs: number) => {
      const entryDate = combineDateWithCurrentTime(new Date(dateMs));
      router.push({
        pathname: '/gratitudeEntry',
        params: { dateMs: entryDate.getTime().toString() },
      });
    },
    [router],
  );

  /** Add a new entry for today */
  const handleAddTodayEntry = useCallback(() => {
    const now = new Date();
    router.push({
      pathname: '/gratitudeEntry',
      params: { dateMs: now.getTime().toString() },
    });
  }, [router]);

  return (
    <SafeAreaView className="flex-1 w-full bg-primary" edges={['top', 'left', 'right']}>
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
        <View className="relative flex-1 w-full">
          <GratitudeTimeline
            onEntryPress={handleEntryPress}
            onAddEntry={handleAddEntry}
            onScroll={handleTimelineScroll}
            onScrollBeginDrag={handleTimelineScrollBeginDrag}
          />

          <GratitudeActionDock
            isExpanded={isActionDockExpanded}
            onToggle={handleActionDockToggle}
            onAddEntry={handleAddTodayEntry}
            onPickDate={() => setShowDatePicker(true)}
          />

          <GratitudeDatepickerModal
            visible={showDatePicker}
            onClose={() => setShowDatePicker(false)}
            onDateSelect={handleGratitudeDatepickerPress}
            onRandomSelect={handleRandomEntryPress}
          />
        </View>
      )}

      {!isSearchMode && <HomeCoachMarks />}
    </SafeAreaView>
  );
}
