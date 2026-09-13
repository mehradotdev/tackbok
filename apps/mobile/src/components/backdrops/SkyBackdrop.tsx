import { useCallback, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Rect,
  Shader,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useFocusEffect } from 'expo-router';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { SKY_SHADER } from './sky-shader';

const skyEffect = Skia.RuntimeEffect.Make(SKY_SHADER);
export type SkyMode = 'day' | 'night';

function rgb(color: string) {
  const value = Skia.Color(color);
  return [value[0], value[1], value[2]];
}

/** Soft, narrow leaves on curved stems, in a shared 100 × 100 art space. */
function foliagePath() {
  let path = '';
  for (let i = 0; i < 9; i++) {
    const base = 4 + i * 11;
    const height = 22 + ((i * 17) % 29);
    const bend = i % 2 === 0 ? -11 : 13;
    path += `M ${base} 106 Q ${base + bend * 0.25} ${100 - height * 0.6} ${base + bend} ${100 - height}`;
    for (let j = 1; j <= 5; j++) {
      const t = j / 6;
      const x = base + bend * t * t;
      const y = 103 - height * t;
      const side = j % 2 ? -1 : 1;
      const length = 5.5 - t * 2;
      path += ` M ${x} ${y} Q ${x + side * length} ${y - 7} ${x + side * length * 1.6} ${y - 5}`;
      path += ` Q ${x + side * length} ${y + 1} ${x} ${y} Z`;
    }
  }
  return path;
}

/** Static previews use this same scene, with explicit mode and scoped colors. */
export function SkyBackdrop({
  mode,
  preview = false,
}: {
  mode: SkyMode;
  preview?: boolean;
}) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const [background, accent, primary, foreground] = useCSSVariable([
    '--color-background',
    '--color-accent',
    '--color-primary',
    '--color-foreground',
  ]) as [string, string, string, string];
  const night = mode === 'night';
  const colors = useMemo(
    () => ({
      sky: rgb(background),
      cloud: rgb(accent),
      light: rgb(night ? foreground : primary),
    }),
    [background, accent, primary, foreground, night],
  );
  const drift = useSharedValue(0);
  const sway = useSharedValue(0);
  const flight = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      const stop = () => {
        cancelAnimation(drift);
        cancelAnimation(sway);
        cancelAnimation(flight);
      };
      if (preview || reducedMotion) {
        stop();
        drift.value = 0;
        sway.value = 0;
        flight.value = 0;
        return stop;
      }
      const start = () => {
        stop();
        drift.value = withRepeat(
          withTiming(1, { duration: 48000, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        );
        sway.value = withRepeat(
          withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        );
        if (!night) {
          flight.value = 0;
          flight.value = withRepeat(
            withTiming(1, { duration: 52000, easing: Easing.linear }),
            -1,
            false,
          );
        }
      };
      if (AppState.currentState === 'active') start();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') start();
        else stop();
      });
      return () => {
        subscription.remove();
        stop();
      };
    }, [preview, reducedMotion, night, drift, sway, flight]),
  );

  const uniforms = useDerivedValue(() => ({
    size: [Math.max(1, width), Math.max(1, height)],
    drift: drift.value,
    night: night ? 1 : 0,
    crescent: 0,
    ...colors,
  }));
  const foliage = useMemo(() => foliagePath(), []);
  const shortSide = Math.min(width, height);
  const foliageHeight = Math.min(height * 0.47, width * 0.72);
  const leftTransform = useDerivedValue(() => [
    { translateX: -width * 0.12 },
    { translateY: height - foliageHeight },
    { scaleX: width * 0.007 },
    { scaleY: foliageHeight * 0.01 },
    { skewX: (sway.value - 0.5) * 0.035 },
  ]);
  const rightTransform = useDerivedValue(() => [
    { translateX: width * 1.12 },
    { translateY: height - foliageHeight * 1.2 },
    { scaleX: -width * 0.006 },
    { scaleY: foliageHeight * 0.012 },
    { skewX: (0.5 - sway.value) * 0.045 },
  ]);
  const birdTransform = useDerivedValue(() => {
    // Only a short flyover in each 52-second cycle; wrap happens off-canvas.
    const progress = (flight.value - 0.35) / 0.18;
    return [
      { translateX: -30 + progress * (width + 60) },
      { translateY: height * 0.32 - Math.sin(progress * Math.PI) * height * 0.045 },
      { scaleX: shortSide * 0.0015 },
      { scaleY: shortSide * 0.0015 * (0.5 + Math.sin(flight.value * 650) * 0.5) },
    ];
  });
  const birdOpacity = useDerivedValue(() =>
    flight.value > 0.35 && flight.value < 0.53 ? 0.5 : 0,
  );

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        )
      }>
      {width > 0 && height > 0 && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Rect x={0} y={0} width={width} height={height}>
            {skyEffect ? (
              <Shader source={skyEffect} uniforms={uniforms} />
            ) : (
              <LinearGradient
                start={vec(0, 0)}
                end={vec(width, height)}
                colors={[background, accent]}
              />
            )}
          </Rect>
          {!skyEffect && (
            <Circle
              cx={width - shortSide * 0.185}
              cy={Math.max(shortSide * 0.158, height * 0.17)}
              r={shortSide * 0.088}
              color={night ? foreground : primary}
            />
          )}
          <Group opacity={night ? 0.16 : 0.12} transform={leftTransform}>
            <Path
              path={foliage}
              color={night ? accent : foreground}
              style="stroke"
              strokeWidth={0.7}>
              <BlurMask blur={1.1} style="normal" />
            </Path>
            <Path path={foliage} color={night ? accent : foreground}>
              <BlurMask blur={1.1} style="normal" />
            </Path>
          </Group>
          <Group opacity={night ? 0.24 : 0.18} transform={rightTransform}>
            <Path
              path={foliage}
              color={night ? accent : foreground}
              style="stroke"
              strokeWidth={0.8}>
              <BlurMask blur={0.8} style="normal" />
            </Path>
            <Path path={foliage} color={night ? accent : foreground}>
              <BlurMask blur={0.8} style="normal" />
            </Path>
          </Group>
          {!night && !preview && !reducedMotion && (
            <Group transform={birdTransform} opacity={birdOpacity}>
              <Path
                path="M -15 -5 Q -7 -11 0 0 Q 7 -11 15 -5"
                color={foreground}
                style="stroke"
                strokeWidth={1.8}
                strokeCap="round"
              />
            </Group>
          )}
        </Canvas>
      )}
    </View>
  );
}

export function HelenaBackdrop({ preview }: { preview?: boolean }) {
  return <SkyBackdrop mode="day" preview={preview} />;
}
export function PoonamBackdrop({ preview }: { preview?: boolean }) {
  return <SkyBackdrop mode="night" preview={preview} />;
}
