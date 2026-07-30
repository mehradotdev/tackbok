import { memo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { cn } from 'tailwind-variants';
import { MOODS, MOOD_EMOJI, MONTH_SHORT_KEYS } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { HeatmapDay, HeatmapWeek } from '~/lib/insights';
import { MOOD_COLORS } from './shared';

const CELL = 13;
const GAP = 3;
const COL = CELL + GAP;
const MONTH_ROW_HEIGHT = 16;

type HeatmapMode = 'entries' | 'mood';

/** Complete class strings only — Tailwind classes cannot be built dynamically. */
function countLevelClass(count: number): string {
  if (count === 0) return 'bg-muted/40';
  if (count === 1) return 'bg-primary/35';
  if (count === 2) return 'bg-primary/65';
  return 'bg-primary';
}

function DayCell({ day, mode }: { day: HeatmapDay; mode: HeatmapMode }) {
  if (day.isFuture) {
    // Invisible but present, so the current week keeps a full 7-row column.
    return <View style={{ width: CELL, height: CELL, marginBottom: GAP }} />;
  }

  const moodColor = mode === 'mood' && day.mood ? MOOD_COLORS[day.mood] : null;
  return (
    <View
      className={cn(
        'rounded-[3px]',
        moodColor ? undefined : mode === 'mood' ? 'bg-muted/40' : countLevelClass(day.count),
      )}
      style={{
        width: CELL,
        height: CELL,
        marginBottom: GAP,
        ...(moodColor ? { backgroundColor: moodColor } : null),
      }}
    />
  );
}

const WeekColumn = memo(function WeekColumn({
  week,
  mode,
  monthLabel,
}: {
  week: HeatmapWeek;
  mode: HeatmapMode;
  monthLabel: string | null;
}) {
  return (
    <View style={{ width: COL }}>
      <View style={{ height: MONTH_ROW_HEIGHT }}>
        {monthLabel !== null && (
          <Text
            className="text-[9px] text-muted-foreground"
            numberOfLines={1}
            style={{ width: COL * 2.5, zIndex: 1 }}>
            {monthLabel}
          </Text>
        )}
      </View>
      {week.days.map((day) => (
        <DayCell key={day.dateMs} day={day} mode={mode} />
      ))}
    </View>
  );
});

function ModePill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn('px-3 py-1.5 rounded-full', active && 'bg-primary')}>
      <Text
        className={cn(
          'text-xs font-body-medium',
          active ? 'text-primary-foreground' : 'text-muted-foreground',
        )}>
        {label}
      </Text>
    </Pressable>
  );
}

interface ContributionHeatmapProps {
  weeks: HeatmapWeek[];
  /** Whether any mood exists at all — hides the mood toggle when false. */
  hasMoods: boolean;
}

/**
 * GitHub-style contribution strip: weeks as columns over the full journal
 * history, virtualized horizontally and right-anchored on today. The mood
 * mode recolors the same grid into a "year in pixels".
 */
export function ContributionHeatmap({ weeks, hasMoods }: ContributionHeatmapProps) {
  const { t, isRTL } = useTranslation();
  const [mode, setMode] = useState<HeatmapMode>('entries');
  const rtlScrollRef = useRef<ScrollView>(null);

  const gridHeight = MONTH_ROW_HEIGHT + 7 * COL;

  // The grid is a purely visual chart — 13pt cells are far below usable touch
  // targets, so days are deliberately not interactive (day detail lives in
  // the home timeline). The grid and legend are hidden from the accessibility
  // tree (without the colors, month labels and legend text carry no meaning),
  // but the Entries/Mood toggle stays accessible — it's a functional control.
  return (
    <View>
      {hasMoods && (
        <View className="flex-row self-start bg-muted/60 rounded-full p-0.5 mb-3">
          <ModePill
            label={t('Entries')}
            active={mode === 'entries'}
            onPress={() => setMode('entries')}
          />
          <ModePill
            label={t('Mood')}
            active={mode === 'mood'}
            onPress={() => setMode('mood')}
          />
        </View>
      )}

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: gridHeight }}>
        {isRTL ? (
          // LegendList mispositions horizontal content under native RTL
          // (blank strip) — fall back to a plain ScrollView there. RN lays the
          // columns out right-to-left natively, which is also the correct
          // reading direction; the newest week sits at the visual LEFT edge,
          // i.e. absolute offset 0 (scrollToEnd would anchor on the oldest).
          <ScrollView
            ref={rtlScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() =>
              rtlScrollRef.current?.scrollTo({ x: 0, animated: false })
            }>
            {weeks.map((week) => (
              <WeekColumn
                key={`week-${week.weekStartMs}`}
                week={week}
                mode={mode}
                monthLabel={
                  week.monthIndex !== null ? t(MONTH_SHORT_KEYS[week.monthIndex]) : null
                }
              />
            ))}
          </ScrollView>
        ) : (
          <LegendList
            horizontal
            data={weeks}
            recycleItems={true}
            extraData={mode}
            estimatedItemSize={COL}
            drawDistance={300}
            initialScrollIndex={weeks.length - 1}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(week) => `week-${week.weekStartMs}`}
            renderItem={({ item }) => (
              <WeekColumn
                week={item}
                mode={mode}
                monthLabel={
                  item.monthIndex !== null ? t(MONTH_SHORT_KEYS[item.monthIndex]) : null
                }
              />
            )}
          />
        )}
      </View>

      {mode === 'entries' ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="flex-row items-center justify-end gap-1 mt-2">
          <Text className="text-[10px] text-muted-foreground mr-1">{t('Less')}</Text>
          {['bg-muted/40', 'bg-primary/35', 'bg-primary/65', 'bg-primary'].map(
            (levelClass) => (
              <View
                key={levelClass}
                className={cn('rounded-[3px]', levelClass)}
                style={{ width: CELL, height: CELL }}
              />
            ),
          )}
          <Text className="text-[10px] text-muted-foreground ml-1">{t('More')}</Text>
        </View>
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="flex-row items-center justify-end gap-2 mt-2">
          {MOODS.map((mood) => (
            <View key={mood} className="flex-row items-center gap-1">
              <View
                className="rounded-[3px]"
                style={{ width: CELL, height: CELL, backgroundColor: MOOD_COLORS[mood] }}
              />
              <Text className="text-sm">{MOOD_EMOJI[mood]}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
