import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  getHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { InsightsEntryRow } from '~/db/queries';
import { MOODS, type Mood } from '~/constants';
import { AssetType, FirstDay, type FirstDayOfWeek } from '~/types';

// ============================================================================
// Constants
// ============================================================================

/** Numeric score per mood for averages/trends (higher = better). */
export const MOOD_SCORE: Record<Mood, number> = {
  AMAZING: 5,
  HAPPY: 4,
  OKAY: 3,
  SAD: 2,
  AWFUL: 1,
};

/**
 * Gratitude-score decay: Loop Habit Tracker's daily EMA multiplier,
 * `0.5^(1/13)` — a 13-day half-life, so a missed day costs ~5% instead of
 * resetting anything (gentler than a raw streak).
 */
export const SCORE_MULTIPLIER = Math.pow(0.5, 1 / 13);

/** The heatmap strip never renders narrower than this many weeks. */
export const MIN_HEATMAP_WEEKS = 26;

/** Mood trend chart looks at this many recent weeks. */
export const MOOD_TREND_WEEKS = 26;

/** Mood trend requires moods on this many distinct days within the window… */
export const MOOD_TREND_MIN_DAYS = 10;
/** …spread over at least this many distinct weeks. */
export const MOOD_TREND_MIN_WEEKS = 4;

/** Happiest-weekday callout requires this many recorded moods overall… */
export const HAPPIEST_WEEKDAY_MIN_MOODS = 10;
/** …and this many samples on the winning weekday. */
export const HAPPIEST_WEEKDAY_MIN_SAMPLES = 3;

/** Max photos surfaced in the "Your memories" mosaic. */
export const MOSAIC_PHOTO_LIMIT = 9;

/** Max tags surfaced in the top-tags list. */
export const TOP_TAGS_LIMIT = 5;

// ============================================================================
// Types
// ============================================================================

export interface HeatmapDay {
  dateMs: number;
  count: number;
  /** Mood of the day's latest mood-carrying entry (drives the mood view). */
  mood: Mood | null;
  /** Future days in the current week — rendered invisible to keep the grid. */
  isFuture: boolean;
}

export interface HeatmapWeek {
  weekStartMs: number;
  /** Always 7 entries, ordered by the user's first-day-of-week setting. */
  days: HeatmapDay[];
  /** Month short-label slot: set when this week contains the 1st of a month. */
  monthIndex: number | null;
}

export interface MoodTrendPoint {
  weekStartMs: number;
  /** Average mood score (1–5) of the week, or null when no moods that week. */
  avg: number | null;
}

export type TimeOfDayBucket = 'morning' | 'afternoon' | 'evening' | 'night';

export interface InsightsStats {
  totalEntries: number;
  daysJournaled: number;
  currentStreak: number;
  longestStreak: number;
  /** Gratitude score 0..1 (EMA of "did I journal today"). */
  score: number;
  heatmapWeeks: HeatmapWeek[];
  moodCounts: Record<Mood, number>;
  moodTotal: number;
  /** Weekday index 0–6 (Sunday-first, matches DAY_KEYS), or null if gated. */
  happiestWeekday: number | null;
  /** Weekly mood averages for the trend chart; empty when below thresholds. */
  moodTrend: MoodTrendPoint[];
  timeOfDay: Record<TimeOfDayBucket, number>;
  /** Last 12 months, oldest first, zero-filled. */
  monthly: { monthStartMs: number; count: number }[];
  /** Tag usage, most-used first, capped at TOP_TAGS_LIMIT. */
  topTags: { tagId: string; count: number }[];
  totalWords: number;
  totalChars: number;
  photoCount: number;
  audioCount: number;
  /** Newest photos first, capped at MOSAIC_PHOTO_LIMIT. Relative URIs. */
  recentPhotos: { noteId: string; uri: string }[];
}

export interface ComputeInsightsOptions {
  /** Injectable for tests; defaults to `new Date()` at the call site. */
  now: Date;
  weekStartsOn: 0 | 1 | 6;
}

// ============================================================================
// Helpers
// ============================================================================

/** Maps the settings-store first-day value to date-fns' `weekStartsOn`. */
export function firstDayToWeekStartsOn(day: FirstDayOfWeek): 0 | 1 | 6 {
  switch (day) {
    case FirstDay.SATURDAY:
      return 6;
    case FirstDay.MONDAY:
      return 1;
    case FirstDay.SUNDAY:
    default:
      return 0;
  }
}

export function timeOfDayBucket(hour: number): TimeOfDayBucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

interface DayAggregate {
  count: number;
  mood: Mood | null;
  moodTs: number;
}

// ============================================================================
// Main computation
// ============================================================================

