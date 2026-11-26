import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  Canvas,
  Fill,
  Group,
  Line,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  Skia,
  rect,
  vec,
} from 'react-native-skia';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useCSSVariable } from 'uniwind';
import { TACKBOK_LOGO_PATHS, TackbokLogo } from '~/components/TackbokLogo';
import {
  NATIVE_SPLASH_BACKGROUND,
  NATIVE_SPLASH_LOGO_COLOR,
  NATIVE_SPLASH_LOGO_SIZE,
  revealSplash,
  SPLASH_TIMELINES,
  useSplashActive,
  type SplashMode,
} from '~/lib/splash';

const LOGO_PATHS = TACKBOK_LOGO_PATHS.map((d) => Skia.Path.MakeFromSVGString(d)!);

// Geometry in logo units (the logo's 250-unit viewBox).
const SPINE_X = 125.5;
const PAGE_ORIGIN = { x: SPINE_X, y: 125 };
/** Perspective distance for the page turn; smaller is more dramatic. */
const PERSPECTIVE = 420;
const HEART_FOCUS = { x: 124, y: 132 };
const LEFT_CLIP = rect(0, 0, SPINE_X, 250);
const RIGHT_CLIP = rect(SPINE_X, 0, 250 - SPINE_X, 250);

// The closed book: a front cover over the right half, with the page block
// showing along its edge and a heart on the cover.
const COVER = { x: SPINE_X, y: 24, width: 118, height: 196 };
const PAGE_DEPTH = 6;
const COVER_RIGHT = COVER.x + COVER.width;
const COVER_BOTTOM = COVER.y + COVER.height;
const COVER_SHADE = rect(
  COVER.x,
  COVER.y,
  COVER.width + PAGE_DEPTH,
  COVER.height + PAGE_DEPTH,
);
const PAGE_COLOR = '#F6F0E0';
const PAGE_EDGE_COLOR = '#C4B68E';
const SPINE_SHADE = '#AE9C6E';
const COVER_DETAIL = '#CDBF98';
const PAGE_EDGE_LINES = [1.6, 3.2, 4.8];
const COVER_HEART = Skia.Path.MakeFromSVGString(
  'M0 -7C-4 -17 -21 -17 -21 -2C-21 10 -7 18 0 27C7 18 21 10 21 -2C21 -17 4 -17 0 -7Z',
)!;
const COVER_HEART_POSITION = [
  { translateX: COVER.x + COVER.width / 2 + 3 },
  { translateY: COVER.y + 84 },
];

const foldEasing = Easing.inOut(Easing.cubic);
const zoomEasing = Easing.inOut(Easing.cubic);

interface SplashAnimationProps {
  mode: Exclude<SplashMode, 'none'>;
  /**
   * The overlay covers the screen with the native splash frame (drawn by the
   * plain logo view below the canvas); safe to hide the native splash now.
   */
  onCover: () => void;
  /** The canvas has drawn its first frame and the animation is starting. */
  onStart: () => void;
  onFinish: () => void;
  /**
   * Seasonal hook: Skia nodes drawn on the book in logo units (e.g. a hat).
   * shortcut: no caller yet, kept for the planned festive splash (2.0.0 festive work).
   */
  decoration?: ReactNode;
}

/**
 * Full-screen overlay that starts on the exact native splash frame (black,
 * cream logo) and ends on the theme background, then fades to reveal the app.
 */
