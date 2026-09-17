import { useCallback, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
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
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { CAMINO_SKY_SHADER } from './camino-sky-shader';
import { CaminoLandscape } from './CaminoLandscape';

const skyEffect = Skia.RuntimeEffect.Make(CAMINO_SKY_SHADER);
function rgb(color: string) {
  const value = Skia.Color(color);
  return [value[0], value[1], value[2]];
}

function CaminoBackdrop({
  mode,
  preview = false,
}: {
  mode: 'day' | 'night';
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
  const flight = useSharedValue(-1);

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
        flight.value = -1;
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
          flight.value = -1;
          flight.value = withDelay(
            8000,
            withRepeat(
              withSequence(
                withTiming(0, { duration: 0 }),
                withTiming(1, { duration: 10000, easing: Easing.linear }),
              ),
              -1,
              false,
            ),
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
    shimmer: sway.value,
    ...colors,
  }));
  const shortSide = Math.min(width, height);
  const birdTransform = useDerivedValue(() => {
    // Six-second crossing in each ten-second cycle; reset off-canvas.
    const progress = flight.value / 0.6;
    return [
      { translateX: -shortSide * 0.14 + progress * (width + shortSide * 0.28) },
      { translateY: height * 0.32 - Math.sin(progress * Math.PI) * height * 0.045 },
      { scaleX: shortSide * 0.0015 },
      { scaleY: shortSide * 0.0015 * (0.5 + Math.sin(flight.value * 125) * 0.5) },
    ];
  });
  const birdOpacity = useDerivedValue(() =>
    flight.value >= 0 && flight.value < 0.6 ? 0.62 : 0,
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
          {!night && !preview && !reducedMotion && (
            <Group transform={birdTransform} opacity={birdOpacity}>
              <Path
                path="M -15 -5 Q -7 -11 0 0 Q 7 -11 15 -5 M -49 9 Q -43 4 -37 13 Q -31 4 -25 9 M -76 -14 Q -71 -19 -65 -11 Q -59 -19 -54 -14"
                color={foreground}
                style="stroke"
                strokeWidth={1.8}
                strokeCap="round"
              />
            </Group>
          )}
          <CaminoLandscape
            width={width}
            height={height}
            night={night}
            background={background}
            foreground={foreground}
            primary={primary}
          />
        </Canvas>
      )}
    </View>
  );
}
export function CaminoDayBackdrop({ preview }: { preview?: boolean }) {
  return <CaminoBackdrop mode="day" preview={preview} />;
}
export function CaminoNightBackdrop({ preview }: { preview?: boolean }) {
  return <CaminoBackdrop mode="night" preview={preview} />;
}
