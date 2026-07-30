import { addDays, getDay, startOfDay, startOfWeek } from 'date-fns';
import type { InsightsEntryRow } from '~/db/queries';
import {
  computeInsightsStats,
  firstDayToWeekStartsOn,
  timeOfDayBucket,
  MIN_HEATMAP_WEEKS,
  SCORE_MULTIPLIER,
  MOSAIC_PHOTO_LIMIT,
} from './insights';
import { FirstDay } from '~/types';

// Fixed "now": Thursday, July 30 2026, 15:00 local time.
const NOW = new Date(2026, 6, 30, 15, 0, 0);
const TODAY = startOfDay(NOW);

const OPTS = { now: NOW, weekStartsOn: 1 as const };

let idCounter = 0;
function row(
  overrides: Partial<InsightsEntryRow> & { created_at: number },
): InsightsEntryRow {
  idCounter += 1;
  return {
    note_id: `note-${idCounter}`,
    mood: null,
    assets: null,
    tags: '',
    char_count: 0,
    word_count: 0,
    ...overrides,
  };
}

/** Timestamp on the day `daysAgo` days before today, at the given hour. */
function daysAgoAt(daysAgo: number, hour = 12): number {
  const day = addDays(TODAY, -daysAgo);
  return day.getTime() + hour * 60 * 60 * 1000;
}

describe('firstDayToWeekStartsOn', () => {
  it('maps settings values to date-fns weekStartsOn', () => {
    expect(firstDayToWeekStartsOn(FirstDay.SUNDAY)).toBe(0);
    expect(firstDayToWeekStartsOn(FirstDay.MONDAY)).toBe(1);
    expect(firstDayToWeekStartsOn(FirstDay.SATURDAY)).toBe(6);
  });
});

describe('timeOfDayBucket', () => {
  it('assigns boundary hours to the right buckets', () => {
    expect(timeOfDayBucket(5)).toBe('morning');
    expect(timeOfDayBucket(11)).toBe('morning');
    expect(timeOfDayBucket(12)).toBe('afternoon');
    expect(timeOfDayBucket(16)).toBe('afternoon');
    expect(timeOfDayBucket(17)).toBe('evening');
    expect(timeOfDayBucket(21)).toBe('evening');
    expect(timeOfDayBucket(22)).toBe('night');
    expect(timeOfDayBucket(4)).toBe('night');
    expect(timeOfDayBucket(0)).toBe('night');
  });
});

