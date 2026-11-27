import { useCallback, useMemo, useState } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import { Canvas, Image, Rect, Shader, Skia } from 'react-native-skia';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { useAppLockStore } from '~/lib/appLock';
import { useSettingsStore } from '~/lib/settings';
import { useSplashActive } from '~/lib/splash';
import { CHRISTMAS_PALETTE, NEW_YEAR_PALETTE } from '~/lib/theme/theme-tokens';
import type { BackdropProps } from './ThemeBackdrop';
import { claimCelebration } from './celebration';
import {
  CHRISTMAS_FIREWORKS_SECONDS,
  CHRISTMAS_LIGHTS,
  CHRISTMAS_SCENE,
  CHRISTMAS_SNOW,
} from './christmas-shader';
import {
  MeasuredHost,
  rgb,
  useForwardTime,
  useShaderTexture,
  useWhileFocused,
  type Size,
} from './scene-kit';
import {
  NEW_YEAR_BAUBLES,
  NEW_YEAR_CLOCK,
  NEW_YEAR_CONFETTI,
  NEW_YEAR_CONFETTI_SECONDS,
  NEW_YEAR_LIGHTS,
  NEW_YEAR_SCENE,
  newYearBaubleRegion,
  newYearClockRegion,
} from './new-year-shader';

const christmasScene = Skia.RuntimeEffect.Make(CHRISTMAS_SCENE);
const christmasLights = Skia.RuntimeEffect.Make(CHRISTMAS_LIGHTS);
const christmasSnow = Skia.RuntimeEffect.Make(CHRISTMAS_SNOW);
const newYearScene = Skia.RuntimeEffect.Make(NEW_YEAR_SCENE);
const newYearBaubles = Skia.RuntimeEffect.Make(NEW_YEAR_BAUBLES);
const newYearLights = Skia.RuntimeEffect.Make(NEW_YEAR_LIGHTS);
const newYearClock = Skia.RuntimeEffect.Make(NEW_YEAR_CLOCK);
const newYearConfetti = Skia.RuntimeEffect.Make(NEW_YEAR_CONFETTI);

type SceneProps = Size & { preview: boolean; celebrate: boolean };

const coveredNow = () =>
  useSplashActive.getState().active ||
  (useSettingsStore.getState().biometricUnlockEnabled &&
    useAppLockStore.getState().isLocked !== false);

/**
 * Seconds into the special-day celebration on the home screen, or -1. It plays
 * once per opening of the app on 24, 25 and 31 Dec and 1 Jan, after the launch
 * animation and any app-lock cover, unless "Festive touches" is off or Reduce
 * Motion is on. `playing` lets callers skip the layer.
 */
function useCelebration(enabled: boolean, seconds: number) {
  const festive = useSettingsStore((s) => s.festiveTouchesEnabled);
  const reducedMotion = useReducedMotion();
  // Wait until the launch animation and any app-lock cover are out of the way.
  // `covered` re-runs the effect when they go; `coveredNow()` catches a lock that
  // engages in the same AppState change, before this component re-renders.
  const splashing = useSplashActive((s) => s.active);
  const lockEnabled = useSettingsStore((s) => s.biometricUnlockEnabled);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const covered = splashing || (lockEnabled && isLocked !== false);
  const party = useSharedValue(-1);
  const [playing, setPlaying] = useState(false);
  useWhileFocused(
    useCallback(
      (active: boolean) => {
        if (
          !active ||
          covered ||
          coveredNow() ||
          !enabled ||
          !festive ||
          reducedMotion ||
          !claimCelebration()
        ) {
          return;
        }
        setPlaying(true);
        party.value = withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(seconds, { duration: seconds * 1000, easing: Easing.linear }),
        );
        const stop = () => {
          cancelAnimation(party);
          party.value = -1;
          setPlaying(false);
        };
        const done = setTimeout(stop, seconds * 1000);
        return () => {
          clearTimeout(done);
          stop();
        };
      },
      [covered, enabled, festive, reducedMotion, party, seconds],
    ),
  );
  return { party, playing };
}

const readClock = (now: Date, seconds: boolean) => [
  now.getHours(),
  now.getMinutes(),
  seconds ? now.getSeconds() : -1,
];

/** The real local time for New Year's clock: hours, minutes, seconds (-1 hides the
 *  second hand, which stays still for previews and Reduce Motion). */
function useLocalClock(preview: boolean) {
  const reducedMotion = useReducedMotion();
  const ticking = !preview && !reducedMotion;
  const clock = useSharedValue(readClock(new Date(), ticking));
  useWhileFocused(
    useCallback(
      (active: boolean) => {
        const tick = () => {
          clock.value = readClock(new Date(), ticking);
        };
        tick();
        if (!active || preview) return;
        const timer = setInterval(tick, ticking ? 1000 : 15000);
        return () => clearInterval(timer);
      },
      [clock, preview, ticking],
    ),
  );
  return clock;
}

