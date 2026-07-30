import { View } from 'react-native';
import { useTagMapping } from '~/hooks/useGratitude';
import { formatLocalizedNumber, useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { InsightsStats } from '~/lib/insights';
import { InsightsSection } from './shared';

/** The five most-used tags as labeled horizontal bars. Self-gating. */
export function TopTagsSection({ stats }: { stats: InsightsStats }) {
  const { t, locale } = useTranslation();
  const tagMap = useTagMapping();

  // Drop ids whose tag record no longer exists (deleted tags leave no title).
  const rows = stats.topTags
    .map((tag) => ({ ...tag, title: tagMap.get(tag.tagId)?.title }))
    .filter((tag): tag is typeof tag & { title: string } => !!tag.title);

  if (rows.length === 0) return null;
  const maxCount = Math.max(...rows.map((tag) => tag.count), 1);

  return (
    <InsightsSection title={t('Top tags')}>
      <View className="gap-2.5">
      {rows.map((tag) => (
        <View key={tag.tagId} className="flex-row items-center gap-2">
          <Text
            className="text-sm text-foreground w-24 font-body-medium"
            numberOfLines={1}>
            {tag.title}
          </Text>
          <View className="flex-1 h-3 rounded-full bg-muted/40 overflow-hidden">
            <View
              className="h-3 rounded-full bg-primary"
              style={{ width: `${Math.max((tag.count / maxCount) * 100, 4)}%` }}
            />
          </View>
          <Text className="text-xs text-muted-foreground w-8 text-right">
            {formatLocalizedNumber(tag.count, locale)}
          </Text>
        </View>
      ))}
      </View>
    </InsightsSection>
  );
}
