/** Original Camino illustration. Paths use container coordinates; landmarks use
 * uniform local scales so wide layouts reveal countryside without stretching art. */
export interface CaminoShape {
  path: string;
  color: string;
  opacity?: number;
}
export interface CaminoPalette {
  distant: string;
  hills: string;
  meadow: string;
  foliage: string;
  trail: string;
  stone: string;
  stoneSide: string;
  ink: string;
  gold: string;
  blue: string;
}

export function caminoLandscape(width: number, height: number, p: CaminoPalette) {
  const shapes: CaminoShape[] = [];
  const add = (path: string, color: string, opacity = 1) =>
    shapes.push({ path, color, opacity });
  // A full-width landscape with a depth bounded by the short side.
  const depth = Math.min(height * 0.53, width * 0.95);
  const top = height - depth;
  const pt = (x: number, y: number) => `${x * width} ${top + y * depth}`;
  add(
    `M ${pt(0, 0.22)} Q ${pt(0.14, 0.12)} ${pt(0.32, 0.23)} T ${pt(0.7, 0.17)} T ${pt(1, 0.19)} L ${width} ${height} L 0 ${height} Z`,
    p.distant,
  );
  add(
    `M ${pt(0, 0.37)} Q ${pt(0.22, 0.17)} ${pt(0.47, 0.34)} T ${pt(1, 0.24)} L ${width} ${height} L 0 ${height} Z`,
    p.hills,
  );
  add(
    `M ${pt(0, 0.48)} Q ${pt(0.2, 0.54)} ${pt(0.48, 0.36)} T ${pt(1, 0.39)} L ${width} ${height} L 0 ${height} Z`,
    p.meadow,
  );
  add(
    `M ${pt(0.43, 0.37)} C ${pt(0.05, 0.48)} ${pt(0.73, 0.5)} ${pt(0.36, 0.64)} C ${pt(0.1, 0.74)} ${pt(0.09, 0.81)} ${pt(0.54, 1)} L ${pt(0, 1)} C ${pt(0.01, 0.78)} ${pt(0.04, 0.73)} ${pt(0.25, 0.62)} C ${pt(0.57, 0.49)} ${pt(0.07, 0.47)} ${pt(0.43, 0.37)} Z`,
    p.trail,
  );
  // Fine ground texture is batched into two paths, keeping draw calls bounded.
  let grain = '',
    highlights = '';
  for (let i = 0; i < 700; i++) {
    const x = (((i * 73.317) % 997) / 997) * width;
    const t = ((i * 41.719) % 991) / 991;
    const y = top + depth * (0.4 + t * 0.6);
    const r = depth * (0.0007 + t * 0.0024);
    const fleck = `M ${x - r} ${y} Q ${x} ${y - r * 0.65} ${x + r * 1.7} ${y} Q ${x} ${y + r * 0.65} ${x - r} ${y} Z `;
    if (i % 3) grain += fleck;
    else highlights += fleck;
  }
  add(grain, p.stoneSide, 0.23);
  add(highlights, p.trail, 0.25);
  // Distant hedgerows and trees, deterministic across rerenders and previews.
  for (let i = 0; i < 42; i++) {
    const x = i / 41;
    const y = 0.34 + Math.sin(x * 11) * 0.055;
    const r = depth * (0.012 + ((i * 7) % 11) * 0.001);
    const cx = x * width,
      cy = top + y * depth;
    add(
      `M ${cx - r} ${cy + r} Q ${cx - r * 1.6} ${cy - r} ${cx} ${cy - r * 2} Q ${cx + r * 1.5} ${cy - r} ${cx + r} ${cy + r} Z`,
      p.foliage,
      0.38,
    );
  }
  // Foreground banks keep the winding trail open toward the left.
  add(
    `M ${pt(0.7, 0.48)} Q ${pt(0.85, 0.4)} ${pt(1, 0.49)} L ${pt(1, 1)} L ${pt(0.57, 1)} Q ${pt(0.42, 0.82)} ${pt(0.68, 0.66)} Z`,
    p.foliage,
    0.26,
  );
  for (let i = 0; i < 190; i++) {
    const x = ((i * 47) % 101) / 100;
    const y = 0.56 + ((i * 31) % 43) / 100;
    if (x > 0.12 && x < 0.57) continue;
    const cx = x * width,
      cy = top + y * depth;
    const s = depth * (0.004 + y * 0.011);
    add(
      `M ${cx} ${cy} Q ${cx - s} ${cy - s * 1.6} ${cx - s * 0.65} ${cy - s * 3} Q ${cx + s * 0.2} ${cy - s} ${cx} ${cy} M ${cx} ${cy} Q ${cx + s * 2} ${cy - s * 2} ${cx + s * 1.4} ${cy - s * 2.5} Q ${cx + s * 0.6} ${cy - s * 0.6} ${cx} ${cy} Z`,
      p.foliage,
      0.6,
    );
    if (i % 2 === 0) {
      const fy = cy - s * 2.5,
        r = s * 0.24;
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 0.4,
          dx = Math.cos(a) * r * 2,
          dy = Math.sin(a) * r * 2;
        add(
          `M ${cx} ${fy} Q ${cx + dx - r} ${fy + dy - r} ${cx + dx} ${fy + dy} Q ${cx + dx + r} ${fy + dy + r} ${cx} ${fy} Z`,
          p.gold,
        );
      }
    }
  }
  // Pale, irregular stones beside the right bank.
  for (let i = 0; i < 25; i++) {
    const t = i / 24,
      x = width * (0.66 - 0.12 * Math.sin(t * 4)),
      y = top + depth * (0.59 + t * 0.4);
    const r = depth * (0.006 + t * 0.018);
    add(
      `M ${x - r} ${y} L ${x - r * 0.5} ${y - r} L ${x + r * 0.6} ${y - r * 0.8} L ${x + r} ${y} L ${x + r * 0.3} ${y + r * 0.4} Z`,
      i % 2 ? p.stone : p.stoneSide,
    );
  }
  return { shapes, depth, top };
}

