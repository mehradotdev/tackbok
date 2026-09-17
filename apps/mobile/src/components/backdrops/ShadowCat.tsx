import { useMemo } from 'react';
import {
  Group,
  Oval,
  Path,
  LinearGradient,
  RadialGradient,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { SHADOW_ART } from './shadow-art.generated';
import { shadowPose } from './shadow-motion';

type Node = {
  tag: string;
  id: string;
  children?: Node[];
  clip?: string;
  d?: string;
  fill?: string;
  stroke?: string;
  'stroke-width'?: string;
  opacity?: string;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  angle?: number;
  tailLeft?: string;
  tailRight?: string;
};
type Pose = SharedValue<ReturnType<typeof shadowPose>>;
const rest = SHADOW_ART.rest as unknown as {
  groups: Record<string, Node>;
  clips: Record<string, string>;
};
const middle = SHADOW_ART.middle as unknown as typeof rest;
const front = SHADOW_ART.front as unknown as typeof rest;
function mix(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}
function via(a: number, m: number, b: number, t: number) {
  'worklet';
  return t < 0.5 ? mix(a, m, t * 2) : mix(m, b, t * 2 - 1);
}
function makePath(d: string) {
  const path = Skia.Path.MakeFromSVGString(d);
  if (!path) throw new Error('Invalid Shadow SVG path');
  return path;
}
function Gradient({ fill }: { fill: string }) {
  const name = fill.slice(5, -1) as keyof typeof SHADOW_ART.gradients;
  const g = SHADOW_ART.gradients[name];
  return (
    <LinearGradient
      start={vec(...g.start)}
      end={vec(...g.end)}
      colors={[...g.colors]}
      positions={[...g.positions]}
    />
  );
}
function ShapePath({ a, m, b, pose }: { a: Node; m: Node; b: Node; pose: Pose }) {
  const paths = useMemo(() => {
    const start = makePath(a.d!);
    const end = makePath(b.d!);
    const mid = makePath(m.d!);
    if (!start.isInterpolatable(mid) || !mid.isInterpolatable(end))
      throw new Error(`Shadow path topology mismatch: ${a.id}`);
    return {
      start,
      mid,
      end,
      left: a.tailLeft ? makePath(a.tailLeft) : null,
      right: a.tailRight ? makePath(a.tailRight) : null,
    };
  }, [a, m, b]);
  const path = useDerivedValue(() =>
    paths.left && paths.right
      ? (paths.left.interpolate(paths.right, (1 - pose.value.tail) / 2) ?? paths.start)
      : ((pose.value.turn < 0.5
          ? paths.start.interpolate(paths.mid, 1 - pose.value.turn * 2)
          : paths.mid.interpolate(paths.end, 2 - pose.value.turn * 2)) ?? paths.start),
  );
  return (
    <Group opacity={Number(a.opacity ?? 1)}>
      {a.fill !== 'none' && (
        <Path path={path} color={a.fill?.startsWith('url') ? undefined : a.fill}>
          {a.fill?.startsWith('url') && <Gradient fill={a.fill} />}
        </Path>
      )}
      {a.stroke !== 'none' && (
        <Path
          path={path}
          color={a.stroke?.startsWith('url') ? undefined : a.stroke}
          style="stroke"
          strokeWidth={Number(a['stroke-width'])}
          strokeCap="round"
          strokeJoin="round">
          {a.stroke?.startsWith('url') && <Gradient fill={a.stroke} />}
        </Path>
      )}
    </Group>
  );
}
function Pupil({ a, m, b, pose }: { a: Node; m: Node; b: Node; pose: Pose }) {
  const transform = useDerivedValue(() => {
    const p = pose.value;
    const near = a.cx! < 650;
    const gaze = p.gaze * (1 - p.turn);
    return [
      { translateX: via(a.cx!, m.cx!, b.cx!, p.turn) - gaze * (near ? 20 : 8) },
      { translateY: via(a.cy!, m.cy!, b.cy!, p.turn) + gaze * (near ? 18 : 17) },
      { rotate: (via(a.angle ?? 0, m.angle ?? 0, b.angle ?? 0, p.turn) * Math.PI) / 180 },
      { scaleX: via(a.rx!, m.rx!, b.rx!, p.turn) / a.rx! },
      { scaleY: via(a.ry!, m.ry!, b.ry!, p.turn) / a.ry! },
    ];
  });
  return (
    <Group transform={transform}>
      <Oval x={-a.rx!} y={-a.ry!} width={a.rx! * 2} height={a.ry! * 2} color={a.fill} />
    </Group>
  );
}
function Layer({ a, m, b, pose }: { a: Node; m: Node; b: Node; pose: Pose }) {
  const clipPaths = useMemo(
    () =>
      a.clip
        ? {
            a: makePath(rest.clips[a.clip]),
            m: makePath(middle.clips[m.clip!]),
            b: makePath(front.clips[b.clip!]),
          }
        : null,
    [a, m, b],
  );
  const clip = useDerivedValue(() =>
    clipPaths
      ? ((pose.value.turn < 0.5
          ? clipPaths.a.interpolate(clipPaths.m, 1 - pose.value.turn * 2)
          : clipPaths.m.interpolate(clipPaths.b, 2 - pose.value.turn * 2)) ?? clipPaths.a)
      : undefined,
  );
  const origin = useDerivedValue(() => {
    if (a.id === 'head') return vec(653, 431);
    if (a.id === 'near-ear')
      return vec(mix(506, 510, pose.value.turn), mix(275, 253, pose.value.turn));
    if (a.id === 'far-ear')
      return vec(mix(689, 747, pose.value.turn), mix(191, 242, pose.value.turn));
    const near = a.id === 'near-eye';
    return vec(
      mix(near ? 580 : 727, near ? 566 : 717, pose.value.turn),
      mix(near ? 315 : 240, 321, pose.value.turn),
    );
  });
  const transform = useDerivedValue(() => {
    if (a.id === 'head') return [{ rotate: pose.value.tilt }];
    if (a.id === 'near-ear') return [{ rotate: pose.value.ear }];
    if (a.id === 'near-eye' || a.id === 'far-eye') {
      const angle = (a.id === 'near-eye' ? -0.205 : -0.99) * (1 - pose.value.turn);
      // Close in the eye's local axes, then restore its orientation.
      return [
        { rotate: angle },
        { scaleY: Math.max(0.055, 1 - pose.value.blink) },
        { rotate: -angle },
      ];
    }
    return [{ scale: 1 }];
  });
  const mouthOpacity = useDerivedValue(() => pose.value.mouth);
  const mouthTransform = useDerivedValue(() => [
    { scaleY: 0.3 + pose.value.mouth * 0.7 },
  ]);
  if (a.tag === 'path') return <ShapePath a={a} m={m} b={b} pose={pose} />;
  if (a.tag === 'ellipse') return <Pupil a={a} m={m} b={b} pose={pose} />;
  return (
    <Group transform={transform} origin={origin} clip={clip}>
      {a.children?.map((child, i) => (
        <Layer key={i} a={child} m={m.children![i]} b={b.children![i]} pose={pose} />
      ))}
      {a.id === 'head' && (
        <Group opacity={mouthOpacity} origin={vec(642, 395)} transform={mouthTransform}>
          <Oval x={615} y={383} width={54} height={56} color="#281C2D" />
          <Oval x={626} y={417} width={32} height={15} color="#B58B9D" />
        </Group>
      )}
    </Group>
  );
}
export function ShadowCatArt({
  idle,
  performance,
  variant,
}: {
  idle: SharedValue<number>;
  performance: SharedValue<number>;
  variant: SharedValue<number>;
}) {
  const pose = useDerivedValue(() =>
    shadowPose(performance.value, variant.value, idle.value),
  );
  return (
    <>
      <Group
        transform={[
          { translateX: 583 },
          { translateY: 834 },
          { scaleX: 337 },
          { scaleY: 612 },
        ]}>
        <Oval x={-1} y={-1} width={2} height={2}>
          <RadialGradient
            c={vec(0, 0)}
            r={1}
            colors={[
              'rgba(148,117,170,0.16)',
              'rgba(131,96,151,0.07)',
              'rgba(131,96,151,0)',
            ]}
            positions={[0, 0.65, 1]}
          />
        </Oval>
      </Group>
      <Group
        transform={[
          { translateX: 630 },
          { translateY: 271 },
          { scaleX: 296 },
          { scaleY: 252 },
        ]}>
        <Oval x={-1} y={-1} width={2} height={2}>
          <RadialGradient
            c={vec(0, 0)}
            r={1}
            colors={[
              'rgba(148,117,170,0.16)',
              'rgba(131,96,151,0.07)',
              'rgba(131,96,151,0)',
            ]}
            positions={[0, 0.65, 1]}
          />
        </Oval>
      </Group>
      <Layer
        a={rest.groups.null}
        m={middle.groups.null}
        b={front.groups.null}
        pose={pose}
      />
    </>
  );
}
