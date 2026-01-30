import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { format, startOfDay } from 'date-fns';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react-native';
import { MOOD_EMOJI } from '~/constants';
import { type Entry } from '~/types';
import { cn } from '~/lib/utils';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { useEntriesForDate, useTagMapping } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { SafeAreaView } from '~/components/ui/safe-area-view';

interface IDateEntriesScreenProps {
  dateMs: number;
}

interface IEntryItemProps {
  entry: Entry;
  onPress: () => void;
}

function EntryItem({ entry, onPress }: IEntryItemProps) {
  const time = format(new Date(entry.created_at), 'HH:mm');
  const tagMap = useTagMapping();

  const tags = (entry.tags ? entry.tags.split(',') : [])
    .filter((id) => id.trim().length > 0)
    .map((id) => tagMap.get(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Pressable
      onPress={onPress}
      className="flex-row w-full px-safe-or-3 py-3 border-b border-border active:bg-muted">
      {/* Content Column */}
      <View className="flex-1 justify-center">
        {/* Time + Mood + Tags */}
        <View className="flex-row flex-wrap items-center gap-2 mb-2">
          <Text
            className={cn(
              'self-start font-black tracking-wider text-foreground/70',
              'py-0.5 px-3 pr-2 bg-muted border border-border rounded-full',
            )}>
            {time}{' '}
            {entry.mood && <Text className="text-base">{MOOD_EMOJI[entry.mood]}</Text>}
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
        {entry.text_title && (
          <Text
            className="text-base font-semibold text-foreground flex-1 mb-1"
            numberOfLines={1}>
            {entry.text_title}
          </Text>
        )}

        {/* Content */}
        {entry.text_content && (
          <Text className="text-base text-foreground leading-5" numberOfLines={2}>
            {entry.text_content}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function DateEntriesScreen({ dateMs }: IDateEntriesScreenProps) {
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  // Get date string for display
  const dateStart = startOfDay(new Date(dateMs));
  const dateStr = format(dateStart, 'yyyy-MM-dd');
  const formattedDate = formatLocalizedDate(dateStr, t);

  // Load entries for this date
  const { data, isLoading } = useEntriesForDate(dateStart.getTime());

  const entries = data || [];

  const handleEntryPress = (entry: Entry) => {
    router.push({
      pathname: '/gratitudeEntry',
      params: {
        noteId: entry.note_id,
        dateMs: entry.created_at.toString(),
      },
    });
  };

  const handleNewEntry = () => {
    // Navigate to new entry with this date and current time
    const now = new Date();
    const entryDate = new Date(dateStart);
    entryDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    router.push({
      pathname: '/gratitudeEntry',
      params: {
        dateMs: entryDate.getTime().toString(),
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <Button onPress={() => router.back()} variant="ghost" className="p-1">
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>

        <Text variant="h2" className="text-foreground">
          {formattedDate}
        </Text>

        <Button onPress={handleNewEntry} variant="ghost" className="p-1">
          <Icon as={Plus} className="text-foreground" />
        </Button>
      </View>

      {/* Entries list */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">{t('Loading...')}</Text>
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-muted-foreground text-center mb-4">
            {t('No entries for this date')}
          </Text>
          <Button onPress={handleNewEntry}>
            <Text>{t('Create Entry')}</Text>
          </Button>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.note_id}
          renderItem={({ item }) => (
            <EntryItem entry={item} onPress={() => handleEntryPress(item)} />
          )}
          contentContainerClassName="pb-4"
        />
      )}
    </SafeAreaView>
  );
}
