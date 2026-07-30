import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import type { MoodTrendPoint } from '~/lib/insights';

const CHART_HEIGHT = 120;
const PAD_LEFT = 26; // room for the emoji axis
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;

/** Score gridlines (and their emoji labels) from best to worst. */
const AXIS_MARKS = [
  { score: 5, emoji: '🤩' },
  { score: 3, emoji: '😐' },
  { score: 1, emoji: '😢' },
];

function scoreToY(score: number): number {
  return PAD_TOP + ((5 - score) / 4) * (CHART_HEIGHT - PAD_TOP - PAD_BOTTOM);
}

/**
 * Weekly-average mood as a line chart. Weeks without a recorded mood create
 * gaps — the line only connects consecutive weeks with data.
 */
export function MoodTrendLine({ trend }: { trend: MoodTrendPoint[] }) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const [primary, border] = useCSSVariable(['--color-primary', '--color-border']);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  if (trend.length < 2) return null;

  const innerWidth = Math.max(width - PAD_LEFT - PAD_RIGHT, 0);
  const pointX = (index: number) =>
    PAD_LEFT + (trend.length === 1 ? 0 : (index / (trend.length - 1)) * innerWidth);

  // Split into runs of consecutive non-null weeks.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  trend.forEach((point, index) => {
    if (point.avg === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: pointX(index), y: scoreToY(point.avg) });
  });
  if (current.length > 0) segments.push(current);

  return (
    <View>
      <View onLayout={handleLayout} style={{ height: CHART_HEIGHT }}>
        {width > 0 && (
          <>
            <Svg width={width} height={CHART_HEIGHT}>
              {AXIS_MARKS.map((mark) => (
                <Line
                  key={mark.score}
                  x1={PAD_LEFT}
                  y1={scoreToY(mark.score)}
                  x2={width - PAD_RIGHT}
                  y2={scoreToY(mark.score)}
                  stroke={String(border)}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity={0.6}
                />
              ))}
              {segments.map((segment, segmentIndex) =>
                segment.length === 1 ? (
                  <Circle
                    key={`seg-${segmentIndex}`}
                    cx={segment[0].x}
                    cy={segment[0].y}
                    r={3}
                    fill={String(primary)}
                  />
                ) : (
                  <Polyline
                    key={`seg-${segmentIndex}`}
                    points={segment.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={String(primary)}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
              )}
              {segments.flatMap((segment, segmentIndex) =>
                segment.map((point, pointIndex) => (
                  <Circle
                    key={`dot-${segmentIndex}-${pointIndex}`}
                    cx={point.x}
                    cy={point.y}
                    r={2.5}
                    fill={String(primary)}
                  />
                )),
              )}
            </Svg>
            {AXIS_MARKS.map((mark) => (
              <Text
                key={mark.emoji}
                className="absolute text-sm"
                style={{ left: 0, top: scoreToY(mark.score) - 9 }}>
                {mark.emoji}
              </Text>
            ))}
          </>
        )}
      </View>
      <View className="flex-row justify-between mt-1" style={{ paddingLeft: PAD_LEFT }}>
        <Text className="text-[10px] text-muted-foreground">
          {formatLocalizedDate(trend[0].weekStartMs, t)}
        </Text>
        <Text className="text-[10px] text-muted-foreground">
          {formatLocalizedDate(trend[trend.length - 1].weekStartMs, t)}
        </Text>
      </View>
    </View>
  );
}
