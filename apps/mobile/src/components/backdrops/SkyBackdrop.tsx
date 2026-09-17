import { useCallback, useMemo, useState } from 'react';
import { AppState, Keyboard, StyleSheet, View } from 'react-native';
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
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { MEADOW_PALETTES } from '~/lib/theme/theme-tokens';
import { MEADOW_SKY_SHADER } from './meadow-sky-shader';
import {
  bladeBend,
  meadowBlades,
  meadowPath,
  DRAGONFLY_BODY,
  DRAGONFLY_WINGS,
  MOTH_BODY,
  MOTH_WINGS,
  type MeadowBlade,
} from './meadow-art';

const skyEffect = Skia.RuntimeEffect.Make(MEADOW_SKY_SHADER);
export type SkyMode = 'day' | 'night';
const rgb = (color: string) => Array.from(Skia.Color(color)).slice(0, 3);

function GrassLayer({
  blades,
  time,
  color,
  blur,
}: {
  blades: MeadowBlade[];
  time: SharedValue<number>;
  color: string;
  blur: number;
}) {
  const path = useDerivedValue(() => meadowPath(blades, time.value));
  return (
    <Path path={path} color={color}>
      <BlurMask blur={blur} style="normal" />
    </Path>
  );
}

/** A single measured canvas serves phone/tablet screens and still picker cards. */
export function SkyBackdrop({
  mode,
  preview = false,
}: {
  mode: SkyMode;
  preview?: boolean;
}) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const background = useCSSVariable('--color-background') as string;
  const night = mode === 'night';
  const palette = MEADOW_PALETTES[mode];
  const colors = useMemo(
    () => ({
      sky: rgb(background),
      cloud: rgb(palette.cloud),
      light: rgb(palette.light),
    }),
    [background, palette],
  );
  const layers = useMemo(
    () =>
      [0, 1, 2].map((layer) =>
        meadowBlades(Math.max(1, width), Math.max(1, height), layer),
      ),
    [width, height],
  );
  const time = useSharedValue(0);
  const running = useSharedValue(false);
  const visitorStart = useSharedValue(-100);
  const duration = useSharedValue(10);
  const direction = useSharedValue(1);
  const targets = useSharedValue([3, 6, 9]);
  const visible = useSharedValue(false);
  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    if (running.value) time.value += Math.min(timeSincePreviousFrame ?? 0, 50) / 1000;
  }, false);

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let keyboardOpen = Keyboard.isVisible();
      let active = AppState.currentState === 'active';
      let disposed = false;
      const clearVisit = () => {
        clearTimeout(timer);
        visible.value = false;
      };
      const schedule = () => {
        clearVisit();
        if (disposed || !active || keyboardOpen || preview || reducedMotion) return;
        timer = setTimeout(
          () => {
            direction.value = Math.random() < 0.5 ? 1 : -1;
            duration.value = 8 + Math.random() * 4;
            // Pick two or three actual foreground stems, ordered across the meadow.
            const count = Math.random() < 0.5 ? 2 : 3;
            const n = layers[2].length;
            const selected = Array.from({ length: count }, (_, i) =>
              Math.min(
                n - 4,
                Math.max(
                  3,
                  Math.floor((0.16 + ((i + Math.random() * 0.5) / count) * 0.7) * n),
                ),
              ),
            );
            targets.value = direction.value > 0 ? selected : selected.reverse();
            visitorStart.value = time.value;
            visible.value = true;
            timer = setTimeout(schedule, duration.value * 1000);
          },
          10000 + Math.random() * 10000,
        );
      };
      const start = () => {
        running.value = !preview && !reducedMotion && active;
        frame.setActive(running.value);
        schedule();
      };
      start();
      const app = AppState.addEventListener('change', (state) => {
        active = state === 'active';
        start();
      });
      const show = Keyboard.addListener('keyboardDidShow', () => {
        keyboardOpen = true;
        clearVisit();
      });
      const hide = Keyboard.addListener('keyboardDidHide', () => {
        keyboardOpen = false;
        schedule();
      });
      return () => {
        disposed = true;
        clearVisit();
        running.value = false;
        frame.setActive(false);
        app.remove();
        show.remove();
        hide.remove();
      };
    }, [
      preview,
      reducedMotion,
      layers,
      frame,
      running,
      time,
      visible,
      visitorStart,
      duration,
      direction,
      targets,
    ]),
  );

  const uniforms = useDerivedValue(() => ({
    size: [Math.max(1, width), Math.max(1, height)],
    time: time.value,
    night: night ? 1 : 0,
    crescent: 0,
    ...colors,
  }));
  const unit = Math.min(width, height, 620);
  const creatureScale = Math.max(0.25, unit / 520);
  const visitorTransform = useDerivedValue(() => {
    const progress = Math.max(
      0,
      Math.min(1, (time.value - visitorStart.value) / duration.value),
    );
    const points = targets.value.map((index) => {
      const blade = layers[2][Math.min(index, layers[2].length - 1)];
      return {
        x: blade.x + bladeBend(blade, time.value),
        y: blade.base - blade.height - unit * 0.035,
      };
    });
    const start = { x: direction.value > 0 ? -40 : width + 40, y: height * 0.78 };
    const end = { x: direction.value > 0 ? width + 40 : -40, y: height * 0.8 };
    const route = [start, ...points, end];
    const step = progress * (route.length - 1);
    const index = Math.min(route.length - 2, Math.floor(step));
    // Arrive early in each segment, then hover before moving to the next tip.
    const fraction = Math.min(1, (step - index) / 0.62);
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const from = route[index],
      to = route[index + 1];
    return [
      {
        translateX:
          from.x + (to.x - from.x) * smooth + Math.sin(time.value * 4) * unit * 0.003,
      },
      {
        translateY:
          from.y + (to.y - from.y) * smooth + Math.sin(time.value * 5.3) * unit * 0.004,
      },
      { scale: creatureScale },
      { rotate: direction.value * 0.18 },
    ];
  });
  const wingTransform = useDerivedValue(() => [
    { scaleX: 0.3 + Math.abs(Math.sin(time.value * (night ? 44 : 66))) * 0.7 },
  ]);
  const visitorOpacity = useDerivedValue(() => {
    const t = (time.value - visitorStart.value) / duration.value;
    return visible.value && t >= 0 && t < 1 ? Math.min(1, t * 15, (1 - t) * 15) * 0.7 : 0;
  });

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
                end={vec(0, height)}
                colors={[background, palette.cloud]}
              />
            )}
          </Rect>
          {!skyEffect && (
            <Circle
              cx={width - unit * 0.185}
              cy={Math.max(unit * 0.158, height * 0.17)}
              r={unit * 0.088}
              color={palette.light}
            />
          )}
          <Rect x={0} y={height * 0.72} width={width} height={height * 0.28}>
            <LinearGradient
              start={vec(0, height * 0.72)}
              end={vec(0, height)}
              colors={['transparent', palette.distant]}
            />
          </Rect>
          <GrassLayer
            blades={layers[0]}
            time={time}
            color={palette.distant}
            blur={unit * 0.005}
          />
          <GrassLayer
            blades={layers[1]}
            time={time}
            color={palette.middle}
            blur={unit * 0.002}
          />
          <GrassLayer
            blades={layers[2]}
            time={time}
            color={palette.grass}
            blur={unit * 0.0008}
          />
          <Group opacity={0.22}>
            <GrassLayer
              blades={layers[2].filter((_, i) => i % 4 === 0)}
              time={time}
              color={palette.highlight}
              blur={0.5}
            />
          </Group>
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            color={palette.wash}
            opacity={palette.washOpacity}
          />
          {!preview && !reducedMotion && (
            <Group transform={visitorTransform} opacity={visitorOpacity}>
              <Group transform={wingTransform}>
                <Path path={night ? MOTH_WINGS : DRAGONFLY_WINGS} color={palette.visitor}>
                  <BlurMask blur={0.9} style="normal" />
                </Path>
              </Group>
              <Path path={night ? MOTH_BODY : DRAGONFLY_BODY} color={palette.visitor}>
                <BlurMask blur={0.65} style="normal" />
              </Path>
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
