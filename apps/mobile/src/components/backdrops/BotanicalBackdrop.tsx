import { useCallback, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { useFocusEffect } from 'expo-router';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

const SKYLIGHT_OPACITY = 0.12;
const DAPPLE_OPACITY = 0.12;
const FAR_HILL_OPACITY = 0.18;
const NEAR_HILL_OPACITY = 0.3;
const FERN_OPACITY = 0.34;
const CLUSTER_OPACITY = 0.46;
const HANGING_OPACITY = 0.42;
const BERRY_OPACITY = 0.6;
const DRIFT_DURATION_MS = 36000;
const SWAY_DURATION_MS = 4500;

/** Filled lens-shaped leaf growing from (px, py) toward `angle`. */
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

interface Frond {
  stem: string;
  leaves: string;
  strokeWidth: number;
}

/**
 * A single frond in local coordinates: gently curved stem growing upward from
 * (0, 0), with large filled leaves alternating along it and one tip leaf.
 * Deterministic — same inputs, same paths.
 */
function buildFrond(
  length: number,
  leafCount: number,
  leafScale: number,
  bendDir: 1 | -1,
): Frond {
  const bend = length * 0.16 * bendDir;
  const stemX = (t: number) => bend * Math.sin(t * Math.PI * 0.75);
  const stemY = (t: number) => -t * length;
  const tangent = (t: number) =>
    Math.atan2(-length, bend * Math.PI * 0.75 * Math.cos(t * Math.PI * 0.75));

  const segments = 14;
  let stem = `M 0 0`;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    stem += ` L ${stemX(t).toFixed(1)} ${stemY(t).toFixed(1)}`;
  }

  let leaves = '';
  for (let i = 0; i < leafCount; i++) {
    const t = 0.26 + (i / (leafCount - 1)) * 0.66;
    const side = i % 2 === 0 ? 1 : -1;
    // Leaves taper toward the frond tip
    const leafLength = length * leafScale * (1 - t * 0.35);
    leaves += leaf(stemX(t), stemY(t), tangent(t) + side * 0.95, leafLength);
  }
  leaves += leaf(stemX(1), stemY(1), tangent(1), length * leafScale * 0.75);

  return { stem, leaves, strokeWidth: Math.min(5, Math.max(2.5, length * 0.015)) };
}

/**
 * The Clemens/Weckner backdrop scene. Mounted only via `ThemeBackdrop`, which
 * owns the which-theme-gets-which-backdrop decision.
 *
 * Google Keep-style composition: flat shapes in a few tones of the live theme
 * tokens, each element anchored to a screen edge so the scene reflows with any
 * width — rolling hills along the bottom, a fern fan rising bottom-right, a
 * leaf cluster bottom-left, a sprig hanging (and gently swaying) from the top
 * right, brass berries as accents. Token-driven, so the same component paints
 * daylight sage under Clemens and moonlit green under Weckner.
 */
