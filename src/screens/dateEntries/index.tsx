import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { format, startOfDay } from 'date-fns';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react-native';
import { MOOD_OPTIONS } from '~/constants';
import { type Entry } from '~/types';
import { cn, combineDateWithCurrentTime } from '~/lib/utils';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { useEntriesForDay, useTagMapping } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Badge } from '~/components/ui/badge';

interface IDateEntriesScreenProps {
  dateMs: number;
}

interface IEntryItemProps {
  entry: Entry;
  onPress: () => void;
  tagMap: ReturnType<typeof useTagMapping>;
}

function EntryItem({ entry, onPress, tagMap }: IEntryItemProps) {
  const { t } = useTranslation();
  const time = format(new Date(entry.created_at), 'HH:mm');

  const moodOption = entry.mood ? MOOD_OPTIONS.find((o) => o.value === entry.mood) : null;

  const tags = (entry.tags ? entry.tags.split(',') : [])
    .filter((id) => id.trim().length > 0)
    .map((id) => tagMap.get(id.trim())) // Trim whitespace from tag IDs if present
    .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Pressable
      onPress={onPress}
      className="flex-row w-full px-safe-or-3 py-3 border-b border-border active:bg-muted">
      <View className="flex-1 justify-center">
        {/* Row 1: Time + Mood */}
        <View className="flex-row flex-wrap items-center gap-2 mb-2">
          {/* Time Badge - Preserving "Current" style but removing mood */}
          <Text
            className={cn(
              'self-start font-black tracking-wider text-foreground/70',
              'py-1 px-3 bg-muted border border-border rounded-full',
            )}>
            {time}
          </Text>

          {/* Mood Badge - New Style from GratitudeEntryEdit */}
          {moodOption && (
            <View className="relative flex-row items-center px-3 py-0.5 gap-1.5 bg-primary/50 rounded-full border border-border">
              <Text className="text-xl">{moodOption.emoji}</Text>
              <Text className="text-sm tracking-wide font-medium text-primary-foreground">
                {t(`Feeling ${moodOption.label}`)}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        {entry.text_title && (
          <Text className="text-lg font-semibold text-foreground mb-1" numberOfLines={1}>
            {entry.text_title}
          </Text>
        )}

        {/* Content */}
        {entry.text_content && (
          <Text className="text-base text-foreground leading-6" numberOfLines={3}>
            {entry.text_content}
          </Text>
        )}

        {/* Tags - Last Row */}
        {tags.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mt-8">
            {tags.map((tag) => (
              <Badge
                key={tag.tag_id}
                variant="secondary"
                className="px-2 py-1 rounded-md">
                <Text className="text-sm text-foreground/70 font-bold">#{tag.title}</Text>
              </Badge>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function DateEntriesScreen({ dateMs }: IDateEntriesScreenProps) {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const tagMap = useTagMapping();

  // Get date string for display
  const dateStart = startOfDay(new Date(dateMs));
  const dateStr = format(dateStart, 'yyyy-MM-dd');
  const formattedDate = formatLocalizedDate(dateStr, t);

  // Load entries for this date
  const { data, isLoading } = useEntriesForDay(dateStart.getTime());

  const entries = data || [];

  const handleEntryPress = (entry: Entry) => {
    router.push({
      pathname: '/gratitudeEntry/[noteId]',
      params: { noteId: entry.note_id },
    });
  };

  const handleNewEntry = () => {
    const entryDate = combineDateWithCurrentTime(dateStart);
    router.push({
      pathname: '/gratitudeEntry',
      params: { dateMs: entryDate.getTime().toString() },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
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
            <EntryItem
              entry={item}
              onPress={() => handleEntryPress(item)}
              tagMap={tagMap}
            />
          )}
          contentContainerClassName="pb-safe-or-4"
        />
      )}
    </SafeAreaView>
  );
}
