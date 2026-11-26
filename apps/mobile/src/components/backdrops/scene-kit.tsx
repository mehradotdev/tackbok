import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Group,
  Rect,
  Shader,
  Skia,
  useTexture,
  type SkRuntimeEffect,
} from 'react-native-skia';

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
