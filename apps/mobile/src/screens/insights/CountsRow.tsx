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
        label={t('insights.entries')}
      />
      <StatValue
        value={formatLocalizedNumber(isCJK ? stats.totalChars : stats.totalWords, locale)}
        label={isCJK ? t('insights.characters') : t('insights.words')}
      />
      <StatValue
        value={formatLocalizedNumber(stats.photoCount, locale)}
        label={t('insights.photos')}
      />
      <StatValue
        value={formatLocalizedNumber(stats.audioCount, locale)}
        label={t('insights.voiceMemos')}
      />
    </View>
  );
}
