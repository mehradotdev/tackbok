import { View } from 'react-native';
import { DAY_KEYS, MOODS, MOOD_EMOJI } from '~/constants';
import { formatLocalizedNumber, useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { InsightsStats } from '~/lib/insights';
import { MOOD_COLORS } from './shared';

/** Emoji bar per mood + the "happiest weekday" callout sentence. */
export function MoodSection({ stats }: { stats: InsightsStats }) {
  const { t, locale } = useTranslation();
  const maxCount = Math.max(...MOODS.map((mood) => stats.moodCounts[mood]), 1);

  return (
    <View className="gap-2.5">
      {MOODS.map((mood) => {
        const count = stats.moodCounts[mood];
        return (
          <View key={mood} className="flex-row items-center gap-2">
            <Text className="text-lg w-8 text-center">{MOOD_EMOJI[mood]}</Text>
            <View className="flex-1 h-3 rounded-full bg-muted/40 overflow-hidden">
              <View
                className="h-3 rounded-full"
                style={{
                  width: `${Math.max((count / maxCount) * 100, count > 0 ? 4 : 0)}%`,
                  backgroundColor: MOOD_COLORS[mood],
                }}
              />
            </View>
            <Text className="text-xs text-muted-foreground w-8 text-right">
              {formatLocalizedNumber(count, locale)}
            </Text>
          </View>
        );
      })}

      {stats.happiestWeekday !== null && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Text className="text-base">✨</Text>
          <Text className="text-sm text-foreground flex-1">
            {t('Your happiest day is {weekday}', {
              weekday: t(DAY_KEYS[stats.happiestWeekday]),
            })}
          </Text>
        </View>
      )}
    </View>
  );
}
