import { Skia } from '@shopify/react-native-skia';

export interface MeadowBlade {
  x: number;
  base: number;
  height: number;
  width: number;
  phase: number;
  seed: boolean;
}

/** Width adds plants instead of stretching a fixed phone illustration. */
export function meadowBlades(
  width: number,
  height: number,
  layer: number,
): MeadowBlade[] {
  const unit = Math.min(width, height, 620);
  const depth = Math.min(height * 0.27, unit * 0.55);
  const spacing = unit / (layer === 0 ? 65 : layer === 1 ? 44 : 30);
  const count = Math.ceil(width / spacing) + 6;
  return Array.from({ length: count }, (_, i) => {
    const random = (n: number) => ((i * 137 + n * 79 + layer * 31) % 101) / 101;
    const x = (i - 3 + random(1) * 0.65) * spacing;
    const edge = Math.min(1, Math.abs(x / width - 0.5) * 2);
    return {
      x,
      base: height + depth * (layer === 0 ? -0.07 : 0.03),
      height:
        depth *
        ((layer === 0 ? 0.65 : layer === 1 ? 0.58 : 0.45) +
          random(2) * 0.4 +
          edge * 0.18),
      width: unit * (layer === 0 ? 0.003 : 0.005) * (0.6 + random(3)),
      phase: random(4) * Math.PI * 2,
      seed: layer === 2 && i % 5 === 0,
    };
  });
}

export function bladeBend(blade: MeadowBlade, time: number) {
  'worklet';
  const gust = Math.pow(Math.max(0, Math.sin(time * 0.48 - blade.x * 0.004)), 4);
  return blade.height * (0.07 + Math.sin(time * 1.8 + blade.phase) * 0.08 + gust * 0.16);
}

/** One batched path per depth layer; roots stay fixed while tips bend. */
export function meadowPath(blades: MeadowBlade[], time: number) {
  'worklet';
  const path = Skia.PathBuilder.Make();
  for (const blade of blades) {
    const { x, base, height, width, seed } = blade;
    const bend = bladeBend(blade, time);
    const tipX = x + bend;
    const tipY = base - height;
    path.moveTo(x - width, base);
    path.cubicTo(
      x - width,
      base - height * 0.35,
      x + bend * 0.45,
      tipY + height * 0.15,
      tipX,
      tipY,
    );
    path.cubicTo(
      x + bend * 0.72,
      tipY + height * 0.3,
      x + width,
      base - height * 0.25,
      x + width,
      base,
    );
    path.close();
    if (seed) {
      for (let j = 0; j < 5; j++) {
        const y = tipY + j * width * 2.2;
        const stemX = tipX - j * width * 0.15;
        const side = j % 2 ? -1 : 1;
        path.moveTo(stemX, y + width * 2);
        path.quadTo(
          stemX + side * width * 4,
          y - width * 2,
          stemX + side * width * 2.3,
          y - width * 3,
        );
        path.quadTo(stemX, y - width, stemX, y + width * 2);
        path.close();
      }
    }
  }
  return path.detach();
}

export const DRAGONFLY_BODY =
  'M -1 -9 Q -3 -5 -1 1 L -0.7 13 Q 0 16 0.7 13 L 1 1 Q 3 -5 1 -9 Z';
export const DRAGONFLY_WINGS =
  'M 0 -3 C -9 -12 -20 -8 -16 -4 Q -8 1 0 0 C -10 0 -16 7 -12 8 Q -5 9 0 1 C 10 10 17 7 12 3 L 0 0 C 20 0 22 -8 15 -8 Q 7 -9 0 -3 Z';
export const MOTH_BODY = 'M 0 -6 Q -3 -3 -1 6 Q 0 9 1 6 Q 3 -3 0 -6 Z';
export const MOTH_WINGS =
  'M 0 -2 C -17 -19 -20 -1 -10 3 C -16 12 -4 14 0 3 C 4 14 16 12 10 3 C 20 -1 17 -19 0 -2 Z';
