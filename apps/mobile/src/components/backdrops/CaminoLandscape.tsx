import { useMemo } from 'react';
import { Circle, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import {
  ARROW,
  BACKPACK,
  caminoLandscape,
  CATHEDRAL,
  PILGRIM,
  SHELL,
  WAYMARKER,
  WAYMARKER_FACE,
  WAYMARKER_SIDE,
} from './camino-art';

function mix(a: string, b: string, amount: number) {
  const left = Skia.Color(a),
    right = Skia.Color(b);
  return `rgb(${[0, 1, 2].map((i) => Math.round((left[i] * (1 - amount) + right[i] * amount) * 255)).join(',')})`;
}

/** Shared native artwork for screens and still previews. Entries can cover the
 * entire canvas, so the final readability wash also covers the waymarker. */
export function CaminoLandscape({
  width,
  height,
  night,
  background,
  foreground,
  primary,
}: {
  width: number;
  height: number;
  night: boolean;
  background: string;
  foreground: string;
  primary: string;
}) {
  const palette = useMemo(
    () => ({
      distant: mix(background, night ? primary : '#8cacc1', 0.5),
      hills: mix(background, night ? '#45617e' : '#8fa7af', 0.68),
      meadow: mix(background, night ? '#415664' : '#b5b18b', 0.8),
      foliage: night ? '#122638' : '#647d76',
      trail: night ? '#75818b' : '#fff0d6',
      stone: night ? '#89949b' : '#e1d5bc',
      stoneSide: night ? '#4c5d6e' : '#aa9d83',
      ink: mix(background, foreground, night ? 0.22 : 0.8),
      gold: '#edb74f',
      blue: night ? '#163759' : '#23578a',
    }),
    [background, foreground, primary, night],
  );
  const { shapes, depth, top } = useMemo(
    () => caminoLandscape(width, height, palette),
    [width, height, palette],
  );
  const markerScale = Math.min(width * 0.00285, height * 0.0021);
  const markerX = width - 113 * markerScale - Math.min(width * 0.045, 36);
  const markerY = Math.min(height * 0.49, height - 194 * markerScale - 12);
  const cathedralScale = Math.min(width * 0.0014, depth * 0.0024);
  const pilgrimScale = depth * 0.0015;
  return (
    <Group>
      {shapes.map((shape, i) => (
        <Path key={i} {...shape} />
      ))}
      <Group
        transform={[
          { translateX: width * 0.12 },
          { translateY: top + depth * 0.2 - 90 * cathedralScale },
          { scale: cathedralScale },
        ]}
        opacity={0.7}>
        <Path path={CATHEDRAL} color={palette.hills} />
        {[13, 77].map((x) => (
          <Path
            key={x}
            path={`M ${x} 45 L ${x + 4} 45 L ${x + 4} 53 L ${x} 53 Z`}
            color={night ? palette.gold : palette.stone}
          />
        ))}
        <Path path="M 43 90 L 43 74 Q 47 65 51 74 L 51 90 Z" color={palette.foliage} />
      </Group>
      {[0, 1, 2].map((i) => {
        const x = width - depth * (0.02 + i * 0.07),
          y = top + depth * (0.05 + i * 0.075),
          s = depth * (0.0011 - i * 0.00015);
        return (
          <Group
            key={i}
            transform={[{ translateX: x }, { translateY: y }, { scale: s }]}
            opacity={0.65}>
            <Path
              path="M -5 200 L -3 16 Q 0 0 3 16 L 6 200 Z M 0 5 Q -18 26 -10 46 Q -30 59 -18 82 Q -38 100 -24 120 Q -44 155 -22 178 L 0 192 L 22 178 Q 43 150 25 124 Q 34 100 19 84 Q 28 57 11 46 Q 18 25 0 5 Z"
              color={palette.foliage}
            />
          </Group>
        );
      })}
      <Group
        transform={[
          { translateX: width * 0.4 },
          { translateY: top + depth * 0.52 - 86 * pilgrimScale },
          { scale: pilgrimScale },
        ]}>
        <Path path={PILGRIM} color={palette.ink} />
        <Path path={BACKPACK} color={palette.hills} />
        <Path
          path="M 2 44 L -3 87 M 28 43 L 35 86"
          style="stroke"
          strokeWidth={1.8}
          color={palette.ink}
        />
      </Group>
      <Group
        transform={[
          { translateX: markerX },
          { translateY: markerY },
          { scale: markerScale },
        ]}>
        <Path
          path="M -13 194 Q 46 180 123 192 Q 132 201 66 204 Q 4 207 -13 194 Z"
          color={palette.foliage}
          opacity={0.22}
        />
        <Path path={WAYMARKER} color={palette.stone} />
        <Path path={WAYMARKER_SIDE} color={palette.stoneSide} />
        {Array.from({ length: 70 }, (_, i) => {
          const x = 16 + ((i * 29) % 65),
            y = 17 + ((i * 43) % 173);
          return (
            <Circle
              key={i}
              cx={x}
              cy={y}
              r={0.6 + (i % 3) * 0.45}
              color={i % 2 ? palette.stoneSide : palette.trail}
              opacity={0.38}
            />
          );
        })}
        <Path path={WAYMARKER_FACE} color={palette.blue} />
        <Path
          path={WAYMARKER_FACE}
          color={palette.trail}
          style="stroke"
          strokeWidth={1.5}
        />
        <Path path={SHELL} color={palette.gold} />
        <Path path={ARROW} color={palette.gold} />
        <Path
          path="M 14 193 Q 23 175 18 165 M 29 196 Q 34 172 43 163 M 85 195 Q 78 175 82 160"
          style="stroke"
          strokeWidth={2}
          color={palette.foliage}
        />
      </Group>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        color={background}
        opacity={night ? 0.64 : 0.5}
      />
    </Group>
  );
}
