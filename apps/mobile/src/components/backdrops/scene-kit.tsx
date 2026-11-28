import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type FrameInfo,
} from 'react-native-reanimated';
import {
  Group,
  Rect,
  Shader,
  Skia,
  useTexture,
  type SkRuntimeEffect,
} from 'react-native-skia';
import { WRAP_SECONDS } from './loop-phase';

// Shared plumbing for the shader-painted backdrops (friend and festive themes).

export const rgb = (color: string) => Array.from(Skia.Color(color)).slice(0, 3);

export type Size = { width: number; height: number };
export type Region = Size & { x: number; y: number };

/** Measured, accessibility-hidden full-bleed host; renders the scene once sized. */
export function MeasuredHost({ children }: { children: (size: Size) => ReactNode }) {
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

/**
 * Renders a detailed shader once into a texture at `density` pixels per point.
 * The shader always sees full-screen point coordinates; `region` limits the
 * texture to the part of the screen the art covers.
 */
export function useShaderTexture(
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

/**
 * While the screen is focused, runs `onChange(active)` now and whenever the app
 * enters or leaves the foreground; the cleanup it returns runs before the next
 * call and when the screen loses focus.
 */
export function useWhileFocused(onChange: (active: boolean) => (() => void) | void) {
  useFocusEffect(
    useCallback(() => {
      let cleanup: (() => void) | void;
      const update = (state: string | null | undefined) => {
        cleanup?.();
        cleanup = onChange(state === 'active');
      };
      update(AppState.currentState);
      const subscription = AppState.addEventListener('change', update);
      return () => {
        subscription.remove();
        cleanup?.();
      };
    }, [onChange]),
  );
}

/**
 * Seconds of forward motion (falling snow, rising bubbles) while the scene is on
 * screen; frozen for previews, Reduce Motion, unfocused screens and the background.
 */
export function useForwardTime(preview: boolean) {
  const reducedMotion = useReducedMotion();
  const time = useSharedValue(0);
  const running = useSharedValue(false);
  const frame = useFrameCallback(
    useCallback(
      ({ timeSincePreviousFrame }: FrameInfo) => {
        'worklet';
        if (running.value)
          time.value =
            (time.value + Math.min(timeSincePreviousFrame ?? 0, 50) / 1000) %
            WRAP_SECONDS;
      },
      [running, time],
    ),
    false,
  );
  useWhileFocused(
    useCallback(
      (active: boolean) => {
        if (!active || preview || reducedMotion) return;
        running.value = true;
        frame.setActive(true);
        return () => {
          running.value = false;
          frame.setActive(false);
        };
      },
      [preview, reducedMotion, running, frame],
    ),
  );
  return time;
}
