import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { InsightsStats } from '~/lib/insights';
import { InsightsSectionTitle } from './shared';

const RING_SIZE = 64;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** EMA "gratitude score" as a progress ring with the % in the center. */
function ScoreRing({ score }: { score: number }) {
  const [primary, muted] = useCSSVariable(['--color-primary', '--color-muted']);
  const clamped = Math.min(Math.max(score, 0), 1);
  const center = RING_SIZE / 2;

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          stroke={String(muted)}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          stroke={String(primary)}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE * clamped} ${RING_CIRCUMFERENCE}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-sm font-body-bold text-foreground">
          {Math.round(clamped * 100)}%
        </Text>
      </View>
    </View>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-card rounded-lg border-theme border-border shadow-theme p-3 items-center justify-center min-h-28">
      {children}
    </View>
  );
}

function TileCaption({ label }: { label: string }) {
  return (
    <Text className="text-xs text-muted-foreground text-center mt-1.5" numberOfLines={2}>
      {label}
    </Text>
  );
}

function StreakTile({
  emoji,
  value,
  label,
}: {
  emoji: string;
  value: number;
  label: string;
}) {
  return (
    <Tile>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-2xl">{emoji}</Text>
        <Text className="text-3xl font-body-bold text-foreground">
          {value.toLocaleString()}
        </Text>
      </View>
      <TileCaption label={label} />
    </Tile>
  );
}

export function HeroTiles({ stats }: { stats: InsightsStats }) {
  const { t } = useTranslation();

  return (
    <View className="px-4 mb-6">
      <InsightsSectionTitle title={t('Overview')} />
      <View className="gap-2">
      <View className="flex-row gap-2">
        <Tile>
          <ScoreRing score={stats.score} />
          <TileCaption label={t('Gratitude score')} />
        </Tile>
        <StreakTile emoji="🔥" value={stats.currentStreak} label={t('Current streak')} />
      </View>
      <View className="flex-row gap-2">
        <StreakTile emoji="🏆" value={stats.longestStreak} label={t('Longest streak')} />
        <StreakTile emoji="📖" value={stats.daysJournaled} label={t('Days journaled')} />
      </View>
      </View>
    </View>
  );
}