describe('computeInsightsStats', () => {
  it('returns zeroed stats for an empty journal', () => {
    const stats = computeInsightsStats([], OPTS);
    expect(stats.totalEntries).toBe(0);
    expect(stats.daysJournaled).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.score).toBe(0);
    expect(stats.moodTotal).toBe(0);
    expect(stats.happiestWeekday).toBeNull();
    expect(stats.moodTrend).toEqual([]);
    expect(stats.topTags).toEqual([]);
    expect(stats.recentPhotos).toEqual([]);
    expect(stats.heatmapWeeks).toHaveLength(MIN_HEATMAP_WEEKS);
    expect(stats.monthly).toHaveLength(12);
    expect(stats.monthly.every((m) => m.count === 0)).toBe(true);
  });

  describe('streaks', () => {
    it('counts a current streak ending today', () => {
      const rows = [0, 1, 2].map((d) => row({ created_at: daysAgoAt(d) }));
      const stats = computeInsightsStats(rows, OPTS);
      expect(stats.currentStreak).toBe(3);
      expect(stats.longestStreak).toBe(3);
    });

    it('keeps the streak alive when today has no entry yet', () => {
      const rows = [1, 2, 3].map((d) => row({ created_at: daysAgoAt(d) }));
      expect(computeInsightsStats(rows, OPTS).currentStreak).toBe(3);
    });

    it('resets the current streak after a missed day', () => {
      const rows = [2, 3, 4].map((d) => row({ created_at: daysAgoAt(d) }));
      const stats = computeInsightsStats(rows, OPTS);
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(3);
    });

    it('finds the longest run anywhere in history', () => {
      const rows = [0, 3, 4, 5, 6, 9].map((d) => row({ created_at: daysAgoAt(d) }));
      const stats = computeInsightsStats(rows, OPTS);
      expect(stats.longestStreak).toBe(4);
      expect(stats.currentStreak).toBe(1);
    });

    it('counts multiple entries on one day as a single journaled day', () => {
      const rows = [
        row({ created_at: daysAgoAt(0, 8) }),
        row({ created_at: daysAgoAt(0, 20) }),
      ];
      const stats = computeInsightsStats(rows, OPTS);
      expect(stats.daysJournaled).toBe(1);
      expect(stats.currentStreak).toBe(1);
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('gratitude score', () => {
    it('gives a single first-day entry one EMA step', () => {
      const stats = computeInsightsStats([row({ created_at: daysAgoAt(0) })], OPTS);
      expect(stats.score).toBeCloseTo(1 - SCORE_MULTIPLIER, 10);
    });

    it('halves after 13 consecutive missed days', () => {
      // Journal daily for 60 days, then stop 13 days before today.
      const rows: InsightsEntryRow[] = [];
      for (let d = 13; d < 73; d++) rows.push(row({ created_at: daysAgoAt(d) }));
      const withGap = computeInsightsStats(rows, OPTS).score;

      // Same history evaluated on its final journaled day (no gap).
      const endOfRun = { ...OPTS, now: addDays(TODAY, -13) };
      const noGap = computeInsightsStats(rows, endOfRun).score;

      expect(withGap).toBeCloseTo(noGap * Math.pow(SCORE_MULTIPLIER, 13), 10);
      expect(withGap).toBeCloseTo(noGap / 2, 3);
    });

    it('approaches 1 with a long perfect run', () => {
      const rows: InsightsEntryRow[] = [];
      for (let d = 0; d < 120; d++) rows.push(row({ created_at: daysAgoAt(d) }));
      expect(computeInsightsStats(rows, OPTS).score).toBeGreaterThan(0.99);
    });
  });

  describe('heatmap', () => {
    it('spans at least MIN_HEATMAP_WEEKS and ends with the current week', () => {
      const stats = computeInsightsStats([row({ created_at: daysAgoAt(0) })], OPTS);
      expect(stats.heatmapWeeks.length).toBeGreaterThanOrEqual(MIN_HEATMAP_WEEKS);
      const lastWeek = stats.heatmapWeeks[stats.heatmapWeeks.length - 1];
      expect(lastWeek.weekStartMs).toBe(
        startOfWeek(TODAY, { weekStartsOn: 1 }).getTime(),
      );
    });

    it('extends further back for older histories', () => {
      const oldDays = MIN_HEATMAP_WEEKS * 7 + 30;
      const stats = computeInsightsStats(
        [row({ created_at: daysAgoAt(oldDays) }), row({ created_at: daysAgoAt(0) })],
        OPTS,
      );
      expect(stats.heatmapWeeks.length).toBeGreaterThan(MIN_HEATMAP_WEEKS);
      const firstWeek = stats.heatmapWeeks[0];
      expect(firstWeek.days.some((d) => d.count === 1)).toBe(true);
    });

    it('aligns every week to the configured first day', () => {
      for (const weekStartsOn of [0, 1, 6] as const) {
        const stats = computeInsightsStats([row({ created_at: daysAgoAt(0) })], {
          now: NOW,
          weekStartsOn,
        });
        for (const week of stats.heatmapWeeks) {
          expect(getDay(new Date(week.weekStartMs))).toBe(weekStartsOn);
          expect(week.days).toHaveLength(7);
        }
      }
    });

    it('marks future days and records day counts and latest mood', () => {
      const rows = [
        row({ created_at: daysAgoAt(0, 8), mood: 'SAD' }),
        row({ created_at: daysAgoAt(0, 14), mood: 'HAPPY' }),
      ];
      const stats = computeInsightsStats(rows, OPTS);
      const allDays = stats.heatmapWeeks.flatMap((w) => w.days);
      const today = allDays.find((d) => d.dateMs === TODAY.getTime());
      expect(today).toMatchObject({ count: 2, mood: 'HAPPY', isFuture: false });
      for (const day of allDays) {
        expect(day.isFuture).toBe(day.dateMs > TODAY.getTime());
      }
    });
  });

  describe('mood stats', () => {
    it('tallies the mood distribution', () => {
      const rows = [
        row({ created_at: daysAgoAt(1), mood: 'AMAZING' }),
        row({ created_at: daysAgoAt(2), mood: 'AMAZING' }),
        row({ created_at: daysAgoAt(3), mood: 'AWFUL' }),
        row({ created_at: daysAgoAt(4) }),
      ];
      const stats = computeInsightsStats(rows, OPTS);
      expect(stats.moodCounts.AMAZING).toBe(2);
      expect(stats.moodCounts.AWFUL).toBe(1);
      expect(stats.moodTotal).toBe(3);
    });

    it('gates the happiest weekday below the mood minimum', () => {
      const rows = [1, 2, 3].map((d) =>
        row({ created_at: daysAgoAt(d), mood: 'HAPPY' }),
      );
      expect(computeInsightsStats(rows, OPTS).happiestWeekday).toBeNull();
    });

    it('finds the happiest weekday with enough data', () => {
      const rows: InsightsEntryRow[] = [];
      // Nine OKAY moods on assorted days + three AMAZING moods on one weekday.
      for (let i = 0; i < 9; i++) {
        rows.push(row({ created_at: daysAgoAt(i + 1), mood: 'OKAY' }));
      }
      const amazingDaysAgo = [14, 21, 28]; // same weekday, two weeks+ back
      for (const d of amazingDaysAgo) {
        rows.push(row({ created_at: daysAgoAt(d), mood: 'AMAZING' }));
      }
      const expectedWeekday = getDay(addDays(TODAY, -14));
      const stats = computeInsightsStats(rows, OPTS);
      expect(stats.happiestWeekday).toBe(expectedWeekday);
    });

    it('gates the mood trend until enough mood days and weeks exist', () => {
      const sparse = [1, 8, 15, 22].map((d) =>
        row({ created_at: daysAgoAt(d), mood: 'HAPPY' }),
      );
      expect(computeInsightsStats(sparse, OPTS).moodTrend).toEqual([]);

      const dense: InsightsEntryRow[] = [];
      for (let d = 1; d <= 30; d += 3) {
        dense.push(row({ created_at: daysAgoAt(d), mood: 'HAPPY' }));
      }
      const trend = computeInsightsStats(dense, OPTS).moodTrend;
      expect(trend.length).toBeGreaterThan(0);
      expect(trend[0].avg).not.toBeNull();
    });

    it('averages one mood sample per day (latest wins) in the trend', () => {
      const dense: InsightsEntryRow[] = [];
      for (let d = 2; d <= 30; d += 3) {
        dense.push(row({ created_at: daysAgoAt(d), mood: 'OKAY' }));
      }
      // Two moods on one day: morning AWFUL, evening AMAZING → day counts as AMAZING.
      dense.push(row({ created_at: daysAgoAt(1, 8), mood: 'AWFUL' }));
      dense.push(row({ created_at: daysAgoAt(1, 20), mood: 'AMAZING' }));

      const trend = computeInsightsStats(dense, OPTS).moodTrend;
      const week = startOfWeek(addDays(TODAY, -1), { weekStartsOn: 1 }).getTime();
      const point = trend.find((p) => p.weekStartMs === week);
      expect(point).toBeDefined();
      // The AMAZING(5) day must average against OKAY(3) days, never AWFUL(1).
      expect(point!.avg).toBeGreaterThanOrEqual(3);
    });
  });

  it('buckets entries by time of day', () => {
    const rows = [
      row({ created_at: daysAgoAt(1, 6) }),
      row({ created_at: daysAgoAt(1, 13) }),
      row({ created_at: daysAgoAt(2, 19) }),
      row({ created_at: daysAgoAt(2, 23) }),
      row({ created_at: daysAgoAt(3, 2) }),
    ];
    const stats = computeInsightsStats(rows, OPTS);
    expect(stats.timeOfDay).toEqual({
      morning: 1,
      afternoon: 1,
      evening: 1,
      night: 2,
    });
  });

  it('fills 12 months of volume with the current month last', () => {
    const rows = [
      row({ created_at: daysAgoAt(0) }),
      row({ created_at: daysAgoAt(0, 8) }),
      row({ created_at: daysAgoAt(45) }),
    ];
    const stats = computeInsightsStats(rows, OPTS);
    expect(stats.monthly).toHaveLength(12);
    expect(stats.monthly[11].count).toBe(2);
    const total = stats.monthly.reduce((sum, m) => sum + m.count, 0);
    expect(total).toBe(3);
  });

  it('extends monthly volume back to the first entry month', () => {
    const rows = [
      row({ created_at: new Date(2024, 2, 15, 12).getTime() }), // March 15 2024
      row({ created_at: daysAgoAt(0) }),
    ];
    const stats = computeInsightsStats(rows, OPTS);
    // March 2024 → July 2026 inclusive = 29 months, zero-filled between.
    expect(stats.monthly).toHaveLength(29);
    expect(stats.monthly[0].monthStartMs).toBe(new Date(2024, 2, 1).getTime());
    expect(stats.monthly[0].count).toBe(1);
    expect(stats.monthly[stats.monthly.length - 1].count).toBe(1);
    const total = stats.monthly.reduce((sum, m) => sum + m.count, 0);
    expect(total).toBe(2);
  });

  it('counts tags from the CSV column and caps the top list', () => {
    const rows = [
      row({ created_at: daysAgoAt(1), tags: 'a,b' }),
      row({ created_at: daysAgoAt(2), tags: 'a' }),
      row({ created_at: daysAgoAt(3), tags: 'a,c,d,e,f,g' }),
      row({ created_at: daysAgoAt(4), tags: '' }),
    ];
    const stats = computeInsightsStats(rows, OPTS);
    expect(stats.topTags).toHaveLength(5);
    expect(stats.topTags[0]).toEqual({ tagId: 'a', count: 3 });
  });

  it('sums words/chars and counts media, newest photos first', () => {
    const rows = [
      row({
        created_at: daysAgoAt(3),
        word_count: 10,
        char_count: 50,
        assets: [{ type: 'IMAGE', uri: 'photos/old.jpg' }],
      }),
      row({
        created_at: daysAgoAt(1),
        word_count: 5,
        char_count: 20,
        assets: [
          { type: 'IMAGE', uri: 'photos/new.jpg' },
          { type: 'AUDIO', uri: 'voice_memos/memo.m4a' },
        ],
      }),
    ];
    const stats = computeInsightsStats(rows, OPTS);
    expect(stats.totalWords).toBe(15);
    expect(stats.totalChars).toBe(70);
    expect(stats.photoCount).toBe(2);
    expect(stats.audioCount).toBe(1);
    expect(stats.recentPhotos.map((p) => p.uri)).toEqual([
      'photos/new.jpg',
      'photos/old.jpg',
    ]);
  });

  it('caps the photo mosaic list', () => {
    const rows: InsightsEntryRow[] = [];
    for (let d = 0; d < 15; d++) {
      rows.push(
        row({
          created_at: daysAgoAt(d),
          assets: [{ type: 'IMAGE', uri: `photos/p${d}.jpg` }],
        }),
      );
    }
    const stats = computeInsightsStats(rows, OPTS);
    expect(stats.recentPhotos).toHaveLength(MOSAIC_PHOTO_LIMIT);
    expect(stats.recentPhotos[0].uri).toBe('photos/p0.jpg');
  });
});
