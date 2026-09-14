import { useCallback, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  Rect,
  Shader,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useFocusEffect } from 'expo-router';
import type { SharedValue } from 'react-native-reanimated';
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
import { STONE_SHADER } from './stone-shader';
import { ShiroDogArt } from './ShiroDog';
import { useShiroMotion } from './useShiroMotion';
import { useShadowMotion } from './useShadowMotion';
import { ShadowCatArt } from './ShadowCat';

const skyEffect = Skia.RuntimeEffect.Make(SKY_SHADER);
const stoneEffect = Skia.RuntimeEffect.Make(STONE_SHADER);

function rgb(color: string) {
  const value = Skia.Color(color);
  return [value[0], value[1], value[2]];
}

export type PetMode = 'day' | 'night';

/** Blend two CSS colors; t=0 → a, t=1 → b. Returns an rgba() string. */
function mixColors(a: string, b: string, t: number) {
  const ca = Skia.Color(a);
  const cb = Skia.Color(b);
  const channel = (i: number) => Math.round((ca[i] + (cb[i] - ca[i]) * t) * 255);
  const alpha = ca[3] + (cb[3] - ca[3]) * t;
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${alpha})`;
}

/** Same color with a replaced alpha. */
function withAlpha(color: string, alpha: number) {
  const c = Skia.Color(color);
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(
    c[2] * 255,
  )}, ${alpha})`;
}

/** Filled lens-shaped leaf growing from (px, py) toward `angle` (from BotanicalBackdrop). */
function leaf(px: number, py: number, angle: number, length: number): string {
  const tipX = px + Math.cos(angle) * length;
  const tipY = py + Math.sin(angle) * length;
  const bulge = length * 0.36;
  const normalX = -Math.sin(angle) * bulge;
  const normalY = Math.cos(angle) * bulge;
  const midX = (px + tipX) / 2;
  const midY = (py + tipY) / 2;
  return (
    ` M ${px.toFixed(1)} ${py.toFixed(1)}` +
    ` Q ${(midX + normalX).toFixed(1)} ${(midY + normalY).toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}` +
    ` Q ${(midX - normalX).toFixed(1)} ${(midY - normalY).toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)} Z`
  );
}

const PETAL_PATH = 'M 0 -6 Q 4.5 -2 0 6 Q -4.5 -2 0 -6 Z';
const BUTTERFLY_PATH =
  'M 0 0 Q -13 -11 -15 -2 Q -14 6 0 1 Z M 0 0 Q 13 -11 15 -2 Q 14 6 0 1 Z';

function sparklePath(r: number) {
  return (
    `M 0 ${-r} Q ${r * 0.18} ${-r * 0.18} ${r} 0` +
    ` Q ${r * 0.18} ${r * 0.18} 0 ${r} Q ${-r * 0.18} ${r * 0.18} ${-r} 0` +
    ` Q ${-r * 0.18} ${-r * 0.18} 0 ${-r} Z`
  );
}

/* Night sky stars, as fractions of container size. Deterministic. */
const STARS = [
  { x: 0.1, y: 0.1, r: 1.4, phase: 0.0 },
  { x: 0.22, y: 0.3, r: 1.1, phase: 0.15 },
  { x: 0.34, y: 0.14, r: 1.6, phase: 0.31 },
  { x: 0.46, y: 0.38, r: 1.2, phase: 0.47 },
  { x: 0.56, y: 0.08, r: 1.5, phase: 0.55 },
  { x: 0.66, y: 0.26, r: 1.1, phase: 0.68 },
  { x: 0.16, y: 0.48, r: 1.3, phase: 0.77 },
  { x: 0.42, y: 0.55, r: 1.0, phase: 0.88 },
];
const SPARKLES = [
  { x: 0.28, y: 0.2, r: 3.4, phase: 0.2 },
  { x: 0.52, y: 0.46, r: 4.0, phase: 0.5 },
  { x: 0.72, y: 0.42, r: 3.0, phase: 0.75 },
  { x: 0.12, y: 0.36, r: 2.6, phase: 0.95 },
];

function TwinkleStar({
  x,
  y,
  r,
  phase,
  color,
  twinkle,
  sparkle = false,
}: {
  x: number;
  y: number;
  r: number;
  phase: number;
  color: string;
  twinkle: SharedValue<number>;
  sparkle?: boolean;
}) {
  const opacity = useDerivedValue(
    () => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((twinkle.value + phase) * Math.PI * 2)),
  );
  if (sparkle) {
    return (
      <Group transform={[{ translateX: x }, { translateY: y }]} opacity={opacity}>
        <Path path={sparklePath(r)} color={color} />
      </Group>
    );
  }
  return <Circle cx={x} cy={y} r={r} color={color} opacity={opacity} />;
}

