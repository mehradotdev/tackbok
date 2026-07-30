import { View } from 'react-native';
import { MONTH_SHORT_KEYS } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { InsightsStats } from '~/lib/insights';

const BAR_MAX_HEIGHT = 84;

/** Entries per month over the last 12 months. */
export function MonthlyBars({ stats }: { stats: InsightsStats }) {
  const { t } = useTranslation();
  const maxCount = Math.max(...stats.monthly.map((month) => month.count), 1);

  return (
    <View>
      <View className="flex-row items-end gap-1" style={{ height: BAR_MAX_HEIGHT + 14 }}>
        {stats.monthly.map((month) => {
          const height = Math.max(
            (month.count / maxCount) * BAR_MAX_HEIGHT,
            month.count > 0 ? 4 : 2,
          );
          return (
            <View key={month.monthStartMs} className="flex-1 items-center justify-end">
              {month.count > 0 && (
                <Text className="text-[9px] text-muted-foreground mb-0.5">
                  {month.count.toLocaleString()}
                </Text>
              )}
              <View
                className={
                  month.count > 0
                    ? 'w-full rounded-t-sm bg-primary'
                    : 'w-full rounded-t-sm bg-muted/40'
                }
                style={{ height }}
              />
            </View>
          );
        })}
      </View>
      <View className="flex-row gap-1 mt-1">
        {stats.monthly.map((month) => (
          <Text
            key={month.monthStartMs}
            className="flex-1 text-[8px] text-muted-foreground text-center"
            numberOfLines={1}>
            {t(MONTH_SHORT_KEYS[new Date(month.monthStartMs).getMonth()])}
          </Text>
        ))}
      </View>
    </View>
  );
}