export function BotanicalBackdrop() {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const [primary, ring, accent] = useCSSVariable([
    '--color-primary',
    '--color-ring',
    '--color-accent',
  ]) as [string | undefined, string | undefined, string | undefined];

  // 0 → 1 → 0 phases driving the dapple drift and the hanging-sprig sway;
  // they run only while the screen is focused.
  const drift = useSharedValue(0);
  const sway = useSharedValue(0.5);
  useFocusEffect(
    useCallback(() => {
      if (reducedMotion) return;
      drift.value = withRepeat(
        withTiming(1, { duration: DRIFT_DURATION_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
      sway.value = withRepeat(
        withTiming(1, { duration: SWAY_DURATION_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
      return () => {
        cancelAnimation(drift);
        cancelAnimation(sway);
      };
    }, [reducedMotion, drift, sway]),
  );

  const dapple1 = useDerivedValue(() =>
    vec(width * 0.18 + drift.value * width * 0.12, height * 0.12 + drift.value * height * 0.05),
  );
  const dapple2 = useDerivedValue(() =>
    vec(width * 0.88 - drift.value * width * 0.1, height * 0.38 + drift.value * height * 0.08),
  );
  const hangingTransform = useDerivedValue(() => [
    { translateX: width * 0.84 },
    { translateY: -4 },
    { rotate: Math.PI + (sway.value - 0.5) * 0.12 },
  ]);

  const scene = useMemo(() => {
    const W = width;
    const H = height;
    const farHill =
      `M 0 ${(H * 0.72).toFixed(1)}` +
      ` C ${(W * 0.22).toFixed(1)} ${(H * 0.66).toFixed(1)}, ${(W * 0.4).toFixed(1)} ${(H * 0.7).toFixed(1)}, ${(W * 0.58).toFixed(1)} ${(H * 0.74).toFixed(1)}` +
      ` C ${(W * 0.76).toFixed(1)} ${(H * 0.78).toFixed(1)}, ${(W * 0.9).toFixed(1)} ${(H * 0.71).toFixed(1)}, ${W} ${(H * 0.68).toFixed(1)}` +
      ` L ${W} ${H} L 0 ${H} Z`;
    const nearHill =
      `M 0 ${(H * 0.85).toFixed(1)}` +
      ` C ${(W * 0.18).toFixed(1)} ${(H * 0.8).toFixed(1)}, ${(W * 0.38).toFixed(1)} ${(H * 0.87).toFixed(1)}, ${(W * 0.58).toFixed(1)} ${(H * 0.88).toFixed(1)}` +
      ` C ${(W * 0.76).toFixed(1)} ${(H * 0.89).toFixed(1)}, ${(W * 0.9).toFixed(1)} ${(H * 0.84).toFixed(1)}, ${W} ${(H * 0.86).toFixed(1)}` +
      ` L ${W} ${H} L 0 ${H} Z`;
    return {
      farHill,
      nearHill,
      // Fern fan rising from behind the hills, bottom-right (the scene's "tree")
      fern: [
        { rotate: -0.5, frond: buildFrond(H * 0.24, 6, 0.34, -1) },
        { rotate: -0.06, frond: buildFrond(H * 0.34, 8, 0.3, 1) },
        { rotate: 0.42, frond: buildFrond(H * 0.22, 6, 0.34, 1) },
      ],
      // Foreground leaf cluster poking up from the bottom-left corner
      cluster: [
        { rotate: -0.3, frond: buildFrond(H * 0.17, 5, 0.44, -1) },
        { rotate: 0.28, frond: buildFrond(H * 0.12, 4, 0.48, 1) },
      ],
      hanging: buildFrond(H * 0.2, 6, 0.4, 1),
      berries: [
        { cx: W * 0.7, cy: H * 0.69, r: 5 },
        { cx: W * 0.82, cy: H * 0.63, r: 4 },
        { cx: W * 0.88, cy: H * 0.73, r: 6 },
        { cx: W * 0.16, cy: H * 0.9, r: 5 },
      ],
    };
  }, [width, height]);

  if (!primary || !ring || !accent) return null;

  const dappleRadius = width * 0.5;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Skylight: soft light falling from the top, like the mood board kitchen */}
      <Group opacity={SKYLIGHT_OPACITY}>
        <Rect x={0} y={0} width={width} height={height * 0.5}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height * 0.5)}
            colors={[primary, 'transparent']}
          />
        </Rect>
      </Group>

      {/* Dappled light drifting on a slow loop */}
      <Group opacity={DAPPLE_OPACITY}>
        <Circle c={dapple1} r={dappleRadius}>
          <RadialGradient c={dapple1} r={dappleRadius} colors={[accent, 'transparent']} />
        </Circle>
        <Circle c={dapple2} r={dappleRadius * 0.85}>
          <RadialGradient
            c={dapple2}
            r={dappleRadius * 0.85}
            colors={[accent, 'transparent']}
          />
        </Circle>
      </Group>

      {/* Rolling hills along the bottom edge */}
      <Group opacity={FAR_HILL_OPACITY}>
        <Path path={scene.farHill} color={primary} style="fill" />
      </Group>

      {/* Fern fan rising bottom-right, from behind the near hill */}
      <Group
        opacity={FERN_OPACITY}
        transform={[{ translateX: width * 0.78 }, { translateY: height + 8 }]}>
        {scene.fern.map(({ rotate, frond }, i) => (
          <Group key={i} transform={[{ rotate }]}>
            <Path
              path={frond.stem}
              color={ring}
              style="stroke"
              strokeWidth={frond.strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
            <Path path={frond.leaves} color={ring} style="fill" />
          </Group>
        ))}
      </Group>

      <Group opacity={NEAR_HILL_OPACITY}>
        <Path path={scene.nearHill} color={primary} style="fill" />
      </Group>

      {/* Foreground leaf cluster, bottom-left corner */}
      <Group
        opacity={CLUSTER_OPACITY}
        transform={[{ translateX: width * 0.07 }, { translateY: height + 10 }]}>
        {scene.cluster.map(({ rotate, frond }, i) => (
          <Group key={i} transform={[{ rotate }]}>
            <Path
              path={frond.stem}
              color={ring}
              style="stroke"
              strokeWidth={frond.strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
            <Path path={frond.leaves} color={ring} style="fill" />
          </Group>
        ))}
      </Group>

      {/* Sprig hanging from the top-right, gently swaying */}
      <Group opacity={HANGING_OPACITY} transform={hangingTransform}>
        <Path
          path={scene.hanging.stem}
          color={ring}
          style="stroke"
          strokeWidth={scene.hanging.strokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
        <Path path={scene.hanging.leaves} color={ring} style="fill" />
      </Group>

      {/* Brass berries — the one warm metal moment */}
      <Group opacity={BERRY_OPACITY}>
        {scene.berries.map(({ cx, cy, r }, i) => (
          <Circle key={i} cx={cx} cy={cy} r={r} color={accent} />
        ))}
      </Group>
    </Canvas>
  );
}