export function SplashAnimation({
  mode,
  onCover,
  onStart,
  onFinish,
  decoration,
}: SplashAnimationProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [themeBackground] = useCSSVariable(['--color-background']);
  const endColor = (themeBackground as string | undefined) ?? NATIVE_SPLASH_BACKGROUND;
  const time = useSharedValue(0);
  const timeline = SPLASH_TIMELINES[mode];
  // Once the background is the theme's, taps reach the app underneath.
  const revealed = useSplashActive((s) => s.revealed);

  // Give the canvas two frames to draw before the animation moves, so it never
  // starts mid-way. Until then the plain logo view shows the same frame.
  useEffect(() => {
    if (!size || drawn) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setDrawn(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [size, drawn]);

  useEffect(() => {
    if (drawn) onStart();
  }, [drawn, onStart]);

  useEffect(() => {
    if (!drawn) return;
    const { duration } = SPLASH_TIMELINES[mode];
    // The mode already honours Reduce Motion; Never keeps its fade a fade, not a cut.
    time.value = withTiming(
      duration,
      { duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never },
      (finished) => {
        if (finished) scheduleOnRN(onFinish);
      },
    );
  }, [drawn, mode, onFinish, time]);

  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const maxZoom =
    width > 0 && height > 0
      ? (3.5 * Math.max(width, height)) / NATIVE_SPLASH_LOGO_SIZE
      : 1;

  const zoom = useDerivedValue(() => {
    const range = timeline.zoom;
    if (!range) return 0;
    return zoomEasing(interpolate(time.value, range, [0, 1], 'clamp'));
  });

  const logoTransform = useDerivedValue(() => {
    const z = zoom.value;
    let beat = 1;
    if (timeline.beat) {
      const b = interpolate(time.value, timeline.beat, [0, 1], 'clamp');
      beat = 1 + 0.07 * Math.sin(Math.PI * b) ** 2;
    }
    const scale =
      (NATIVE_SPLASH_LOGO_SIZE / 250) * Math.exp(Math.log(maxZoom) * z) * beat;
    const focusX = 125 + (HEART_FOCUS.x - 125) * z;
    const focusY = 125 + (HEART_FOCUS.y - 125) * z;
    return [
      { translateX: width / 2 },
      { translateY: height / 2 },
      { scale },
      { translateX: -focusX },
      { translateY: -focusY },
    ];
  });

  // Page angle: 0 = left page lying open, π = turned over onto the right (closed).
  const angle = useDerivedValue(() => {
    const f = timeline.fold;
    if (!f) return 0;
    const t = time.value;
    if (t <= f.close[1]) {
      return Math.PI * foldEasing(interpolate(t, f.close, [0, 1], 'clamp'));
    }
    return Math.PI * (1 - foldEasing(interpolate(t, f.open, [0, 1], 'clamp')));
  });
  // Positive rotateY lifts the page's outer edge towards the viewer, like a
  // real page turning over the spine (negative would sink it into the screen).
  const leftPageTransform = useDerivedValue(() => [
    { perspective: PERSPECTIVE },
    { rotateY: Math.min(angle.value, Math.PI / 2) },
  ]);
  const coverTransform = useDerivedValue(() => [
    { perspective: PERSPECTIVE },
    { rotateY: Math.max(angle.value, Math.PI / 2) - Math.PI },
  ]);
  // Each side is hidden while it faces away; a dark layer (not transparency, so
  // nothing shows through) makes the turning page catch less light.
  const leftPageOpacity = useDerivedValue(() => (angle.value >= Math.PI / 2 ? 0 : 1));
  const coverOpacity = useDerivedValue(() => (angle.value <= Math.PI / 2 ? 0 : 1));
  const turnShade = useDerivedValue(() => 0.45 * Math.sin(angle.value));

  // Once the background is the theme's, the status bar can follow the theme.
  useAnimatedReaction(
    () => zoom.value >= 0.8,
    (revealed, previous) => {
      if (revealed && !previous) scheduleOnRN(revealSplash);
    },
  );
  const background = useDerivedValue(() =>
    interpolateColor(zoom.value, [0.15, 0.8], [NATIVE_SPLASH_BACKGROUND, endColor]),
  );
  const bookOpacity = useDerivedValue(() =>
    interpolate(zoom.value, [0.65, 1], [1, 0], 'clamp'),
  );
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(time.value, timeline.fadeOut, [1, 0], 'clamp'),
  }));

  const logo = useMemo(
    () =>
      LOGO_PATHS.map((path, index) => (
        <Path key={index} path={path} color={NATIVE_SPLASH_LOGO_COLOR} />
      )),
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    // Laid out means on screen together with the plain logo view, which matches
    // the native splash exactly, so the native splash can go right away.
    onCover();
    const { width: w, height: h } = event.nativeEvent.layout;
    setSize((current) =>
      current?.width === w && current.height === h ? current : { width: w, height: h },
    );
  };

  return (
    <Animated.View
      accessibilityViewIsModal
      pointerEvents={revealed ? 'none' : 'auto'}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: NATIVE_SPLASH_BACKGROUND },
        overlayStyle,
      ]}
      onLayout={onLayout}>
      {/* The native splash frame as a plain view, drawn with the first layout.
          Skia can paint a few frames later (on Android it draws on its own
          thread), so this keeps the hand-off seamless until it does. */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <TackbokLogo size={NATIVE_SPLASH_LOGO_SIZE} color={NATIVE_SPLASH_LOGO_COLOR} />
      </View>
      {size ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill color={background} />
          <Group transform={logoTransform} opacity={bookOpacity}>
            <Group clip={RIGHT_CLIP}>{logo}</Group>
            <Group
              origin={PAGE_ORIGIN}
              transform={leftPageTransform}
              opacity={leftPageOpacity}>
              <Group clip={LEFT_CLIP}>
                {logo}
                <Rect
                  rect={LEFT_CLIP}
                  color={NATIVE_SPLASH_BACKGROUND}
                  opacity={turnShade}
                />
              </Group>
            </Group>
            <Group origin={PAGE_ORIGIN} transform={coverTransform} opacity={coverOpacity}>
              <ClosedBook />
              <Rect
                rect={COVER_SHADE}
                color={NATIVE_SPLASH_BACKGROUND}
                opacity={turnShade}
              />
            </Group>
            {decoration}
          </Group>
        </Canvas>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});

