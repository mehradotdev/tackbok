import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AppState, PixelRatio, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Group,
  Image,
  Rect,
  Shader,
  Skia,
  useTexture,
  type SkRuntimeEffect,
} from 'react-native-skia';
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
import { DENISE_PALETTE, GIUSEPPE_PALETTE } from '~/lib/theme/theme-tokens';
import { DENISE_MIST, DENISE_SCENE } from './denise-shader';
import { GIUSEPPE_BOKEH, GIUSEPPE_CAIRN, GIUSEPPE_LAKE } from './giuseppe-shader';

const deniseScene = Skia.RuntimeEffect.Make(DENISE_SCENE);
const deniseMist = Skia.RuntimeEffect.Make(DENISE_MIST);
const giuseppeLake = Skia.RuntimeEffect.Make(GIUSEPPE_LAKE);
const giuseppeCairn = Skia.RuntimeEffect.Make(GIUSEPPE_CAIRN);
const giuseppeBokeh = Skia.RuntimeEffect.Make(GIUSEPPE_BOKEH);

const rgb = (color: string) => Array.from(Skia.Color(color)).slice(0, 3);
/** Seconds of drift before the motion eases back; slow enough to feel ambient. */
const CYCLE = 60;

type Size = { width: number; height: number };
type Region = Size & { x: number; y: number };

/** Measured, accessibility-hidden full-bleed host; renders the scene once sized. */
function MeasuredHost({ children }: { children: (size: Size) => ReactNode }) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
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
      {size.width > 0 && size.height > 0 && children(size)}
    </View>
  );
}

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

/**
 * Renders a detailed shader once into a texture at `density` pixels per point.
 * The shader always sees full-screen point coordinates; `region` limits the
 * texture to the part of the screen the art covers.
 */
function useShaderTexture(
  effect: SkRuntimeEffect | null,
  uniforms: Record<string, number | number[]>,
  region: Region,
  density: number,
) {
  const { x, y, width, height } = region;
  // useTexture redraws whenever the size object changes identity, so keep it stable.
  const pixels = useMemo(
    () => ({
      width: Math.max(1, Math.round(width * density)),
      height: Math.max(1, Math.round(height * density)),
    }),
    [width, height, density],
  );
  const element = (
    <Group transform={[{ scale: density }, { translateX: -x }, { translateY: -y }]}>
      {/* A failed shader draws nothing (a bare Rect would paint black over the scene). */}
      {effect && (
        <Rect x={x} y={y} width={width} height={height}>
          <Shader source={effect} uniforms={uniforms} />
        </Rect>
      )}
    </Group>
  );
  return useTexture(element, pixels, [
    effect,
    JSON.stringify(uniforms),
    x,
    y,
    width,
    height,
    density,
  ]);
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
