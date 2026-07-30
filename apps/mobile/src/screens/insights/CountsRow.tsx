import { View } from 'react-native';
import { formatLocalizedNumber, useTranslation } from '~/lib/i18n';
import type { InsightsStats } from '~/lib/insights';
import { StatValue } from './shared';

/** Volume totals: entries · words · photos · voice memos. */
export function CountsRow({ stats }: { stats: InsightsStats }) {
  const { t, locale } = useTranslation();

  // Chinese has no whitespace-separated words — character count is the
  // meaningful "how much did I write" number there.
  const isCJK = locale.startsWith('zh');

  return (
    <View className="flex-row justify-between">
      <StatValue
        value={formatLocalizedNumber(stats.totalEntries, locale)}
        label={t('Entries')}
      />
      <StatValue
        value={formatLocalizedNumber(isCJK ? stats.totalChars : stats.totalWords, locale)}
        label={isCJK ? t('Characters') : t('Words')}
      />
      <StatValue value={formatLocalizedNumber(stats.photoCount, locale)} label={t('Photos')} />
      <StatValue
        value={formatLocalizedNumber(stats.audioCount, locale)}
        label={t('Voice memos')}
      />
    </View>
  );
}
