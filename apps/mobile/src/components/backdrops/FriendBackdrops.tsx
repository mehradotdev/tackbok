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

/** Measured, accessibility-hidden full-bleed host shared by the scenes. */
function useMeasuredHost() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const host = (children: ReactNode) => (
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
      {size.width > 0 && size.height > 0 && children}
    </View>
  );
  return { ...size, host };
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
        phase.value = withRepeat(
          withTiming(1, { duration: CYCLE * 1000, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
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

/** Renders a detailed shader once into a texture at device resolution. */
function useShaderTexture(
  effect: SkRuntimeEffect | null,
  uniforms: Record<string, number | number[]>,
  width: number,
  height: number,
  density: number,
) {
  const element = (
    <Group transform={[{ scale: density }]}>
      <Rect x={0} y={0} width={width} height={height}>
        {effect && <Shader source={effect} uniforms={uniforms} />}
      </Rect>
    </Group>
  );
  return useTexture(
    element,
    {
      width: Math.max(1, Math.round(width * density)),
      height: Math.max(1, Math.round(height * density)),
    },
    [effect, JSON.stringify(uniforms), width, height, density],
  );
}

export function DeniseBackdrop({ preview = false }: { preview?: boolean }) {
  const { width, height, host } = useMeasuredHost();
  const background = useCSSVariable('--color-background') as string;
  const time = useAmbientTime(preview);
  const scene = useMemo(
    () => ({
      size: [Math.max(1, width), Math.max(1, height)],
      sky: rgb(background),
      ridge: rgb(DENISE_PALETTE.ridge),
      near: rgb(DENISE_PALETTE.near),
      fogCol: rgb(DENISE_PALETTE.fog),
      sun: rgb(DENISE_PALETTE.sun),
    }),
    [width, height, background],
  );
  const texture = useShaderTexture(deniseScene, scene, width, height, PixelRatio.get());
  const mist = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    fogCol: scene.fogCol,
  }));

  return host(
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {deniseMist && (
        <Rect x={0} y={height * 0.45} width={width} height={height * 0.55}>
          <Shader source={deniseMist} uniforms={mist} />
        </Rect>
      )}
    </Canvas>,
  );
}

export function GiuseppeBackdrop({ preview = false }: { preview?: boolean }) {
  const { width, height, host } = useMeasuredHost();
  const background = useCSSVariable('--color-background') as string;
  const time = useAmbientTime(preview);
  const colors = useMemo(
    () => ({
      size: [Math.max(1, width), Math.max(1, height)],
      deep: rgb(background),
      haze: rgb(GIUSEPPE_PALETTE.haze),
      warm: rgb(GIUSEPPE_PALETTE.warm),
    }),
    [width, height, background],
  );
  const stones = useMemo(
    () => ({
      ...colors,
      stoneA: rgb(GIUSEPPE_PALETTE.stoneA),
      stoneB: rgb(GIUSEPPE_PALETTE.stoneB),
    }),
    [colors],
  );
  // The lake is all soft focus, so one pixel per point is enough.
  const lake = useShaderTexture(giuseppeLake, colors, width, height, 1);
  const cairn = useShaderTexture(giuseppeCairn, stones, width, height, PixelRatio.get());
  const bokeh = useDerivedValue(() => ({
    size: colors.size,
    time: time.value,
    haze: colors.haze,
    warm: colors.warm,
  }));

  return host(
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
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
      <Image image={cairn} x={0} y={0} width={width} height={height} fit="fill" />
    </Canvas>,
  );
}
