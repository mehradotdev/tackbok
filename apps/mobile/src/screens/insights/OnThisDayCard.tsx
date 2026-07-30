import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { startOfDay, subMonths, subYears } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { cn } from 'tailwind-variants';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { getEntriesForDay } from '~/db/queries';
import { QUERY_KEYS } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import type { Entry } from '~/types';
import { InsightsSection } from './shared';

/** How many yearly anniversaries to look back (1..N years ago today). */
const LOOKBACK_YEARS = 5;

interface LookBack {
  dateMs: number;
  /** 0 = one month ago; otherwise the number of years back. */
  yearsAgo: number;
  entries: Entry[];
}

function entryPreview(entry: Entry, fallback: string): string {
  return entry.text_title?.trim() || entry.text_content?.trim() || fallback;
}

/**
 * "On this day" look-backs: one month ago plus every yearly anniversary with
 * entries. Renders nothing (not even the section shell) when no day matches.
 */
export function OnThisDayCard() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  const targets = useMemo(() => {
    const today = startOfDay(new Date());
    return [
      { dateMs: subMonths(today, 1).getTime(), yearsAgo: 0 },
      ...Array.from({ length: LOOKBACK_YEARS }, (_, index) => ({
        dateMs: subYears(today, index + 1).getTime(),
        yearsAgo: index + 1,
      })),
    ];
  }, []);

  const { data: lookBacks } = useQuery({
    // Keying by the month-ago day pins the whole target set to "today"; the
    // shared `entries` prefix keeps it invalidated by every entry mutation.
    queryKey: [QUERY_KEYS.entries, 'onThisDay', targets[0].dateMs],
    queryFn: async (): Promise<LookBack[]> => {
      const results = await Promise.all(
        targets.map(async (target) => ({
          ...target,
          entries: await getEntriesForDay(target.dateMs),
        })),
      );
      return results.filter((result) => result.entries.length > 0);
    },
  });

  if (!lookBacks || lookBacks.length === 0) return null;

  const labelFor = (lookBack: LookBack): string => {
    if (lookBack.yearsAgo === 0) return t('One month ago today');
    if (lookBack.yearsAgo === 1) return t('One year ago today');
    return t('{count} years ago today', { count: lookBack.yearsAgo });
  };

  return (
    <InsightsSection title={t('On this day')} contentClassName="p-0">
      {lookBacks.map((lookBack, index) => (
        <Pressable
          key={lookBack.dateMs}
          accessibilityRole="button"
          className={cn(
            'p-4 flex-row items-center gap-3 active:bg-active-overlay',
            index < lookBacks.length - 1 && 'border-b border-border',
          )}
          onPress={() =>
            router.push({
              pathname: '/dateEntries/[dateMs]',
              params: { dateMs: lookBack.dateMs.toString() },
            })
          }>
          <Text className="text-2xl">{lookBack.yearsAgo === 0 ? '🕰️' : '🎂'}</Text>
          <View className="flex-1">
            <Text className="text-sm font-body-semibold text-foreground">
              {labelFor(lookBack)}
            </Text>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {formatLocalizedDate(lookBack.dateMs, t)}
            </Text>
            <Text className="text-sm text-foreground mt-1.5" numberOfLines={2}>
              {entryPreview(lookBack.entries[0], t('A moment from this day'))}
            </Text>
          </View>
          <Icon
            as={isRTL ? ChevronLeft : ChevronRight}
            className="text-muted-foreground"
            size={18}
          />
        </Pressable>
      ))}
    </InsightsSection>
  );
}
