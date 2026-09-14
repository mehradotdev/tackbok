import { Group, LinearGradient, Oval, Path, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { SHIRO_ART } from './shiro-art.generated';
import { shiroIdle, shiroIdleBark, shiroPerformance } from './shiro-motion';

const INK = '#302A24';
const parts = ['head', 'earFill', 'earLine', 'tuft', 'nose'] as const;
type MorphPart = (typeof parts)[number];
type ArtPath = NonNullable<ReturnType<typeof Skia.Path.MakeFromSVGString>>;
const paths = Object.fromEntries(
  parts.map((part) => {
    const rest = Skia.Path.MakeFromSVGString(SHIRO_ART.rest[part])!;
    const middle = Skia.Path.MakeFromSVGString(SHIRO_ART.middle[part])!;
    const front = Skia.Path.MakeFromSVGString(SHIRO_ART.front[part])!;
    if (!rest.isInterpolatable(middle) || !middle.isInterpolatable(front)) {
      throw new Error(`Incompatible Shiro artwork: ${part}`);
    }
    return [part, { rest, middle, front }];
  }),
) as Record<MorphPart, { rest: ArtPath; middle: ArtPath; front: ArtPath }>;
const farEarMiddle = Skia.Path.MakeFromSVGString(SHIRO_ART.middle.farEar)!;
const farEarFront = Skia.Path.MakeFromSVGString(SHIRO_ART.front.farEar)!;
const smileMiddle = Skia.Path.MakeFromSVGString(SHIRO_ART.middle.smile)!;
const smileFront = Skia.Path.MakeFromSVGString(SHIRO_ART.front.smile)!;

function between(turn: number, rest: number, middle: number, front: number) {
  'worklet';
  return turn < 0.5
    ? rest + (middle - rest) * turn * 2
    : middle + (front - middle) * (turn * 2 - 1);
}

function ArtGradient({ name }: { name: keyof typeof SHIRO_ART.gradients }) {
  const gradient = SHIRO_ART.gradients[name];
  return (
    <LinearGradient
      start={vec(...gradient.start)}
      end={vec(...gradient.end)}
      colors={[...gradient.colors]}
      positions={[...gradient.positions]}
    />
  );
}

function Fur({ ear = false }: { ear?: boolean }) {
  return <ArtGradient name={ear ? 'ear-fur' : 'face-fur'} />;
}

function StaticLayer({ name }: { name: 'body' | 'tail' | 'collar' }) {
  return (
    <>
      {SHIRO_ART[name].map((shape, i) => {
        const gradient = shape.fill.startsWith('url(')
          ? (shape.fill.slice(5, -1) as keyof typeof SHIRO_ART.gradients)
          : null;
        return (
          <Group key={i} opacity={shape.opacity}>
            {shape.fill !== 'none' && (
              <Path path={shape.path} color={gradient ? undefined : shape.fill}>
                {gradient && <ArtGradient name={gradient} />}
              </Path>
            )}
            {shape.stroke !== 'none' && (
              <Path
                path={shape.path}
                color={shape.stroke}
                style="stroke"
                strokeWidth={shape.strokeWidth}
                strokeCap="round"
                strokeJoin="round"
              />
            )}
          </Group>
        );
      })}
    </>
  );
}

function Morph({ part, turn }: { part: MorphPart; turn: SharedValue<number> }) {
  const { rest, middle, front } = paths[part];
  const path = useDerivedValue(() =>
    turn.value < 0.5
      ? (rest.interpolate(middle, 1 - turn.value * 2) ?? rest)
      : (middle.interpolate(front, 2 - turn.value * 2) ?? middle),
  );
  const lineOnly = part === 'earLine' || part === 'tuft';
  return (
    <>
      {!lineOnly && (
        <Path path={path} color={part === 'nose' ? '#090A08' : undefined}>
          {part !== 'nose' && <Fur ear={part === 'earFill'} />}
        </Path>
      )}
      {part !== 'earFill' && part !== 'nose' && (
        <Path
          path={path}
          color={INK}
          style="stroke"
          strokeWidth={part === 'tuft' ? 5 : 10}
          strokeCap="round"
          strokeJoin="round"
        />
      )}
    </>
  );
}

/** Pure drawing component, also used to render deterministic pose review frames. */
export function ShiroDogArt({
  idle,
  performance,
  bark,
  barkCount,
}: {
  idle: SharedValue<number>;
  performance: SharedValue<number>;
  bark: SharedValue<number>;
  barkCount: SharedValue<number>;
}) {
  const pose = useDerivedValue(() => shiroPerformance(performance.value));
  // Idle gestures yield completely to the requested performance / still greeting.
  const quiet = useDerivedValue(() => ({
    ...shiroIdle(performance.value === 0 ? idle.value : 0),
    mouth: performance.value === 0 ? shiroIdleBark(bark.value, barkCount.value) : 0,
  }));
  const turn = useDerivedValue(() => {
    // Ease into and out of the authored three-quarter view as well as the ends.
    const raw = pose.value.turn;
    const half = raw < 0.5 ? raw * 2 : raw * 2 - 1;
    const eased = half * half * (3 - 2 * half);
    return (raw < 0.5 ? 0 : 0.5) + eased * 0.5;
  });
  const profileOpacity = useDerivedValue(() => 1 - turn.value);
  const tailTransform = useDerivedValue(() => [{ rotate: quiet.value.tail }]);
  const headTransform = useDerivedValue(() => [
    { rotate: pose.value.tilt - quiet.value.mouth * 0.018 },
  ]);
  const earOrigin = useDerivedValue(() =>
    vec(between(turn.value, 378, 402, 431), between(turn.value, 399, 354, 299)),
  );
  const earTransform = useDerivedValue(() => [
    { rotate: quiet.value.ear + (pose.value.mouth + quiet.value.mouth) * 0.04 },
  ]);
  const farEarTransform = useDerivedValue(() => [
    { scaleX: Math.min(1, turn.value * 2) },
  ]);
  const farEar = useDerivedValue(
    () =>
      farEarMiddle.interpolate(farEarFront, 1 - Math.max(0, turn.value * 2 - 1)) ??
      farEarMiddle,
  );
  const eyeTransform = useDerivedValue(() => [
    {
      translateX: between(
        turn.value,
        587,
        SHIRO_ART.middle.eye[0],
        SHIRO_ART.front.eye[0],
      ),
    },
    {
      translateY: between(
        turn.value,
        278,
        SHIRO_ART.middle.eye[1],
        SHIRO_ART.front.eye[1],
      ),
    },
    {
      scaleX:
        between(turn.value, 26, SHIRO_ART.middle.eye[2], SHIRO_ART.front.eye[2]) / 26,
    },
    {
      scaleY:
        (between(turn.value, 26, SHIRO_ART.middle.eye[3], SHIRO_ART.front.eye[3]) / 26) *
        Math.max(0.08, 1 - quiet.value.blink * 0.92),
    },
  ]);
  const farEyeOpacity = useDerivedValue(() =>
    Math.min(1, Math.max(0, (turn.value - 0.18) / 0.32)),
  );
  const farEyeTransform = useDerivedValue(() => [
    {
      translateX: between(
        turn.value,
        861,
        SHIRO_ART.middle.farEye[0],
        SHIRO_ART.front.farEye[0],
      ),
    },
    {
      translateY: between(
        turn.value,
        187,
        SHIRO_ART.middle.farEye[1],
        SHIRO_ART.front.farEye[1],
      ),
    },
    {
      scaleX:
        between(turn.value, 0, SHIRO_ART.middle.farEye[2], SHIRO_ART.front.farEye[2]) /
        23,
    },
    { scaleY: Math.max(0.08, 1 - quiet.value.blink * 0.92) },
  ]);
  const smile = useDerivedValue(
    () =>
      smileMiddle.interpolate(smileFront, 1 - Math.max(0, turn.value * 2 - 1)) ??
      smileMiddle,
  );
  const smileOpacity = useDerivedValue(
    () => Math.min(1, Math.max(0, turn.value * 2 - 0.7)) * (1 - pose.value.mouth),
  );
  const mouthOpacity = useDerivedValue(() => turn.value * pose.value.mouth);
  const mouthTransform = useDerivedValue(() => [
    { translateX: 650 },
    { translateY: 456 },
    { scaleY: 0.3 + pose.value.mouth * 0.7 },
  ]);
  const restingBarkOpacity = useDerivedValue(() => quiet.value.mouth);
  const restingBarkTransform = useDerivedValue(() => [
    { translateX: 839 },
    { translateY: 239 },
    { rotate: -0.8 },
    { scaleY: 0.2 + quiet.value.mouth * 0.8 },
  ]);

  return (
    <>
      <Group origin={vec(354, 1160)} transform={tailTransform}>
        <StaticLayer name="tail" />
      </Group>
      <StaticLayer name="body" />
      <StaticLayer name="collar" />
      <Group origin={vec(650, 617)} transform={headTransform}>
        <Group origin={vec(878, 274)} transform={farEarTransform} opacity={farEyeOpacity}>
          <Path path={farEar}>
            <Fur ear />
          </Path>
          <Path
            path={farEar}
            color={INK}
            style="stroke"
            strokeWidth={10}
            strokeJoin="round"
          />
        </Group>
        <Morph part="head" turn={turn} />
        <Morph part="tuft" turn={turn} />
        <Group origin={earOrigin} transform={earTransform}>
          <Morph part="earFill" turn={turn} />
          <Morph part="earLine" turn={turn} />
        </Group>
        <Path
          path={SHIRO_ART.rest.brow}
          opacity={profileOpacity}
          color={INK}
          style="stroke"
          strokeWidth={5}
          strokeCap="round"
        />
        <Group transform={eyeTransform}>
          <Oval x={-26} y={-26} width={52} height={52} color="#090A08" />
        </Group>
        <Group transform={farEyeTransform} opacity={farEyeOpacity}>
          <Oval x={-23} y={-25} width={46} height={50} color="#090A08" />
        </Group>
        <Morph part="nose" turn={turn} />
        <Path
          path={smile}
          opacity={smileOpacity}
          color={INK}
          style="stroke"
          strokeWidth={5}
          strokeCap="round"
        />
        <Group transform={mouthTransform} opacity={mouthOpacity}>
          <Oval x={-42} y={-6} width={84} height={90} color="#30231F" />
          <Oval x={-21} y={57} width={42} height={21} color="#DB9F9A" />
        </Group>
        <Group transform={restingBarkTransform} opacity={restingBarkOpacity}>
          <Oval x={-38} y={-5} width={76} height={88} color="#30231F" />
          <Oval x={-18} y={56} width={36} height={19} color="#DB9F9A" />
        </Group>
      </Group>
    </>
  );
}