/**
 * Derives every Insights-screen stat in one pass over the (cheap) entry rows.
 * All day boundaries use local time via date-fns — same convention as the
 * timeline's grouping (never SQLite's UTC `date()`).
 */
export function computeInsightsStats(
  rows: InsightsEntryRow[],
  { now, weekStartsOn }: ComputeInsightsOptions,
): InsightsStats {
  const sorted = [...rows].sort((a, b) => a.created_at - b.created_at);
  const todayStart = startOfDay(now);
  const todayMs = todayStart.getTime();

  // ── Single pass: day aggregates + simple totals ─────────────────────────
  const dayMap = new Map<number, DayAggregate>();
  const moodCounts: Record<Mood, number> = {
    AMAZING: 0,
    HAPPY: 0,
    OKAY: 0,
    SAD: 0,
    AWFUL: 0,
  };
  const weekdayMoodSum = new Array<number>(7).fill(0);
  const weekdayMoodCount = new Array<number>(7).fill(0);
  const timeOfDay: Record<TimeOfDayBucket, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };
  const tagCounts = new Map<string, number>();
  let totalWords = 0;
  let totalChars = 0;
  let photoCount = 0;
  let audioCount = 0;

  for (const row of sorted) {
    const created = new Date(row.created_at);
    const dayMs = startOfDay(created).getTime();

    let day = dayMap.get(dayMs);
    if (!day) {
      day = { count: 0, mood: null, moodTs: 0 };
      dayMap.set(dayMs, day);
    }
    day.count += 1;
    if (row.mood && row.created_at >= day.moodTs) {
      day.mood = row.mood;
      day.moodTs = row.created_at;
    }

    if (row.mood) {
      moodCounts[row.mood] += 1;
      const weekday = created.getDay();
      weekdayMoodSum[weekday] += MOOD_SCORE[row.mood];
      weekdayMoodCount[weekday] += 1;
    }

    timeOfDay[timeOfDayBucket(getHours(created))] += 1;

    for (const tagId of row.tags.split(',')) {
      if (tagId.length > 0) {
        tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);
      }
    }

    totalWords += row.word_count;
    totalChars += row.char_count;
    for (const asset of row.assets ?? []) {
      if (asset.type === AssetType.IMAGE) photoCount += 1;
      else if (asset.type === AssetType.AUDIO) audioCount += 1;
    }
  }

  const journaledDays = [...dayMap.keys()].sort((a, b) => a - b);

  // ── Streaks ─────────────────────────────────────────────────────────────
  let longestStreak = 0;
  let run = 0;
  let prevDay: number | null = null;
  for (const dayMs of journaledDays) {
    if (
      prevDay !== null &&
      differenceInCalendarDays(new Date(dayMs), new Date(prevDay)) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    longestStreak = Math.max(longestStreak, run);
    prevDay = dayMs;
  }

  // Current streak: count back from today; a streak is still "alive" (but not
  // extended) when today has no entry yet and yesterday does.
  let currentStreak = 0;
  let cursor = dayMap.has(todayMs) ? todayStart : addDays(todayStart, -1);
  while (dayMap.has(cursor.getTime())) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  // ── Gratitude score (EMA over the did-I-journal series) ─────────────────
  let score = 0;
  if (journaledDays.length > 0) {
    const firstDay = new Date(journaledDays[0]);
    const totalDays = differenceInCalendarDays(todayStart, firstDay);
    for (let i = 0; i <= totalDays; i++) {
      const hasEntry = dayMap.has(addDays(firstDay, i).getTime()) ? 1 : 0;
      score = score * SCORE_MULTIPLIER + hasEntry * (1 - SCORE_MULTIPLIER);
    }
  }

  // ── Contribution heatmap weeks ──────────────────────────────────────────
  const currentWeekStart = startOfWeek(todayStart, { weekStartsOn });
  const firstEntryWeekStart =
    journaledDays.length > 0
      ? startOfWeek(new Date(journaledDays[0]), { weekStartsOn })
      : currentWeekStart;
  const minSpanStart = addWeeks(currentWeekStart, -(MIN_HEATMAP_WEEKS - 1));
  let weekCursor =
    firstEntryWeekStart.getTime() < minSpanStart.getTime()
      ? firstEntryWeekStart
      : minSpanStart;

  const heatmapWeeks: HeatmapWeek[] = [];
  while (weekCursor.getTime() <= currentWeekStart.getTime()) {
    const days: HeatmapDay[] = [];
    let monthIndex: number | null = null;
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekCursor, i);
      const dateMs = date.getTime();
      const aggregate = dayMap.get(dateMs);
      if (date.getDate() === 1) monthIndex = date.getMonth();
      days.push({
        dateMs,
        count: aggregate?.count ?? 0,
        mood: aggregate?.mood ?? null,
        isFuture: dateMs > todayMs,
      });
    }
    heatmapWeeks.push({ weekStartMs: weekCursor.getTime(), days, monthIndex });
    weekCursor = addWeeks(weekCursor, 1);
  }

  // ── Mood trend (weekly averages over the recent window) ─────────────────
  const trendStart = addWeeks(currentWeekStart, -(MOOD_TREND_WEEKS - 1));
  const weeklyMoodSum = new Map<number, { sum: number; count: number }>();
  let moodDaysInWindow = 0;
  for (const [dayMs, day] of dayMap) {
    if (day.mood === null || dayMs < trendStart.getTime()) continue;
    moodDaysInWindow += 1;
    const weekMs = startOfWeek(new Date(dayMs), { weekStartsOn }).getTime();
    const bucket = weeklyMoodSum.get(weekMs) ?? { sum: 0, count: 0 };
    bucket.sum += MOOD_SCORE[day.mood];
    bucket.count += 1;
    weeklyMoodSum.set(weekMs, bucket);
  }
  let moodTrend: MoodTrendPoint[] = [];
  if (
    moodDaysInWindow >= MOOD_TREND_MIN_DAYS &&
    weeklyMoodSum.size >= MOOD_TREND_MIN_WEEKS
  ) {
    for (let i = 0; i < MOOD_TREND_WEEKS; i++) {
      const weekMs = addWeeks(trendStart, i).getTime();
      const bucket = weeklyMoodSum.get(weekMs);
      moodTrend.push({
        weekStartMs: weekMs,
        avg: bucket ? bucket.sum / bucket.count : null,
      });
    }
    // Trim leading empty weeks so short histories don't start with a gap.
    const firstWithData = moodTrend.findIndex((p) => p.avg !== null);
    moodTrend = moodTrend.slice(firstWithData);
  }

  // ── Happiest weekday callout ────────────────────────────────────────────
  const moodTotal = MOODS.reduce((sum, mood) => sum + moodCounts[mood], 0);
  let happiestWeekday: number | null = null;
  if (moodTotal >= HAPPIEST_WEEKDAY_MIN_MOODS) {
    let bestAvg = -Infinity;
    for (let weekday = 0; weekday < 7; weekday++) {
      if (weekdayMoodCount[weekday] < HAPPIEST_WEEKDAY_MIN_SAMPLES) continue;
      const avg = weekdayMoodSum[weekday] / weekdayMoodCount[weekday];
      const beatsBest =
        avg > bestAvg ||
        (avg === bestAvg &&
          happiestWeekday !== null &&
          weekdayMoodCount[weekday] > weekdayMoodCount[happiestWeekday]);
      if (beatsBest) {
        bestAvg = avg;
        happiestWeekday = weekday;
      }
    }
  }

  // ── Monthly volume (last 12 months, zero-filled) ────────────────────────
  const monthCounts = new Map<number, number>();
  for (const [dayMs, day] of dayMap) {
    const monthMs = startOfMonth(new Date(dayMs)).getTime();
    monthCounts.set(monthMs, (monthCounts.get(monthMs) ?? 0) + day.count);
  }
  const monthly: { monthStartMs: number; count: number }[] = [];
  const currentMonthStart = startOfMonth(todayStart);
  for (let i = 11; i >= 0; i--) {
    const monthMs = addMonths(currentMonthStart, -i).getTime();
    monthly.push({ monthStartMs: monthMs, count: monthCounts.get(monthMs) ?? 0 });
  }

  // ── Top tags ────────────────────────────────────────────────────────────
  const topTags = [...tagCounts.entries()]
    .map(([tagId, count]) => ({ tagId, count }))
    .sort((a, b) => b.count - a.count || a.tagId.localeCompare(b.tagId))
    .slice(0, TOP_TAGS_LIMIT);

  // ── Recent photos (newest first) ────────────────────────────────────────
  const recentPhotos: { noteId: string; uri: string }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i];
    for (const asset of row.assets ?? []) {
      if (asset.type !== AssetType.IMAGE) continue;
      recentPhotos.push({ noteId: row.note_id, uri: asset.uri });
      if (recentPhotos.length >= MOSAIC_PHOTO_LIMIT) break;
    }
    if (recentPhotos.length >= MOSAIC_PHOTO_LIMIT) break;
  }

  return {
    totalEntries: sorted.length,
    daysJournaled: journaledDays.length,
    currentStreak,
    longestStreak,
    score,
    heatmapWeeks,
    moodCounts,
    moodTotal,
    happiestWeekday,
    moodTrend,
    timeOfDay,
    monthly,
    topTags,
    totalWords,
    totalChars,
    photoCount,
    audioCount,
    recentPhotos,
  };
}
