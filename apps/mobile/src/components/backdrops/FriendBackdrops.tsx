import { useCallback, useMemo } from 'react';
import { AppState, PixelRatio, StyleSheet } from 'react-native';
import { Canvas, Image, Rect, Shader, Skia } from 'react-native-skia';
import { useFocusEffect } from 'expo-router';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import {
  DENISE_PALETTE,
  GIUSEPPE_PALETTE,
  KRISTEN_PALETTE,
} from '~/lib/theme/theme-tokens';
import { DENISE_MIST, DENISE_SCENE } from './denise-shader';
import { GIUSEPPE_BOKEH, GIUSEPPE_CAIRN, GIUSEPPE_LAKE } from './giuseppe-shader';
import { KRISTEN_MIST, KRISTEN_SCENE } from './kristen-shader';
import { MeasuredHost, rgb, useShaderTexture, type Size } from './scene-kit';

const deniseScene = Skia.RuntimeEffect.Make(DENISE_SCENE);
const deniseMist = Skia.RuntimeEffect.Make(DENISE_MIST);
const giuseppeLake = Skia.RuntimeEffect.Make(GIUSEPPE_LAKE);
const giuseppeCairn = Skia.RuntimeEffect.Make(GIUSEPPE_CAIRN);
const giuseppeBokeh = Skia.RuntimeEffect.Make(GIUSEPPE_BOKEH);
const kristenScene = Skia.RuntimeEffect.Make(KRISTEN_SCENE);
const kristenMist = Skia.RuntimeEffect.Make(KRISTEN_MIST);

/** Seconds of drift before the motion eases back; slow enough to feel ambient. */
const CYCLE = 60;

/** Seconds of ambient motion, easing back and forth; frozen for previews,
 *  Reduce Motion, unfocused screens and the background. */
function useAmbientTime(preview: boolean) {
  const reducedMotion = useReducedMotion();
  const phase = useSharedValue(0);
  useFocusEffect(
    useCallback(() => {
      const stop = () => cancelAnimation(phase);
      if (preview || reducedMotion) {
        stop();
        phase.value = 0;
        return stop;
      }
      const start = () => {
        stop();
        // Resume from the paused point: finish this leg, then swing 1 → 0 → 1.
        // (Repeating from the paused value would only swing between it and 1.)
        const from = phase.value;
        phase.value = withSequence(
          withTiming(1, {
            duration: (1 - from) * CYCLE * 1000,
            easing: Easing.out(Easing.sin),
          }),
          withRepeat(
            withTiming(0, { duration: CYCLE * 1000, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
          ),
        );
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
    }, [preview, reducedMotion, phase]),
  );
  return useDerivedValue(() => phase.value * CYCLE);
}

export function DeniseBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <DeniseScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function DeniseScene({ width, height, preview }: Size & { preview: boolean }) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  const time = useAmbientTime(preview);
  const sky = typeof background === 'string' ? background : DENISE_PALETTE.fog;
  const ink = typeof foreground === 'string' ? foreground : DENISE_PALETTE.near;
  const scene = useMemo(
    () => ({
      size: [width, height],
      sky: rgb(sky),
      ridge: rgb(DENISE_PALETTE.ridge),
      near: rgb(DENISE_PALETTE.near),
      fogCol: rgb(DENISE_PALETTE.fog),
      sun: rgb(DENISE_PALETTE.sun),
      ink: rgb(ink),
    }),
    [width, height, sky, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const texture = useShaderTexture(deniseScene, scene, full, PixelRatio.get());
  const mist = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    fogCol: scene.fogCol,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the texture is ready, or if the shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={sky} />
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {deniseMist && (
        <Rect x={0} y={height * 0.45} width={width} height={height * 0.55}>
          <Shader source={deniseMist} uniforms={mist} />
        </Rect>
      )}
    </Canvas>
  );
}

export function GiuseppeBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <GiuseppeScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function GiuseppeScene({ width, height, preview }: Size & { preview: boolean }) {
  const background = useCSSVariable('--color-background');
  const time = useAmbientTime(preview);
  const deep = typeof background === 'string' ? background : '#10262a';
  const colors = useMemo(
    () => ({
      size: [width, height],
      deep: rgb(deep),
      haze: rgb(GIUSEPPE_PALETTE.haze),
      warm: rgb(GIUSEPPE_PALETTE.warm),
    }),
    [width, height, deep],
  );
  const stones = useMemo(
    () => ({
      ...colors,
      stoneA: rgb(GIUSEPPE_PALETTE.stoneA),
      stoneB: rgb(GIUSEPPE_PALETTE.stoneB),
    }),
    [colors],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  // The cairn stands in the bottom-right corner (see stoneShape in the shader:
  // the boulder reaches 0.70 × width − 150 pt, the top stone 250 pt up); bake only that.
  const corner = useMemo(() => {
    const scale = Math.min(width / 390, height / 700);
    const x = Math.max(0, Math.floor(width * 0.7 - 175 * scale));
    const y = Math.max(0, Math.floor(height - 260 * scale));
    return { x, y, width: width - x, height: height - y };
  }, [width, height]);
  // The lake is all soft focus, so one pixel per point is enough.
  const lake = useShaderTexture(giuseppeLake, colors, full, 1);
  const cairn = useShaderTexture(giuseppeCairn, stones, corner, PixelRatio.get());
  const bokeh = useDerivedValue(() => ({
    size: colors.size,
    time: time.value,
    haze: colors.haze,
    warm: colors.warm,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the textures are ready, or if a shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={deep} />
      <Image image={lake} x={0} y={0} width={width} height={height} fit="fill" />
      {giuseppeBokeh && (
        <Rect
          x={0}
          y={height * 0.55}
          width={width}
          height={height * 0.45}
          blendMode="plus">
          <Shader source={giuseppeBokeh} uniforms={bokeh} />
        </Rect>
      )}
      <Image image={cairn} {...corner} fit="fill" />
    </Canvas>
  );
}

export function KristenBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <KristenScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function KristenScene({ width, height, preview }: Size & { preview: boolean }) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  const time = useAmbientTime(preview);
  const sky = typeof background === 'string' ? background : KRISTEN_PALETTE.haze;
  const ink = typeof foreground === 'string' ? foreground : KRISTEN_PALETTE.pine;
  const scene = useMemo(
    () => ({
      size: [width, height],
      sky: rgb(sky),
      skyTop: rgb(KRISTEN_PALETTE.skyTop),
      granite: rgb(KRISTEN_PALETTE.granite),
      shade: rgb(KRISTEN_PALETTE.shade),
      streak: rgb(KRISTEN_PALETTE.streak),
      pine: rgb(KRISTEN_PALETTE.pine),
      haze: rgb(KRISTEN_PALETTE.haze),
      sun: rgb(KRISTEN_PALETTE.sun),
      ink: rgb(ink),
    }),
    [width, height, sky, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const texture = useShaderTexture(kristenScene, scene, full, PixelRatio.get());
  const mist = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    haze: scene.haze,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the texture is ready, or if the shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={sky} />
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {kristenMist && (
        // The mist bands centre on 0.73 and 0.84 of the height (see KRISTEN_MIST).
        <Rect x={0} y={height * 0.62} width={width} height={height * 0.38}>
          <Shader source={kristenMist} uniforms={mist} />
        </Rect>
      )}
    </Canvas>
  );
}
