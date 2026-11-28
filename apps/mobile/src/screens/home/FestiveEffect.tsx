import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { Sparkle } from 'lucide-react-native';
import { Icon } from '~/components/ui/icon';
import type { SeasonalEffect } from '~/lib/seasonal/events';

// The festive greeting is the header's second message, shown while the
// greeting clock (progress, in ms) runs from about 1840 to 3600. Every particle
// is gone by END, before the header controls fade back in.
const START = 1840;
const END = 3600;
const SNOWFLAKES = 18;
const SPARKLES = 10;

/** Stable pseudo-random spread so every launch looks the same and tests stay deterministic. */
const spread = (index: number, salt: number) => ((index * 37 + salt * 61) % 100) / 100;

/**
 * A brief decoration behind a special day's greeting: falling snow or popping
 * sparkles in the header's foreground colour. Decorative only, so it is hidden
 * from screen readers; the caller skips it under Reduce Motion.
 */
export function FestiveEffect({
  kind,
  progress,
}: {
  kind: SeasonalEffect;
  progress: SharedValue<number>;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const count = kind === 'snow' ? SNOWFLAKES : SPARKLES;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0"
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        )
      }>
      {size.width > 0 &&
        Array.from({ length: count }, (_, index) =>
          kind === 'snow' ? (
            <Snowflake key={index} index={index} progress={progress} {...size} />
          ) : (
            <SparklePop key={index} index={index} progress={progress} {...size} />
          ),
        )}
    </View>
  );
}

type ParticleProps = {
  index: number;
  progress: SharedValue<number>;
  width: number;
  height: number;
};

function Snowflake({ index, progress, width, height }: ParticleProps) {
  const diameter = 3.5 + (index % 3) * 1.25;
  const x = spread(index, 1) * width;
  const begin = START + spread(index, 2) * 400;
  const duration = Math.min(1000 + spread(index, 3) * 400, END - begin);
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (progress.value - begin) / duration));
    const fade = Math.min(1, t / 0.15, (1 - t) / 0.25);
    return {
      opacity: t <= 0 || t >= 1 ? 0 : 0.85 * fade,
      transform: [
        { translateX: x + Math.sin(t * Math.PI * 2 + index) * 6 },
        { translateY: -diameter + (height + diameter * 2) * t },
      ],
    };
  });
  return (
    <Animated.View
      className="absolute rounded-full bg-header-foreground"
      style={[{ width: diameter, height: diameter, left: 0, top: 0 }, style]}
    />
  );
}

function SparklePop({ index, progress, width, height }: ParticleProps) {
  // Lucide's currentColor only reaches the stroke, so fill with the token directly.
  const color = useCSSVariable('--color-header-foreground') as string;
  const glyph = 14 + (index % 3) * 4;
  const x = (0.06 + 0.88 * spread(index, 4)) * width - glyph / 2;
  const y = (0.15 + 0.7 * spread(index, 5)) * height - glyph / 2;
  const begin = START + index * 120;
  const duration = 650;
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (progress.value - begin) / duration));
    const pop = Math.sin(t * Math.PI);
    return {
      opacity: t <= 0 || t >= 1 ? 0 : pop,
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: 0.4 + 0.6 * pop },
        { rotate: `${t * 90}deg` },
      ],
    };
  });
  return (
    <Animated.View className="absolute" style={[{ left: 0, top: 0 }, style]}>
      <Icon as={Sparkle} size={glyph} color={color} fill={color} />
    </Animated.View>
  );
}
