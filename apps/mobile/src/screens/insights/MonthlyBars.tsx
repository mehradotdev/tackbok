import { memo, useMemo, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { MONTH_SHORT_KEYS } from '~/constants';
import { formatLocalizedNumber, useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { InsightsStats } from '~/lib/insights';

const BAR_MAX_HEIGHT = 84;
const COL_WIDTH = 42;
const COUNT_ROW_HEIGHT = 16;
const MONTH_ROW_HEIGHT = 18;
const YEAR_ROW_HEIGHT = 14;

/**
 * Bars scale against the 95th-percentile month instead of the absolute max,
 * so a single outlier month (e.g. a bulk import) can't flatten the rest of
 * the history. Outliers clamp to full height; their count still shows above.
 */
function scaleCeiling(counts: number[]): number {
  const nonZero = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return 1;
  return nonZero[Math.min(Math.floor(nonZero.length * 0.95), nonZero.length - 1)];
}

const MonthColumn = memo(function MonthColumn({
  count,
  ceiling,
  countLabel,
  monthLabel,
  yearLabel,
}: {
  count: number;
  ceiling: number;
  countLabel: string;
  monthLabel: string;
  yearLabel: string | null;
}) {
  const barHeight = Math.max(
    Math.min(count / ceiling, 1) * BAR_MAX_HEIGHT,
    count > 0 ? 4 : 2,
  );
  return (
    <View style={{ width: COL_WIDTH }} className="px-0.5">
      <View style={{ height: COUNT_ROW_HEIGHT + BAR_MAX_HEIGHT }} className="justify-end">
        {count > 0 && (
          <Text
            className="text-[10px] text-muted-foreground text-center mb-0.5"
            numberOfLines={1}>
            {countLabel}
          </Text>
        )}
        <View
          className={
            count > 0 ? 'w-full rounded-t-sm bg-primary' : 'w-full rounded-t-sm bg-muted/40'
          }
          style={{ height: barHeight }}
        />
      </View>
      <View style={{ height: MONTH_ROW_HEIGHT }} className="justify-end">
        <Text className="text-[11px] text-muted-foreground text-center" numberOfLines={1}>
          {monthLabel}
        </Text>
      </View>
      <View style={{ height: YEAR_ROW_HEIGHT }}>
        {yearLabel !== null && (
          <Text className="text-[10px] text-muted-foreground text-center" numberOfLines={1}>
            {yearLabel}
          </Text>
        )}
      </View>
    </View>
  );
});

/**
 * Entries per month over the full journal history, horizontally scrollable
 * and anchored on the current month — same interaction as the heatmap.
 * January columns (and the oldest column) carry a year label underneath.
 *
 * Deliberately a plain ScrollView, not LegendList: even a 20-year journal is
 * only ~240 cheap columns, and the native ScrollView handles RTL correctly
 * where LegendList's horizontal-RTL offset math renders a blank strip.
 * scrollToEnd lands on the current month in both directions.
 */
export function MonthlyBars({ stats }: { stats: InsightsStats }) {
  const { t, locale, isRTL } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const ceiling = useMemo(
    () => scaleCeiling(stats.monthly.map((month) => month.count)),
    [stats.monthly],
  );

  // In RTL the strip is laid out right-to-left, so the newest month sits at
  // the visual LEFT edge — absolute offset 0. scrollToEnd targets the visual
  // right edge, which in RTL is the oldest end.
  const anchorOnToday = () => {
    if (isRTL) scrollRef.current?.scrollTo({ x: 0, animated: false });
    else scrollRef.current?.scrollToEnd({ animated: false });
  };

  return (
    <View style={{ height: COUNT_ROW_HEIGHT + BAR_MAX_HEIGHT + MONTH_ROW_HEIGHT + YEAR_ROW_HEIGHT }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={anchorOnToday}>
        {stats.monthly.map((item, index) => {
          const date = new Date(item.monthStartMs);
          return (
            <MonthColumn
              key={`month-${item.monthStartMs}`}
              count={item.count}
              ceiling={ceiling}
              countLabel={formatLocalizedNumber(item.count, locale)}
              monthLabel={t(MONTH_SHORT_KEYS[date.getMonth()])}
              yearLabel={
                date.getMonth() === 0 || index === 0 ? String(date.getFullYear()) : null
              }
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