function FallingPetal({
  width,
  height,
  offset,
  color,
  fall,
}: {
  width: number;
  height: number;
  offset: number;
  color: string;
  fall: SharedValue<number>;
}) {
  const transform = useDerivedValue(() => {
    const p = (fall.value + offset) % 1;
    const x =
      width * (0.15 + offset * 0.6) +
      Math.sin((p * 3 + offset * 7) * Math.PI * 2) * width * 0.045;
    const y = -0.06 * height + p * 1.15 * height;
    return [{ translateX: x }, { translateY: y }, { rotate: p * 5 + offset * 3 }];
  });
  const opacity = useDerivedValue(() => {
    const p = (fall.value + offset) % 1;
    if (p < 0.06) return (p / 0.06) * 0.85;
    if (p > 0.9) return Math.max(0, ((1 - p) / 0.1) * 0.85);
    return 0.85;
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={PETAL_PATH} color={color} />
    </Group>
  );
}

/** Static previews render this same scene frozen at rest, like SkyBackdrop. */
export function PetBackdrop({
  mode,
  preview = false,
}: {
  mode: PetMode;
  preview?: boolean;
}) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const night = mode === 'night';
  // Navigation and interaction contexts belong above the Canvas renderer.
  const dogMotion = useShiroMotion(preview || night);
  const catMotion = useShadowMotion(preview || !night);
  const [background, accent, primary, muted, border, card, ring, secondary] =
    useCSSVariable([
      '--color-background',
      '--color-accent',
      '--color-primary',
      '--color-muted',
      '--color-border',
      '--color-card',
      '--color-ring',
      '--color-secondary',
    ]) as [string, string, string, string, string, string, string, string];

  const colors = useMemo(
    () => ({
      sky: rgb(background),
      cloud: rgb(night ? mixColors(accent, card, 0.15) : accent),
      light: rgb(mixColors(primary, '#fff6da', night ? 0.7 : 0.5)),
      stone: rgb(mixColors(muted, night ? '#8993af' : '#87765e', night ? 0.3 : 0.27)),
      mortar: rgb(mixColors(border, night ? '#080f20' : '#655847', 0.5)),
      highlight: rgb(mixColors(border, card, night ? 0.15 : 0.58)),
      foliage: night ? mixColors(secondary, ring, 0.14) : ring,
      flowerPetal: mixColors(card, '#fff6e8', night ? 0.7 : 0.15),
      flowerCenter: primary,
      star: primary,
      petal: withAlpha(card, 0.85),
      petShadow: night ? '#080c19' : '#57482f',
    }),
    [background, accent, primary, muted, border, card, ring, secondary, night],
  );

  const drift = useSharedValue(0);
  const breathe = useSharedValue(0);
  const flight = useSharedValue(0);
  const twinkle = useSharedValue(0);
  const fall = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      const stop = () => {
        cancelAnimation(drift);
        cancelAnimation(breathe);
        cancelAnimation(flight);
        cancelAnimation(twinkle);
        cancelAnimation(fall);
      };
      if (preview || reducedMotion) {
        stop();
        drift.value = 0;
        breathe.value = 0;
        flight.value = 0;
        twinkle.value = 0;
        fall.value = 0;
        return stop;
      }
      const start = () => {
        stop();
        drift.value = withRepeat(
          withTiming(1, {
            duration: night ? 60000 : 48000,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true,
        );
        // Tiny breathing anchored at the paws, shared by both pet styles.
        breathe.value = withRepeat(
          withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        );
        twinkle.value = withRepeat(
          withTiming(1, { duration: 3200, easing: Easing.linear }),
          -1,
          false,
        );
        if (night) {
          // Shooting star: brief streak in each 70s cycle.
          flight.value = withRepeat(
            withTiming(1, { duration: 70000, easing: Easing.linear }),
            -1,
            false,
          );
        } else {
          // Butterfly hover/wing cycles share a 52s clock; petals use 16s.
          flight.value = withRepeat(
            withTiming(1, { duration: 52000, easing: Easing.linear }),
            -1,
            false,
          );
          fall.value = withRepeat(
            withTiming(1, { duration: 16000, easing: Easing.linear }),
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
    }, [preview, reducedMotion, night, drift, breathe, flight, twinkle, fall]),
  );

  const scene = useMemo(() => {
    const w = width;
    const h = height;
    const wallTop = h * 0.78;
    const mainVine =
      `M ${w + 8} ${h} C ${w * 0.98} ${h * 0.86}, ${w * 0.93} ${h * 0.76}, ${w * 0.94} ${h * 0.66}` +
      ` C ${w * 0.95} ${h * 0.58}, ${w * 0.88} ${h * 0.54}, ${w * 0.91} ${h * 0.47}`;
    const shortVine = `M ${w + 6} ${wallTop + 14} C ${w * 0.96} ${wallTop - 4}, ${w * 0.9} ${wallTop - 8}, ${w * 0.87} ${wallTop - 22}`;
    const leafSize = Math.min(w, h) * 0.028;
    const leaves =
      leaf(w * 0.965, h * 0.83, -0.9, leafSize * 1.2) +
      leaf(w * 0.925, h * 0.75, -2.2, leafSize) +
      leaf(w * 0.95, h * 0.68, -0.6, leafSize * 1.1) +
      leaf(w * 0.915, h * 0.6, -2.4, leafSize) +
      leaf(w * 0.9, h * 0.52, -0.8, leafSize * 0.9) +
      leaf(w * 0.06, h * 0.985, -1.9, leafSize) +
      leaf(w * 0.03, h * 0.96, -0.9, leafSize * 0.9);
    const flowers = [
      { cx: w * 0.94, cy: h * 0.71, r: leafSize * 0.42 },
      { cx: w * 0.9, cy: h * 0.565, r: leafSize * 0.36 },
      { cx: w * 0.958, cy: h * 0.86, r: leafSize * 0.4 },
      { cx: w * 0.045, cy: h * 0.93, r: leafSize * 0.34 },
    ];

    return { wallTop, mainVine, shortVine, leaves, flowers };
  }, [width, height]);

  const shortSide = Math.min(width, height);
  const cap = shortSide * 0.034;
  const skyUniforms = useDerivedValue(() => ({
    size: [Math.max(1, width), Math.max(1, height)],
    drift: drift.value,
    night: night ? 1 : 0,
    crescent: night ? 1 : 0,
    sky: colors.sky,
    cloud: colors.cloud,
    light: colors.light,
  }));
  const stoneUniforms = useMemo(
    () => ({
      size: [Math.max(1, width), Math.max(1, height)],
      wallY: scene.wallTop,
      cap,
      stone: colors.stone,
      mortar: colors.mortar,
      highlight: colors.highlight,
    }),
    [width, height, scene.wallTop, cap, colors],
  );
  const meteorTransform = useDerivedValue(() => {
    const progress = (flight.value - 0.8) / 0.022;
    const x = width * 0.18 + progress * width * 0.44;
    const y = height * 0.1 + progress * height * 0.16;
    return [{ translateX: x }, { translateY: y }, { rotate: Math.atan2(0.16, 0.44) }];
  });
  const meteorOpacity = useDerivedValue(() => {
    if (flight.value < 0.8 || flight.value > 0.822) return 0;
    return Math.sin(((flight.value - 0.8) / 0.022) * Math.PI) * 0.9;
  });

  // Source-image paw anchors preserve the cat's hanging tail and transparent margins.
  const imageAspect = night ? 1024 / 1536 : 1225 / 1284;
  const pawX = night ? 0.63 : 0.62;
  const pawY = night ? 0.785 : 0.968;
  const imageH = Math.min(
    height * (preview ? 0.43 : night ? 0.34 : 0.265),
    width * (night ? 0.85 : 0.62),
  );
  const imageW = imageH * imageAspect;
  const perchX = width * 0.58;
  const perchY = scene.wallTop + cap * 0.25;
  // A small butterfly hovers just above the upward-facing muzzle. Its orbit
  // closes over the existing 52s scene clock and stays responsive to pet size.
  const butterflyTransform = useDerivedValue(() => {
    const phase = flight.value * Math.PI * 20;
    const scale = shortSide * 0.0016;
    return [
      { translateX: perchX + imageW * 0.27 + Math.sin(phase) * shortSide * 0.025 },
      { translateY: perchY - imageH * 0.99 + Math.cos(phase) * shortSide * 0.015 },
      { rotate: -0.2 + Math.sin(phase) * 0.15 },
      { scaleX: scale },
      { scaleY: scale * (0.65 + 0.35 * Math.sin(flight.value * Math.PI * 400)) },
    ];
  });
  const petTransform = useDerivedValue(() => [
    { translateX: perchX },
    { translateY: perchY },
    { scaleY: 1 + breathe.value * 0.006 },
    { translateX: -imageW * pawX },
    { translateY: -imageH * pawY },
  ]);

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
          {/* Same diffuse-cloud shader as Helena/Poonam, with a crescent for Shadow. */}
          <Rect x={0} y={0} width={width} height={height}>
            {skyEffect ? (
              <Shader source={skyEffect} uniforms={skyUniforms} />
            ) : (
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, height)}
                colors={[background, accent]}
              />
            )}
          </Rect>
          {!skyEffect && (
            <Circle
              cx={width * 0.82}
              cy={height * 0.17}
              r={shortSide * 0.088}
              color={primary}
            />
          )}

          {/* Stars (night) */}
          {night &&
            STARS.map((s, i) => (
              <TwinkleStar
                key={`star-${i}`}
                x={s.x * width}
                y={s.y * height}
                r={s.r}
                phase={s.phase}
                color={colors.star}
                twinkle={twinkle}
              />
            ))}
          {night &&
            SPARKLES.map((s, i) => (
              <TwinkleStar
                key={`sparkle-${i}`}
                x={s.x * width}
                y={s.y * height}
                r={s.r}
                phase={s.phase}
                color={colors.star}
                twinkle={twinkle}
                sparkle
              />
            ))}

          {/* Projecting stone coping, textured blocks and recessed mortar. */}
          <Rect
            x={0}
            y={scene.wallTop - shortSide * 0.006}
            width={width}
            height={height - scene.wallTop + shortSide * 0.006}>
            {stoneEffect ? (
              <Shader source={stoneEffect} uniforms={stoneUniforms} />
            ) : (
              <LinearGradient
                start={vec(0, scene.wallTop)}
                end={vec(0, height)}
                colors={[border, muted]}
              />
            )}
          </Rect>

          {/* Ivy framing the right edge + small cluster bottom-left */}
          <Group opacity={night ? 0.8 : 0.95}>
            <Path
              path={scene.mainVine}
              color={colors.foliage}
              style="stroke"
              strokeWidth={3}
              strokeCap="round"
            />
            <Path
              path={scene.shortVine}
              color={colors.foliage}
              style="stroke"
              strokeWidth={2.5}
              strokeCap="round"
            />
            <Path path={scene.leaves} color={colors.foliage} />
            {scene.flowers.map((f, i) => (
              <Group key={i}>
                {[0, 1, 2, 3, 4].map((p) => (
                  <Circle
                    key={p}
                    cx={f.cx + Math.cos((p * Math.PI * 2) / 5 - Math.PI / 2) * f.r}
                    cy={f.cy + Math.sin((p * Math.PI * 2) / 5 - Math.PI / 2) * f.r}
                    r={f.r * 0.75}
                    color={colors.flowerPetal}
                  />
                ))}
                <Circle cx={f.cx} cy={f.cy} r={f.r * 0.5} color={colors.flowerCenter} />
              </Group>
            ))}
          </Group>

          {/* Contact shadow anchors the paws; the cat's tail hangs over the face. */}
          <>
            <Oval
              x={perchX - imageW * 0.23}
              y={perchY - 2}
              width={imageW * 0.46}
              height={shortSide * 0.023}
              color={colors.petShadow}
              opacity={0.45}>
              <BlurMask blur={shortSide * 0.007} style="normal" />
            </Oval>
            <Group transform={petTransform}>
              {night ? (
                <Group transform={[{ scale: imageW / 1024 }]}>
                  <ShadowCatArt {...catMotion} />
                </Group>
              ) : (
                <Group transform={[{ scale: imageW / 1225 }]}>
                  <ShiroDogArt {...dogMotion} />
                </Group>
              )}
            </Group>
          </>

          {/* Falling petals (day) */}
          {!night &&
            [0, 0.3, 0.55, 0.8].map((offset) => (
              <FallingPetal
                key={offset}
                width={width}
                height={height}
                offset={offset}
                color={colors.petal}
                fall={fall}
              />
            ))}

          {/* Butterfly companion (day, hidden in previews / reduced motion) */}
          {!night && !preview && !reducedMotion && (
            <Group transform={butterflyTransform} opacity={0.95}>
              <Path path={BUTTERFLY_PATH} color={accent} />
              <Path
                path="M 0 -3 L 0 4"
                color={border}
                style="stroke"
                strokeWidth={1.6}
                strokeCap="round"
              />
            </Group>
          )}

          {/* Shooting star (night, not in previews / reduced motion) */}
          {night && !preview && !reducedMotion && (
            <Group transform={meteorTransform} opacity={meteorOpacity}>
              <Rect x={-70} y={-0.9} width={70} height={1.8}>
                <LinearGradient
                  start={vec(-70, 0)}
                  end={vec(0, 0)}
                  colors={['transparent', withAlpha('#fff6e8', 0.9), 'transparent']}
                />
              </Rect>
            </Group>
          )}
        </Canvas>
      )}
    </View>
  );
}

export function ShiroBackdrop({ preview }: { preview?: boolean }) {
  return <PetBackdrop mode="day" preview={preview} />;
}
export function ShadowBackdrop({ preview }: { preview?: boolean }) {
  return <PetBackdrop mode="night" preview={preview} />;
}
