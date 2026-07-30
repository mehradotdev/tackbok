import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, ChartColumn } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { AppLoadingScreen } from '~/components/AppLoadingScreen';
import { useInsightsStats } from './useInsightsStats';
import { InsightsSection } from './shared';
import { HeroTiles } from './HeroTiles';
import { ContributionHeatmap } from './ContributionHeatmap';
import { MoodSection } from './MoodSection';
import { MoodTrendLine } from './MoodTrendLine';
import { TimeOfDaySection } from './TimeOfDaySection';
import { MonthlyBars } from './MonthlyBars';
import { TopTagsSection } from './TopTagsSection';
import { CountsRow } from './CountsRow';
import { PhotoMosaic } from './PhotoMosaic';
import { OnThisDayCard } from './OnThisDayCard';

/** Minimum entries before the time-of-day histogram is meaningful. */
const TIME_OF_DAY_MIN_ENTRIES = 5;

export default function InsightsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const { stats, error } = useInsightsStats();

  return (
    <View className="flex-1 bg-background">
      {/* Header — mirrors the Settings screen */}
      <View className="flex-row items-center px-safe-or-4 pt-safe-or-3 pb-3 border-b border-border">
        <Button
          onPress={() => router.back()}
          variant="ghost"
          className="p-1 mr-1"
          accessibilityLabel={t('Back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text variant="h2" className="text-foreground py-1 font-heading">
          {t('Insights')}
        </Text>
      </View>

      {error ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-center text-destructive mb-2">
            {t('Failed to load entries')}
          </Text>
          <Text className="text-center text-muted-foreground">
            {error.message || t('Unknown error')}
          </Text>
        </View>
      ) : !stats ? (
        <AppLoadingScreen modal />
      ) : stats.totalEntries === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Icon
            as={ChartColumn}
            className="text-muted-foreground"
            size={40}
            strokeWidth={1.5}
          />
          <Text variant="large" className="text-center mt-3">
            {t('No insights yet')}
          </Text>
          <Text className="text-sm text-muted-foreground text-center mt-1">
            {t('Write a few entries and your stats will show up here.')}
          </Text>
        </View>
      ) : (
        <ScrollView className="px-safe">
          <View className="h-4" />
          <OnThisDayCard />

          <HeroTiles stats={stats} />

          <InsightsSection title={t('Totals')}>
            <CountsRow stats={stats} />
          </InsightsSection>

          <InsightsSection title={t('Consistency')}>
            <ContributionHeatmap weeks={stats.heatmapWeeks} hasMoods={stats.moodTotal > 0} />
          </InsightsSection>

          {stats.moodTotal > 0 && (
            <InsightsSection title={t('Mood')}>
              <MoodSection stats={stats} />
            </InsightsSection>
          )}

          {stats.moodTrend.length > 1 && (
            <InsightsSection title={t('Mood over time')}>
              <MoodTrendLine trend={stats.moodTrend} />
            </InsightsSection>
          )}

          <InsightsSection title={t('Entries per month')}>
            <MonthlyBars stats={stats} />
          </InsightsSection>

          {stats.totalEntries >= TIME_OF_DAY_MIN_ENTRIES && (
            <InsightsSection title={t('Writing habits')}>
              <TimeOfDaySection stats={stats} />
            </InsightsSection>
          )}

          <TopTagsSection stats={stats} />

          <PhotoMosaic stats={stats} />

          {/* Bottom spacing */}
          <View className="h-8" />
        </ScrollView>
      )}
    </View>
  );
}
