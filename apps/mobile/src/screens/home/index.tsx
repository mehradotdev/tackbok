import { useState, useCallback } from 'react';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { startOfDay } from 'date-fns';
import { useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { type Entry } from '~/types';
import { getEntriesForDay } from '~/db/queries';
import { combineDateWithCurrentTime } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Button } from '~/components/ui/button';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { GratitudeDatepickerModal } from '~/components/GratitudeDatepickerModal';
import { Icon } from '~/components/ui/icon';
import { toast } from '~/components/ui/toast';
import { Header } from './Header';
import { SearchResults } from './SearchResults';
import { GratitudeTimeline } from './GratitudeTimeline';

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  return (
    <SafeAreaView
      className="flex-1 bg-primary items-center justify-center"
      edges={['top', 'left', 'right']}>
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
          {/* FAB (Floating Action Button) - positioned independently */}
          <Button
            size="icon"
            variant="primary"
            onPress={() => setShowDatePicker(true)}
            className={cn(
              'absolute bottom-safe-or-12 right-safe-or-6 z-10',
              'h-14 w-14 items-center justify-center rounded-full',
              'shadow-lg shadow-black/25',
              'active:bg-primary/90 active:scale-125',
            )}>
            <Icon as={Calendar} className="text-primary-foreground" />
          </Button>

          <GratitudeDatepickerModal
            visible={showDatePicker}
            onClose={() => setShowDatePicker(false)}
            onDateSelect={handleGratitudeDatepickerPress}
          />
        </>
      )}
    </SafeAreaView>
  );
}
