import { View } from 'react-native';
import { formatLocalizedNumber, useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { InsightsStats, TimeOfDayBucket } from '~/lib/insights';

const BAR_MAX_HEIGHT = 84;

/** Share of all entries a bucket needs before we call the user that writer. */
const CALLOUT_MIN_SHARE = 0.4;

const BUCKETS: { key: TimeOfDayBucket; emoji: string; labelKey: string }[] = [
  { key: 'morning', emoji: '☀️', labelKey: 'Morning' },
  { key: 'afternoon', emoji: '🌤️', labelKey: 'Afternoon' },
  { key: 'evening', emoji: '🌆', labelKey: 'Evening' },
  { key: 'night', emoji: '🌙', labelKey: 'Night' },
];

const CALLOUT_KEYS: Record<TimeOfDayBucket, string> = {
  morning: "You're a morning writer",
  afternoon: "You're an afternoon writer",
  evening: "You're an evening writer",
  night: "You're a night writer",
};

/** When do you journal? Four bars + a one-line "night writer" style callout. */
export function TimeOfDaySection({ stats }: { stats: InsightsStats }) {
  const { t, locale } = useTranslation();
  const counts = BUCKETS.map((bucket) => stats.timeOfDay[bucket.key]);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const maxCount = Math.max(...counts, 1);

  const dominant = BUCKETS.reduce(
    (best, bucket) =>
      stats.timeOfDay[bucket.key] > stats.timeOfDay[best.key] ? bucket : best,
    BUCKETS[0],
  );
  const showCallout = total > 0 && stats.timeOfDay[dominant.key] / total >= CALLOUT_MIN_SHARE;

  return (
    <View>
      <View className="flex-row items-end gap-3" style={{ height: BAR_MAX_HEIGHT + 4 }}>
        {BUCKETS.map((bucket) => {
          const count = stats.timeOfDay[bucket.key];
          const height = Math.max((count / maxCount) * BAR_MAX_HEIGHT, count > 0 ? 4 : 2);
          return (
            <View key={bucket.key} className="flex-1 items-center justify-end">
              {count > 0 && (
                <Text className="text-[10px] text-muted-foreground mb-0.5">
                  {formatLocalizedNumber(count, locale)}
                </Text>
              )}
              <View
                className={count > 0 ? 'w-full rounded-t-md bg-primary' : 'w-full rounded-t-md bg-muted/40'}
                style={{ height }}
              />
            </View>
          );
        })}
      </View>
      <View className="flex-row gap-3 mt-1.5">
        {BUCKETS.map((bucket) => (
          <View key={bucket.key} className="flex-1 items-center">
            <Text className="text-xl">{bucket.emoji}</Text>
            <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
              {t(bucket.labelKey)}
            </Text>
          </View>
        ))}
      </View>

      {showCallout && (
        <View className="flex-row items-center gap-1.5 mt-3">
          <Text className="text-base">{dominant.emoji}</Text>
          <Text className="text-sm text-foreground flex-1">
            {t(CALLOUT_KEYS[dominant.key])}
          </Text>
        </View>
      )}
    </View>
  );
}
