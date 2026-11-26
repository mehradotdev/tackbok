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
import { PINE_NIGHT_PALETTE, VELVET_PALETTE } from '~/lib/theme/theme-tokens';
import type { BackdropProps } from './ThemeBackdrop';
import { claimCelebration } from './celebration';
import {
  PINE_FIREWORKS_SECONDS,
  PINE_LIGHTS,
  PINE_SCENE,
  PINE_SNOW,
} from './pine-night-shader';
import {
  MeasuredHost,
  rgb,
  useForwardTime,
  useShaderTexture,
  useWhileFocused,
  type Size,
} from './scene-kit';
import {
  VELVET_CLOCK,
  VELVET_CONFETTI,
  VELVET_CONFETTI_SECONDS,
  VELVET_LIGHTS,
  VELVET_SCENE,
  velvetClockRegion,
} from './velvet-shader';

const pineScene = Skia.RuntimeEffect.Make(PINE_SCENE);
const pineLights = Skia.RuntimeEffect.Make(PINE_LIGHTS);
const pineSnow = Skia.RuntimeEffect.Make(PINE_SNOW);
const velvetScene = Skia.RuntimeEffect.Make(VELVET_SCENE);
const velvetLights = Skia.RuntimeEffect.Make(VELVET_LIGHTS);
const velvetClock = Skia.RuntimeEffect.Make(VELVET_CLOCK);
const velvetConfetti = Skia.RuntimeEffect.Make(VELVET_CONFETTI);

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

/** The real local time for Velvet's clock: hours, minutes, seconds (-1 hides the
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

export function PineNightBackdrop({ preview = false, celebrate = false }: BackdropProps) {
  return (
    <MeasuredHost>
      {(size) => <PineNightScene {...size} preview={preview} celebrate={celebrate} />}
    </MeasuredHost>
  );
}

function PineNightScene({ width, height, preview, celebrate }: SceneProps) {
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
      snow: rgb(PINE_NIGHT_PALETTE.snow),
      pine: rgb(PINE_NIGHT_PALETTE.pine),
      warm: rgb(PINE_NIGHT_PALETTE.warm),
      berry: rgb(PINE_NIGHT_PALETTE.berry),
      ink: rgb(ink),
    }),
    [width, height, sky, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const texture = useShaderTexture(pineScene, scene, full, PixelRatio.get());
  const time = useForwardTime(preview);
  const { party } = useCelebration(celebrate && !preview, PINE_FIREWORKS_SECONDS);
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
      {pineLights && (
        <Rect x={0} y={0} width={width} height={height} blendMode="plus">
          <Shader source={pineLights} uniforms={lights} />
        </Rect>
      )}
      {pineSnow && (
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={pineSnow} uniforms={snowfall} />
        </Rect>
      )}
    </Canvas>
  );
}

export function VelvetBackdrop({ preview = false, celebrate = false }: BackdropProps) {
  return (
    <MeasuredHost>
      {(size) => <VelvetScene {...size} preview={preview} celebrate={celebrate} />}
    </MeasuredHost>
  );
}

function VelvetScene({ width, height, preview, celebrate }: SceneProps) {
  const background = useCSSVariable('--color-background');
  const fallback = typeof background === 'string' ? background : VELVET_PALETTE.wine;
  const scene = useMemo(
    () => ({
      size: [width, height],
      wine: rgb(VELVET_PALETTE.wine),
      rose: rgb(VELVET_PALETTE.rose),
      gold: rgb(VELVET_PALETTE.gold),
      glow: rgb(VELVET_PALETTE.glow),
    }),
    [width, height],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const texture = useShaderTexture(velvetScene, scene, full, PixelRatio.get());
  // The garlands hang from 17% to 34% of the height. The lowest sags 50 pt
  // (scaled), its bulbs hang 2.5 pt below the wire, and their glow reaches 12 pt.
  const band = useMemo(() => {
    const scale = Math.min(width / 390, height / 700);
    const y = Math.max(0, Math.floor(height * 0.17 - 14 * scale));
    return { y, height: Math.min(height, Math.ceil(height * 0.34 + 68 * scale)) - y };
  }, [width, height]);
  const mantel = useMemo(() => velvetClockRegion(width, height), [width, height]);
  const time = useForwardTime(preview);
  const clock = useLocalClock(preview);
  const { party, playing } = useCelebration(
    celebrate && !preview,
    VELVET_CONFETTI_SECONDS,
  );
  const lights = useDerivedValue(() => ({ size: scene.size, time: time.value }));
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
      {velvetLights && (
        <Rect x={0} y={band.y} width={width} height={band.height} blendMode="plus">
          <Shader source={velvetLights} uniforms={lights} />
        </Rect>
      )}
      {velvetClock && (
        <Rect {...mantel}>
          <Shader source={velvetClock} uniforms={hands} />
        </Rect>
      )}
      {velvetConfetti && playing && (
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={velvetConfetti} uniforms={confetti} />
        </Rect>
      )}
    </Canvas>
  );
}
