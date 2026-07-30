import { View } from 'react-native';
import { useTranslation } from '~/lib/i18n';
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
      <StatValue value={stats.totalEntries.toLocaleString()} label={t('Entries')} />
      <StatValue
        value={(isCJK ? stats.totalChars : stats.totalWords).toLocaleString()}
        label={isCJK ? t('Characters') : t('Words')}
      />
      <StatValue value={stats.photoCount.toLocaleString()} label={t('Photos')} />
      <StatValue value={stats.audioCount.toLocaleString()} label={t('Voice memos')} />
    </View>
  );
}
