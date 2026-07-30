import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInsightsEntryRows } from '~/db/queries';
import { useSettingsStore } from '~/lib/settings';
import {
  computeInsightsStats,
  firstDayToWeekStartsOn,
  type InsightsStats,
} from '~/lib/insights';
import { QUERY_KEYS } from '~/hooks/useGratitude';

/**
 * Loads the lightweight insights projection and derives all screen stats.
 * Shares the `entries` query-key prefix, so every entry mutation
 * (create/edit/delete/import) invalidates it automatically.
 */
export function useInsightsStats(): {
  stats: InsightsStats | null;
  error: Error | null;
} {
  const firstDayOfWeek = useSettingsStore((s) => s.firstDayOfWeek);

  const query = useQuery({
    queryKey: [QUERY_KEYS.entries, 'insights'],
    queryFn: getInsightsEntryRows,
  });

  const stats = useMemo(() => {
    if (!query.data) return null;
    return computeInsightsStats(query.data, {
      now: new Date(),
      weekStartsOn: firstDayToWeekStartsOn(firstDayOfWeek),
    });
  }, [query.data, firstDayOfWeek]);

  return { stats, error: query.error };
}