// Local coordinates: a small, deliberately distant cathedral, not a city skyline.
export const CATHEDRAL =
  'M 0 90 L 0 62 L 8 62 L 8 36 L 12 36 L 15 19 L 18 36 L 22 36 L 22 61 L 34 61 L 34 48 L 47 38 L 60 48 L 60 61 L 72 61 L 72 36 L 76 36 L 79 19 L 82 36 L 86 36 L 86 62 L 94 62 L 94 90 Z M 12 19 L 15 8 L 18 19 Z M 76 19 L 79 8 L 82 19 Z';
export const PILGRIM =
  'M 12 14 Q 10 2 18 2 Q 26 2 24 14 Z M 7 14 Q 18 10 29 14 L 29 17 L 7 17 Z M 12 20 Q 19 17 25 21 L 31 47 L 25 50 L 23 33 L 24 61 L 22 86 L 17 86 L 16 62 L 13 86 L 8 86 L 11 57 L 8 33 L 4 51 L 0 49 L 6 25 Z';
export const BACKPACK = 'M 11 25 Q 18 20 24 26 L 25 48 Q 18 54 10 48 Z';
export const WAYMARKER =
  'M 3 194 L 6 142 L 8 79 L 10 25 Q 9 15 19 11 L 27 5 L 53 2 L 69 0 L 87 7 Q 100 9 101 22 L 105 81 L 108 135 L 113 194 Z';
export const WAYMARKER_SIDE = 'M 69 0 L 100 12 L 113 194 L 91 194 L 82 18 Z';
export const WAYMARKER_FACE = 'M 22 32 L 73 28 L 76 88 L 20 91 Z';
export const ARROW = 'M 66 117 L 37 117 L 37 107 L 20 123 L 37 139 L 37 129 L 66 129 Z';
export const SHELL = Array.from({ length: 9 }, (_, i) => {
  const a = ((-77 + i * 19) * Math.PI) / 180;
  return `M 29 62 L ${32 + Math.cos(a - 0.025) * 34} ${60 + Math.sin(a - 0.025) * 24} L ${32 + Math.cos(a + 0.025) * 34} ${60 + Math.sin(a + 0.025) * 24} L 29 65 Z`;
}).join(' ');