export function ChristmasBackdrop({ preview = false, celebrate = false }: BackdropProps) {
  return (
    <MeasuredHost>
      {(size) => <ChristmasScene {...size} preview={preview} celebrate={celebrate} />}
    </MeasuredHost>
  );
}

function ChristmasScene({ width, height, preview, celebrate }: SceneProps) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  const sky = typeof background === 'string' ? background : '#0c1b22';
  const ink = typeof foreground === 'string' ? foreground : '#e8efe9';
  const scene = useMemo(
    () => ({
      size: [width, height],
      sky: rgb(sky),
      snow: rgb(CHRISTMAS_PALETTE.snow),
      pine: rgb(CHRISTMAS_PALETTE.pine),
      warm: rgb(CHRISTMAS_PALETTE.warm),
      berry: rgb(CHRISTMAS_PALETTE.berry),
      ink: rgb(ink),
    }),
    [width, height, sky, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const texture = useShaderTexture(christmasScene, scene, full, PixelRatio.get());
  const time = useForwardTime(preview);
  const { party } = useCelebration(celebrate && !preview, CHRISTMAS_FIREWORKS_SECONDS);
  const lights = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    party: party.value,
    snow: scene.snow,
    warm: scene.warm,
    berry: scene.berry,
  }));
  const snowfall = useDerivedValue(() => ({ size: scene.size, time: time.value }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the texture is ready, or if the shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={sky} />
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {christmasLights && (
        <Rect x={0} y={0} width={width} height={height} blendMode="plus">
          <Shader source={christmasLights} uniforms={lights} />
        </Rect>
      )}
      {christmasSnow && (
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={christmasSnow} uniforms={snowfall} />
        </Rect>
      )}
    </Canvas>
  );
}

export function NewYearBackdrop({ preview = false, celebrate = false }: BackdropProps) {
  return (
    <MeasuredHost>
      {(size) => <NewYearScene {...size} preview={preview} celebrate={celebrate} />}
    </MeasuredHost>
  );
}

function NewYearScene({ width, height, preview, celebrate }: SceneProps) {
  const background = useCSSVariable('--color-background');
  const fallback = typeof background === 'string' ? background : NEW_YEAR_PALETTE.wine;
  const scene = useMemo(
    () => ({
      size: [width, height],
      wine: rgb(NEW_YEAR_PALETTE.wine),
      rose: rgb(NEW_YEAR_PALETTE.rose),
      gold: rgb(NEW_YEAR_PALETTE.gold),
      glow: rgb(NEW_YEAR_PALETTE.glow),
    }),
    [width, height],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const texture = useShaderTexture(newYearScene, scene, full, PixelRatio.get());
  // The garlands hang from 17% to 34% of the height. The lowest sags 50 pt
  // (scaled), its bulbs hang 2.5 pt below the wire, and their glow reaches 12 pt.
  const band = useMemo(() => {
    const scale = Math.min(width / 390, height / 700);
    const y = Math.max(0, Math.floor(height * 0.17 - 14 * scale));
    return { y, height: Math.min(height, Math.ceil(height * 0.34 + 68 * scale)) - y };
  }, [width, height]);
  const mantel = useMemo(() => newYearClockRegion(width, height), [width, height]);
  const swaying = useMemo(() => newYearBaubleRegion(width, height), [width, height]);
  const time = useForwardTime(preview);
  // Steady lights and still baubles under Reduce Motion and in previews.
  const reducedMotion = useReducedMotion();
  const still = preview || reducedMotion ? 1 : 0;
  const clock = useLocalClock(preview);
  const { party, playing } = useCelebration(
    celebrate && !preview,
    NEW_YEAR_CONFETTI_SECONDS,
  );
  const lights = useDerivedValue(() => ({ size: scene.size, time: time.value, still }));
  const baubles = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    still,
    gold: scene.gold,
    glow: scene.glow,
  }));
  const hands = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    clock: clock.value,
    wine: scene.wine,
    gold: scene.gold,
  }));
  const confetti = useDerivedValue(() => ({
    size: scene.size,
    party: party.value,
    gold: scene.gold,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the texture is ready, or if the shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={fallback} />
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {newYearBaubles && (
        <Rect {...swaying}>
          <Shader source={newYearBaubles} uniforms={baubles} />
        </Rect>
      )}
      {newYearLights && (
        <Rect x={0} y={band.y} width={width} height={band.height} blendMode="plus">
          <Shader source={newYearLights} uniforms={lights} />
        </Rect>
      )}
      {newYearClock && (
        <Rect {...mantel}>
          <Shader source={newYearClock} uniforms={hands} />
        </Rect>
      )}
      {newYearConfetti && playing && (
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={newYearConfetti} uniforms={confetti} />
        </Rect>
      )}
    </Canvas>
  );
}