function ClosedBook() {
  return (
    <Group>
      {/* Page block peeking out along the fore-edge and the bottom. */}
      <RoundedRect
        x={COVER.x}
        y={COVER.y + PAGE_DEPTH}
        width={COVER.width + PAGE_DEPTH}
        height={COVER.height}
        r={6}
        color={PAGE_COLOR}
      />
      {PAGE_EDGE_LINES.map((inset) => (
        <Group key={inset}>
          <Line
            p1={vec(COVER_RIGHT + PAGE_DEPTH - inset, COVER.y + PAGE_DEPTH + 6)}
            p2={vec(COVER_RIGHT + PAGE_DEPTH - inset, COVER_BOTTOM + PAGE_DEPTH - 4)}
            color={PAGE_EDGE_COLOR}
            strokeWidth={0.7}
          />
          <Line
            p1={vec(COVER.x + 10, COVER_BOTTOM + PAGE_DEPTH - inset)}
            p2={vec(COVER_RIGHT + PAGE_DEPTH - 4, COVER_BOTTOM + PAGE_DEPTH - inset)}
            color={PAGE_EDGE_COLOR}
            strokeWidth={0.7}
          />
        </Group>
      ))}
      {/* Front cover, shaded towards the spine. */}
      <RoundedRect
        x={COVER.x}
        y={COVER.y}
        width={COVER.width}
        height={COVER.height}
        r={6}>
        <LinearGradient
          start={vec(COVER.x, 0)}
          end={vec(COVER.x + 24, 0)}
          colors={[SPINE_SHADE, NATIVE_SPLASH_LOGO_COLOR]}
        />
      </RoundedRect>
      <Line
        p1={vec(COVER.x + 13, COVER.y + 3)}
        p2={vec(COVER.x + 13, COVER_BOTTOM - 3)}
        color={COVER_DETAIL}
        strokeWidth={1.4}
      />
      <RoundedRect
        x={COVER.x + 22}
        y={COVER.y + 14}
        width={COVER.width - 34}
        height={COVER.height - 28}
        r={4}
        color={COVER_DETAIL}
        style="stroke"
        strokeWidth={1.5}
      />
      <Group transform={COVER_HEART_POSITION}>
        <Path path={COVER_HEART} color={NATIVE_SPLASH_BACKGROUND} />
      </Group>
    </Group>
  );
}
