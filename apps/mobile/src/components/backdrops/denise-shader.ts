import { DENISE_OUTLINES } from './denise-outlines.generated';

/**
 * Denise: a rainy blue hour seen from a dark room through a carved hill-village
 * window. A cusped arch in a blue wooden frame with open shutters looks out on
 * snow peaks rising from a cloud bank, misty pine ridges with farmhouse lights,
 * terraces and a lit house. Denise, seen from behind, rests her chin on her
 * hand at the sill beside a steaming mug, lit only by the window.
 *
 * The scene is designed in 390 × 700 units: `s = min(W / 390, H / 700)`, x from
 * the screen's centre, y from the top. Lighting is done in linear light.
 *
 * Three layers are expensive and baked once into textures:
 * - DENISE_ROOM: the room, the view, the frame, the sill and the shutters;
 * - DENISE_FIGURE: the mug, her sweater and her hand (alpha);
 * - DENISE_HEAD: her face and hair at rest (alpha). The canvas tilts this
 *   texture about her chin with `deniseHeadPose`, so she looks around slowly.
 * Two cheap layers animate per frame:
 * - DENISE_AIR, inside the glass: rain, drips from the arch's cusps, chimney
 *   smoke and a drifting mist (drawn under the figure);
 * - DENISE_STEAM: steam from the mug (drawn on top).
 *
 * Text contrast: every layer caps its own pixels at `ceilRatio` against `ink`,
 * so the blend of capped layers stays near the cap too (render-friends checks
 * the composite).
 *
 * The head loop and the drips divide the forward clock's 6 h wrap; rain,
 * smoke and steam may jump once when it wraps.
 */

/** Scene geometry in design units, shared with the canvas. */
export const DENISE_GEOMETRY = {
  /** Head centre (absolute design units). */
  head: { x: 90, y: 372 },
  /** The head turns about her chin on her hand (absolute design units). */
  pivot: { x: 72, y: 404 },
  /** Boxes [x0, y0, x1, y1] each layer must cover. The head box holds the
   *  head at rest; the canvas moves the texture, not the pixels. */
  boxes: {
    glass: [-114, 62, 90, 492],
    figure: [-92, 386, 190, 10000],
    head: [42, 308, 162, 514],
    steam: [-102, 306, -18, 470],
  },
} as const;

export type DeniseBox = keyof typeof DENISE_GEOMETRY.boxes;

export function deniseScale(width: number, height: number) {
  return Math.min(width / 390, height / 700);
}

/** A layer's box in points, clamped to the screen. */
export function deniseRegion(width: number, height: number, box: DeniseBox) {
  const s = deniseScale(width, height);
  const [x0, y0, x1, y1] = DENISE_GEOMETRY.boxes[box];
  const left = Math.max(0, Math.floor(width / 2 + x0 * s));
  const top = Math.max(0, Math.floor(y0 * s));
  const right = Math.min(width, Math.ceil(width / 2 + x1 * s));
  const bottom = Math.min(height, Math.ceil(y1 * s));
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** Seconds in one head-motion loop. */
export const DENISE_HEAD_LOOP = 24;

function smooth(edge0: number, edge1: number, x: number) {
  'worklet';
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Her head on a 24 s loop with pauses: rest, lean toward the window and lift
 * the gaze, hold, settle back past centre, hold, a small contented nod, rest.
 * Returns the rotation (radians, about DENISE_GEOMETRY.pivot) and the offset
 * (design units) to apply to the head texture.
 */
export function deniseHeadPose(seconds: number) {
  'worklet';
  const c = ((seconds % DENISE_HEAD_LOOP) + DENISE_HEAD_LOOP) % DENISE_HEAD_LOOP;
  const lean = smooth(2.5, 6, c) - smooth(10.5, 13.5, c);
  const back = smooth(13, 15.5, c) - smooth(17.5, 20, c);
  const nod = smooth(20.3, 21.3, c) - smooth(21.6, 23.2, c);
  return {
    angle: ((-3.2 * lean + 1.4 * back + 1.2 * nod) * Math.PI) / 180,
    dx: -lean,
    dy: -1.8 * lean + 0.9 * nod,
  };
}

/** Constants, noise, colour and the window's shape, shared by every layer. */
const COMMON = `
const float CX = -12.0;            // window centre x
const float HW = 109.0;            // window half width
const float E = 40.0;              // pointed-arch centre offset
const float SPRING = 200.0;        // springline
const float SILL = 489.0;          // sill top
const float FT = 34.0;             // top of the wooden frame
const float PI = 3.14159265;
const float EXPOSURE = 0.33;       // the bright view, exposed for the dark room
const float2 HEAD = float2(90.0, 372.0);
const float2 WIN = float2(-12.0, 300.0);   // where the window light comes from

// Sine-free hashes (after Dave Hoskins): sin() of large arguments differs
// between GPUs and the CPU renderer, which would reshape the mountains.
float hash(float x) {
  x = fract(x * 0.1031);
  x *= x + 33.33;
  x *= x + x;
  return fract(x);
}
float hash2(float2 p) {
  float3 p3 = fract(float3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + float2(1, 0)), f.x),
             mix(hash2(i + float2(0, 1)), hash2(i + float2(1, 1)), f.x), f.y);
}
float fbm(float2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// Colours are authored in gamma 2.2 and lit in linear light.
float3 lin(float3 c) { return pow(c, float3(2.2)); }
float lum(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }
float3 srgbToLinear(float3 c) {
  return mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, float3(2.4)), step(0.04045, c));
}
float cover(float d, float w) { return 1.0 - smoothstep(-w, w, d); }
float sdEllipse(float2 p, float2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }

float sceneScale(float2 size) { return min(size.x / 390.0, size.y / 700.0); }
float2 designPoint(float2 xy, float2 size) {
  return (xy - float2(size.x * 0.5, 0.0)) / sceneScale(size);
}

// Cusped pointed arch over straight jambs, closed by the sill. Negative inside.
float archSD(float2 p, float inset) {
  float hw = HW - inset;
  float2 a = float2(abs(p.x - CX), p.y - SPRING);
  float d = a.x - hw;
  if (a.y < 0.0) {
    float2 v = float2(a.x + E, -a.y);
    float R = hw + E;
    float phi = atan(v.y, v.x);
    float tp = clamp(phi / acos(E / R), 0.0, 1.0);
    float cusp = 6.0 * pow(1.0 - abs(sin(tp * 4.0 * PI)), 4.0);
    d = length(v) - (R - cusp);
  }
  return max(d, p.y - SILL);
}

// Vignette, then the text-contrast ceiling: no pixel brighter than ceilRatio:1
// below the ink. Returns the gamma-encoded colour.
float3 finish(float3 col, float2 xy, float2 size, float3 ink, float ceilRatio) {
  col *= 1.0 - 0.35 * smoothstep(0.5, 1.15, length((xy / size - 0.5) * float2(1.2, 1.0)));
  float ceilLum = (lum(srgbToLinear(ink)) + 0.05) / ceilRatio - 0.05;
  col *= min(1.0, ceilLum / max(lum(col), 1e-5));
  return pow(col, float3(1.0 / 2.2));
}
// A layer drawn over what is below it (premultiplied colour, alpha).
void over(inout float3 pc, inout float a, float3 c, float cov) {
  pc = pc * (1.0 - cov) + c * cov;
  a = a * (1.0 - cov) + cov;
}
`;

const UNIFORMS = `
uniform float2 size;
uniform float3 ink;
uniform float ceilRatio;
`;

/** Figure outlines and helpers for the figure and head layers. */
const FIGURE_COMMON = `
// Accumulates the nearest edge and an even-odd inside test.
void seg(float2 p, float2 a, float2 b, inout float dmin, inout float2 near, inout float wn) {
  float2 pa = p - a, ba = b - a;
  float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float2 q = pa - ba * hh;
  float dd = dot(q, q);
  if (dd < dmin) { dmin = dd; near = q; }
  if ((a.y > p.y) != (b.y > p.y)) {
    if (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) { wn = -wn; }
  }
}
float segDist(float2 p, float2 a, float2 b) {
  float2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
${DENISE_OUTLINES}
`;

/** The room, the view through the window, the carved frame, the sill and the
 *  open shutters. Baked once. */
export const DENISE_ROOM = `${UNIFORMS}${COMMON}
// Ridged 2D field for the far mountain faces (ridges and gullies).
float faceH(float2 q) {
  float r = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(2.0 * noise(q) - 1.0);
    r += a * n * n;
    q = q * 2.1 + float2(1.7, 9.2); a *= 0.48;
  }
  return r;
}

// The view: a cold blue-hour morning in the hills (before exposure).
float3 view(float2 P) {
  float vy = P.y;
  // Overcast sky, brighter low down where the light comes through.
  float3 v = mix(lin(float3(0.46, 0.55, 0.70)), lin(float3(0.60, 0.67, 0.78)), smoothstep(70.0, 300.0, vy));
  v = mix(v, lin(float3(0.62, 0.68, 0.78)), smoothstep(0.45, 0.8, fbm(float2(P.x / 90.0, vy / 26.0))) * 0.5);
  v *= 1.0 - 0.10 * smoothstep(0.5, 0.75, fbm(float2(P.x / 50.0, vy / 14.0 + 3.0)));
  // Far range: snow peaks shaded as a heightfield, so each ridge has a lit
  // face and a shadowed face, with snow lying on the gentler lit slopes.
  float rx = P.x / 150.0 + 19.78;
  float ridge = 0.0, amp = 1.0;
  for (int i = 0; i < 5; i++) {
    float nn = 1.0 - abs(2.0 * noise1(rx + float(i) * 13.1) - 1.0);
    ridge += amp * pow(nn, 1.6);
    rx *= 2.2; amp *= 0.42;
  }
  // The billowy top of the cloud bank at the foot of the range.
  float cTop = 252.0 - 15.0 * abs(2.0 * noise1(P.x / 24.0) - 1.0)
             - 9.0 * noise1(P.x / 70.0 + 3.0) + 6.0 * noise1(P.x / 9.0);
  float dFar = vy - (296.0 - 88.0 * ridge);
  if (dFar > -1.5) {
    float2 mq = float2(P.x / 46.0, dFar / 34.0);
    float hC = faceH(mq), hX = faceH(mq + float2(0.03, 0.0)), hY = faceH(mq + float2(0.0, 0.03));
    float3 nrm = normalize(float3(-(hX - hC) * 26.0, -(hY - hC) * 26.0 + 0.35, 1.0));
    float lit = clamp(dot(nrm, normalize(float3(-0.75, -0.35, 0.45))), 0.0, 1.0);
    float depth = smoothstep(0.0, 70.0, dFar);
    float snowAmt = smoothstep(0.35, 0.6, hC + 0.35 * lit - 0.9 * depth + 0.06 * noise(P / 6.0));
    float3 rock = lin(float3(0.27, 0.33, 0.44)) * (0.55 + 0.6 * lit);
    float3 snowC = lin(float3(0.60, 0.66, 0.76)) * (0.62 + 0.42 * lit);
    float3 mtn = mix(rock, snowC, snowAmt);
    // The lower slopes fade into the mist and vanish into the cloud bank.
    mtn = mix(mtn, v, max(0.16 + 0.84 * smoothstep(8.0, 45.0, dFar), smoothstep(cTop + 2.0, cTop + 20.0, vy)));
    v = mix(v, mtn, cover(-dFar, 0.8));
  }
  // The cloud bank: tops catching the light, greyer undersides.
  float cIn = vy - cTop;
  float cDen = smoothstep(-2.0, 5.0, cIn) * (1.0 - smoothstep(30.0, 62.0, cIn));
  cDen *= 0.75 + 0.25 * fbm(float2(P.x / 30.0, vy / 14.0));
  float3 cloudC = mix(lin(float3(0.64, 0.70, 0.80)), lin(float3(0.47, 0.54, 0.65)), smoothstep(0.0, 28.0, cIn));
  v = mix(v, cloudC, cDen * 0.92);
  // Nearer ridges with sparse pines along their crests, each darker with
  // nearness, with mist pooling in the valleys between them.
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float base = 306.0 + fk * 40.0;
    float top = base - (34.0 + fk * 8.0) * (0.65 * noise1(P.x / (95.0 - fk * 18.0) + fk * 7.7)
                                         + 0.35 * noise1(P.x / 30.0 + fk * 3.1));
    float tw = 2.6 + fk * 0.9;
    float cell = floor(P.x / tw);
    float pine = (2.5 + fk * 1.8) * (0.5 + 0.5 * hash(cell + fk * 31.0)) * max(1.0 - 2.4 * abs(fract(P.x / tw) - 0.5), 0.0);
    pine *= step(0.55, hash(cell * 1.7 + fk)) * step(0.35, noise1(P.x / 20.0 + fk * 4.0));
    float3 tint = mix(lin(float3(0.30, 0.37, 0.48)), lin(float3(0.16, 0.21, 0.27)), fk / 2.0);
    tint *= 0.88 + 0.2 * fbm(P / (5.0 + fk * 2.0) + fk * 9.0);
    v = mix(v, tint, cover(top - pine - vy, 0.9));
    // Steady farmhouse windows on the slopes: three on the middle ridge, two
    // on the nearest, none on the misty far one.
    if (k > 0) {
      for (int j = 0; j < 3; j++) {
        if (k == 2 && j == 2) { break; }
        float fj = float(j);
        float lx = CX + (k == 2 ? -50.0 + 85.0 * fj : -82.0 + 66.0 * fj + 4.0 * fj * fj);
        float lt = base - (34.0 + fk * 8.0) * (0.65 * noise1(lx / (95.0 - fk * 18.0) + fk * 7.7)
                                            + 0.35 * noise1(lx / 30.0 + fk * 3.1));
        float2 lp = (P - float2(lx, mix(lt, base, (k == 2 ? 0.2 : 0.3) + 0.12 * hash(fj + fk)))) / float2(1.0, 0.7);
        float rad = k == 2 ? 1.3 : 1.1;
        v = mix(v, lin(float3(1.0, 0.62, 0.28)) * (k == 2 ? 1.25 : 1.1), cover(length(lp) - rad, 0.4));
        v += lin(float3(1.0, 0.6, 0.3)) * (k == 2 ? 0.05 : 0.04) * exp(-length(lp) / 4.0);
      }
    }
    float my = (vy - base - 6.0) / 20.0;
    float band = smoothstep(-1.8, 0.2, my) * (1.0 - smoothstep(0.2, 2.0, my));
    float2 fp = float2(P.x / 150.0 + fk * 3.7, vy / 26.0);
    v = mix(v, lin(float3(0.56, 0.63, 0.73)), band * smoothstep(0.3, 0.72, fbm(fp)) * 0.85);
  }
  // Near hillside: curved, broken terraces.
  float dNear = vy - (420.0 - 30.0 * noise1(P.x / 80.0 + 2.0) + 0.10 * (P.x - CX));
  if (dNear > -2.0) {
    float3 hill = lin(float3(0.17, 0.22, 0.25)) * (0.85 + 0.25 * fbm(P / 7.0));
    float tc = dNear + 0.0035 * (P.x - CX - 10.0) * (P.x - CX - 10.0) + 5.0 * noise1(P.x / 30.0);
    float edge = (1.0 - smoothstep(0.0, 0.14, fract(tc / 7.0))) * step(0.3, noise(float2(P.x / 14.0, floor(tc / 7.0) * 3.1)));
    hill = mix(hill, lin(float3(0.30, 0.36, 0.44)), edge * 0.55);
    v = mix(v, hill, cover(-dNear, 1.0));
  }
  // The house: stone walls, slate roof, one warm window.
  float2 hp = P - float2(CX + 10.0, 436.0);
  float wall = max(abs(hp.x) - 13.0, abs(hp.y) - 8.0);
  float roof = max(max(abs(hp.x) * 0.55 + (hp.y + 8.0) - 7.0, -(hp.y + 8.0)), abs(hp.x) - 16.0);
  v = mix(v, lin(float3(0.22, 0.24, 0.27)) * (0.9 + 0.2 * fbm(P / 2.0)), cover(wall, 0.6));
  v = mix(v, lin(float3(0.12, 0.14, 0.17)), cover(roof, 0.6));
  float win = max(abs(hp.x + 4.0) - 2.4, abs(hp.y - 1.0) - 2.6);
  v = mix(v, lin(float3(1.0, 0.62, 0.28)) * 1.6, cover(win, 0.5));
  v += lin(float3(1.0, 0.6, 0.3)) * 0.10 * exp(-length(hp - float2(-4.0, 1.0)) / 6.0);
  // A wet tree close outside, filling the lower left of the opening.
  float2 tp = (P - float2(CX - 78.0, 500.0)) / float2(80.0, 105.0);
  float tree = length(tp) - 1.0 + 0.40 * (fbm(P / 9.0 + 4.0) - 0.5) + 0.14 * (fbm(P / 3.5 + 2.0) - 0.5);
  float3 leaf = lin(float3(0.12, 0.17, 0.17)) * (0.7 + 0.6 * smoothstep(0.4, 0.7, fbm(P / 4.0 + 8.0)));
  leaf += lin(float3(0.40, 0.48, 0.55)) * 0.25 * smoothstep(0.6, 0.72, fbm(P / 3.0 + 6.0)) * (1.0 - smoothstep(-0.5, 0.0, tp.y));
  return mix(v, leaf, cover(tree * 40.0, 1.2));
}

half4 main(float2 xy) {
  float2 P = designPoint(xy, size);

  // The room: dark teal-washed mud plaster, lit unevenly by the window.
  float dOpen = archSD(P, 0.0);
  float spill = exp(-max(dOpen, 0.0) / 95.0);
  float pool = exp(-length((P - float2(CX, SILL + 60.0)) / float2(170.0, 110.0)));
  float3 col = lin(float3(0.050, 0.080, 0.095));
  col *= 0.75 + 0.5 * fbm(P / 60.0);
  col *= 0.92 + 0.16 * fbm(P / 9.0 + 3.0);
  col += lin(float3(0.20, 0.25, 0.32)) * (0.55 * spill + 0.35 * pool) * (0.8 + 0.4 * fbm(P / 35.0 + 9.0));
  col *= 1.0 - 0.55 * smoothstep(200.0, 520.0, length((P - float2(CX, 320.0)) * float2(1.0, 0.8)));

  float dGlass = archSD(P, 10.0);
  if (dGlass < 2.0) { col = mix(col, view(P) * EXPOSURE, cover(dGlass, 0.8)); }

  // The carved wooden frame, painted blue, set in the mud wall.
  float3 wood = lin(float3(0.12, 0.30, 0.50));
  float fx = abs(P.x - CX);
  float dOuter = max(fx - (HW + 20.0), max(FT - P.y, P.y - SILL));
  float dInner = max(fx - HW, max(FT + 12.0 - P.y, P.y - SILL));
  if (dOuter < 1.0 && dOpen > -1.0) {
    float near = exp(-max(dOpen, 0.0) / 9.0);
    float3 w = wood * (0.10 + 0.18 * near) * (0.85 + 0.3 * fbm(float2(P.x / 3.0, P.y / 30.0)));
    // Mouldings: a groove along the frame, a bead around the arch.
    float groove = 1.0 - smoothstep(0.4, 1.2, abs(dOuter + 6.0));
    groove = max(groove, (1.0 - smoothstep(0.4, 1.2, abs(dInner))) * step(0.0, dInner + 0.5));
    w *= 1.0 - 0.5 * groove;
    w *= 1.0 + 0.3 * (1.0 - smoothstep(1.0, 3.0, abs(dOpen - 4.0))) * step(dInner, 0.0);
    // Carved rosettes in the spandrels above the arch.
    float2 rq = float2(fx - (HW - 26.0), P.y - (FT + 34.0));
    float petals = 0.5 + 0.5 * cos(8.0 * atan(rq.y, rq.x));
    float rose = (1.0 - smoothstep(0.0, 1.2, abs(length(rq) - (7.0 + 5.0 * petals)))) * step(dInner, 0.0) * step(0.0, dOpen);
    w *= 1.0 - 0.45 * rose;
    w = mix(w, lin(float3(0.22, 0.18, 0.13)) * 0.2, smoothstep(0.8, 0.82, fbm(P / 4.0 + 30.0)) * 0.7);   // chipped paint
    col = mix(col, w, cover(dOuter, 0.6) * smoothstep(-0.6, 0.6, dOpen));
  }
  // The reveal: the frame's thickness around the opening.
  if (dOpen <= 0.0 && dGlass >= 0.0) {
    float side = clamp(dGlass / 10.0, 0.0, 1.0);
    float3 r = wood * 0.9 * (1.0 - 0.5 * side) * (0.85 + 0.25 * fbm(float2(P.x / 3.0, P.y / 24.0)));
    col = mix(col, r, cover(dOpen, 0.7));
  }

  // The sill: lit top face, dark front edge, its shadow on the wall.
  float sx = abs(P.x - CX);
  float sillTop = step(SILL, P.y) * step(P.y, SILL + 18.0) * step(sx, HW + 16.0 + 0.5 * (P.y - SILL));
  float3 sTop = lin(float3(0.30, 0.34, 0.40)) * (1.0 - 0.5 * smoothstep(SILL, SILL + 18.0, P.y))
              * (1.0 - 0.6 * smoothstep(HW - 20.0, HW + 26.0, sx)) * (0.88 + 0.2 * fbm(P / 5.0));
  col = mix(col, sTop, sillTop);
  float sillFront = step(SILL + 18.0, P.y) * step(P.y, SILL + 31.0) * step(sx, HW + 25.0);
  col = mix(col, lin(float3(0.10, 0.12, 0.16)) * (0.8 + 0.3 * fbm(P / 6.0)), sillFront);
  col = mix(col, col * 0.55, step(SILL + 31.0, P.y) * (1.0 - smoothstep(SILL + 31.0, SILL + 70.0, P.y)) * (1.0 - smoothstep(HW, HW + 45.0, sx)));

  // Open blue shutters, full height, hinged on the frame.
  for (int side = 0; side < 2; side++) {
    float sg = side == 0 ? -1.0 : 1.0;
    float xh = CX + sg * (HW + 20.0);
    float u = (P.x - xh) / (sg * 66.0);
    if (u >= 0.0 && u <= 1.0) {
      float topY = mix(FT + 12.0, FT - 16.0, u);
      float botY = mix(SILL, SILL + 44.0, u);
      float vv = (P.y - topY) / (botY - topY);
      if (vv >= 0.0 && vv <= 1.0) {
        float lit = mix(0.85, 0.12, pow(u, 0.7)) * (0.85 + 0.15 * (1.0 - vv));
        float3 paint = lin(float3(0.14, 0.33, 0.55)) * lit;
        // Three raised panels with bevels; planks between.
        float pu = abs(u - 0.5) - 0.33;
        float panel = max(pu, min(abs(vv - 0.17) - 0.12, min(abs(vv - 0.48) - 0.15, abs(vv - 0.81) - 0.14)));
        paint *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.012, abs(panel)));
        paint *= 1.0 + 0.18 * smoothstep(-0.02, 0.0, panel) * step(panel, 0.0);
        paint *= 0.9 + 0.1 * smoothstep(0.02, 0.06, abs(fract(u * 5.0) - 0.5));
        // Glossy streak, brush marks and a few chips.
        float gq = (u - 0.18) / 0.06;
        float gloss = exp(-gq * gq) * (0.6 + 0.4 * fbm(float2(u * 20.0, vv * 3.0)));
        paint += lin(float3(0.55, 0.70, 0.85)) * gloss * 0.22 * lit;
        paint *= 0.9 + 0.2 * fbm(float2(u * 40.0, vv * 4.0));
        paint = mix(paint, lin(float3(0.20, 0.17, 0.13)) * lit, smoothstep(0.78, 0.8, fbm(P / 5.0 + 20.0)) * 0.8);
        // The shutter's dark outer edge and the shadow at the hinge.
        paint *= 1.0 - 0.7 * smoothstep(0.96, 1.0, u);
        paint *= 0.6 + 0.4 * smoothstep(0.0, 0.05, u);
        col = mix(col, paint, smoothstep(0.0, 0.004, vv) * (1.0 - smoothstep(0.996, 1.0, vv)));
      }
    }
  }

  col *= 0.94 + 0.12 * hash2(floor(xy * 2.0) + 0.5);   // grain
  return half4(half3(finish(col, xy, size, ink, ceilRatio)), 1.0);
}
`;

/** The mug on the sill, her sweater and her hand under her chin. Baked once
 *  inside the "figure" box. */
export const DENISE_FIGURE = `${UNIFORMS}${COMMON}${FIGURE_COMMON}
float mugSD(float2 h) {
  float2 m = h - float2(-150.0, 108.0);
  float body = max(abs(m.x) - 13.0 + 0.04 * m.y, abs(m.y) - 16.0) - 1.5;
  float handle = abs(sdEllipse(m - float2(-14.0, -1.0), float2(7.5, 8.5))) - 2.4;
  return min(body, handle);
}
half4 main(float2 xy) {
  float s = sceneScale(size);
  float2 P = designPoint(xy, size);
  float2 h = P - HEAD;
  float2 L = normalize(WIN - P);
  float3 pc = float3(0.0);
  float a = 0.0;
  // The mug, blue glaze, catching the window on its far edge.
  float dM = mugSD(h);
  if (dM < 3.0) {
    float2 m = h - float2(-150.0, 108.0);
    float facing = clamp(-m.x / 14.0, 0.0, 1.0);
    float3 mc = lin(float3(0.22, 0.40, 0.64)) * (0.03 + 0.4 * facing * facing * exp(min(dM, 0.0) / 3.0));
    float gx = (m.x + 8.0) / 1.6;
    mc += lin(float3(0.8, 0.85, 0.9)) * 0.10 * exp(-gx * gx) * step(abs(m.y), 13.0);
    over(pc, a, mc, cover(dM, 0.6));
  }
  // The sweater: cream knit, almost all in shadow, rim-lit toward the window.
  if (h.x > -130.0 && h.y > 15.0) {
    float2 n;
    float dB = bodyPoly(h, n);
    if (dB < 3.0) {
      float facing = max(dot(n, L), 0.0);
      float rim = pow(facing, 1.6) * exp(min(dB, 0.0) / 3.5);
      float wrap = facing * exp(min(dB, 0.0) / 14.0);
      float st = fract(h.y / 4.5 + abs(fract(h.x / 6.5) - 0.5) * 1.1);   // chevron stitches
      float knit = 0.9 + 0.1 * smoothstep(0.2, 0.6, st) * (1.0 - smoothstep(0.6, 0.95, st));
      float3 b = lin(float3(0.80, 0.74, 0.64)) * (0.016 + 0.06 * wrap + 0.5 * rim) * knit;
      b *= 0.85 + 0.3 * fbm(h / 16.0);
      // Folds: the forearm in front of the upper arm, the arm against her side.
      b *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 3.0, forearmCrease(h)));
      b *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 4.0, armpitCrease(h)));
      // The upper arm is a little closer to the light than her back.
      b *= 1.0 - 0.35 * smoothstep(-70.0, 20.0, h.x);
      // A little cool light from the room on her shoulder blades.
      float b1 = length((h - float2(-18.0, 128.0)) / float2(34.0, 42.0));
      float b2 = length((h - float2(48.0, 124.0)) / float2(30.0, 42.0));
      b += lin(float3(0.36, 0.42, 0.52)) * 0.012 * (exp(-b1 * b1) + exp(-b2 * b2));
      b *= 1.0 - 0.6 * smoothstep(200.0, 400.0, h.y);
      over(pc, a, b, cover(dB + (fbm(xy / (3.0 * s)) - 0.5), 0.7));
    }
  }
  // Her hand, skin rim-lit by the window.
  if (h.x < -14.0 && h.x > -60.0 && h.y > 15.0 && h.y < 58.0) {
    float2 nH;
    float dHd = handPoly(h, nH);
    float facing = max(dot(nH, L), 0.0);
    float rim = pow(facing, 1.1) * exp(min(dHd, 0.0) / 2.5);
    float3 sk = lin(float3(0.92, 0.70, 0.60)) * (0.016 + 0.05 * facing + 0.6 * rim);
    float knuckle = 1.0 - smoothstep(0.0, 1.2, abs(fract((h.x + 3.0 * (h.y - 30.0) / 10.0) / 6.0) - 0.5) * 6.0 - 0.6);
    sk *= 1.0 - 0.35 * knuckle * step(28.0, h.y);
    over(pc, a, sk, cover(dHd, 0.6));
  }
  if (a < 0.002) { return half4(0.0); }
  float3 col = pc / a;
  col *= 0.94 + 0.12 * hash2(floor(xy * 2.0) + 0.5);
  return half4(half3(finish(col, xy, size, ink, ceilRatio) * a), half(a));
}
`;

/** Her face (lost profile) and hair at rest. Baked once inside the "head" box;
 *  the canvas turns it with deniseHeadPose. */
export const DENISE_HEAD = `${UNIFORMS}${COMMON}${FIGURE_COMMON}
// Hair flow edges (for the lock coordinate only).
float hairL(float y) { return -29.0 + 9.0 * smoothstep(-5.0, 30.0, y) - 12.0 * smoothstep(35.0, 115.0, y); }
float hairR(float y) { return 38.0 + 14.0 * smoothstep(20.0, 100.0, y); }
half4 main(float2 xy) {
  float2 P = designPoint(xy, size);
  float2 h = P - HEAD;
  float2 L = normalize(WIN - P);
  float3 pc = float3(0.0);
  float a = 0.0;
  // The face: only the brow, cheek and jaw line catch the light.
  if (h.x < 5.0 && h.y > -40.0 && h.y < 40.0) {
    float2 nF;
    float dF = facePoly(h, nF);
    if (dF < 3.0) {
      float facing = max(dot(nF, L), 0.0);
      float rim = pow(facing, 1.1) * exp(min(dF, 0.0) / 2.6);
      float wrap = facing * exp(min(dF, 0.0) / 8.0);
      float3 sk = lin(float3(0.92, 0.70, 0.60)) * (0.014 + 0.06 * wrap + 0.6 * rim);
      sk += lin(float3(0.7, 0.2, 0.12)) * 0.04 * exp(min(dF, 0.0) / 6.0) * facing;   // warmth under the skin
      float lash = (1.0 - smoothstep(0.35, 1.0, abs(h.y + 8.0 + 0.09 * (h.x + 27.0) * (h.x + 27.0) / 3.0)))
                 * step(-32.0, h.x) * step(h.x, -25.0);
      sk = mix(sk, lin(float3(0.05, 0.035, 0.03)), lash * 0.85);
      over(pc, a, sk, cover(dF, 0.6));
    }
  }
  // Hair: light brown in locks, glowing where the window light comes through.
  if (h.y < 140.0 && h.y > -60.0 && h.x > -45.0 && h.x < 70.0) {
    float2 n;
    float dHs = hairPoly(h, n);
    if (dHs < 10.0) {
      float facing = max(dot(n, L), 0.0);
      float yc = clamp(h.y, -6.0, 122.0);
      float across = (h.x - 0.5 * (hairL(yc) + hairR(yc))) / max(0.5 * (hairR(yc) - hairL(yc)), 1.0);
      float crownA = atan(h.x - 8.0, h.y + 50.0) / 0.95;
      float lp = (mix(crownA, across, smoothstep(-35.0, 10.0, h.y)) * 0.5 + 0.5) * 13.0;
      lp += 0.8 * sin(h.y * 0.06 + 1.3 * floor(lp * 0.5)) * smoothstep(0.0, 60.0, h.y);
      float lockShape = mix(1.0, pow(sin(PI * fract(lp)), 0.7), smoothstep(-40.0, 0.0, h.y));
      float fine = 0.5 * noise(float2(lp * 9.0, h.y * 0.04)) + 0.5 * noise(float2(lp * 31.0, h.y * 0.08));
      // Uneven lock ends: each lock stops at its own length and thins out.
      float endY = 104.0 + 20.0 * hash(floor(lp) + 7.0) - 8.0 * (1.0 - lockShape);
      float ends = 1.0 - smoothstep(endY - 16.0, endY, h.y) * (0.6 + 0.4 * (1.0 - lockShape));
      float rim = pow(facing, 1.3) * exp(min(dHs, 0.0) / 3.5);
      float wrap = facing * exp(min(dHs, 0.0) / 10.0);
      float3 hairDark = lin(float3(0.30, 0.21, 0.15));
      float3 hairGlow = lin(float3(0.93, 0.76, 0.55));
      float3 hc = hairDark * (0.03 + 0.05 * lockShape + 0.05 * fine);
      hc += hairGlow * (0.02 * lockShape * (0.4 + fine) + 0.12 * wrap * (0.4 + 0.9 * fine));
      hc = mix(hc, hairGlow * (0.35 + 0.65 * fine), clamp(0.95 * rim, 0.0, 1.0));
      // Flyaway strands just outside the lit edge.
      float fly = (1.0 - smoothstep(0.0, 0.06, abs(fract(lp * 1.7 + 0.4 * noise1(h.y * 0.06)) - 0.5) - 0.01))
                * (1.0 - smoothstep(0.0, 7.0, dHs)) * step(0.0, dHs) * facing
                * step(0.6, noise(float2(lp * 0.8, 3.0))) * step(h.y, 100.0);
      over(pc, a, hairGlow * 0.45, fly * 0.4);
      over(pc, a, hc, cover(dHs + 1.5 * (fine - 0.5), 0.7) * ends);
    }
  }
  if (a < 0.002) { return half4(0.0); }
  float3 col = pc / a;
  col *= 0.94 + 0.12 * hash2(floor(xy * 2.0) + 0.5);
  return half4(half3(finish(col, xy, size, ink, ceilRatio) * a), half(a));
}
`;

/** Rain, drips from the arch's cusps, chimney smoke and a drifting mist,
 *  inside the glass. Per frame, inside the "glass" box, under the figure. */
export const DENISE_AIR = `${UNIFORMS}
uniform float time;
${COMMON}
half4 main(float2 xy) {
  float2 P = designPoint(xy, size);
  float glass = cover(archSD(P, 10.0), 0.8);
  if (glass <= 0.0) { return half4(0.0); }
  float t = time;
  float vy = P.y;
  float3 pc = float3(0.0);
  float a = 0.0;
  // Mist drifting along the valley between the near ridges.
  float my = (vy - 368.0) / 26.0;
  float wisp = 0.6 * noise(float2(P.x / 60.0 + t * 0.02, vy / 18.0)) + 0.4 * noise(float2(P.x / 25.0 - t * 0.035, vy / 10.0 + 5.0));
  over(pc, a, lin(float3(0.56, 0.63, 0.73)), exp(-my * my) * smoothstep(0.45, 0.8, wisp) * 0.22);
  // A thread of smoke from the house's chimney, leaning in the wind.
  float2 sm = P - float2(CX + 18.0, 418.0);
  if (sm.y < 0.0 && sm.y > -42.0 && abs(sm.x) < 30.0) {
    float sq = (sm.x - 0.25 * sm.y - 3.0 * sin(sm.y * 0.15 + t * 0.5)) / (1.0 - sm.y * 0.05);
    float smk = exp(-sq * sq) * (1.0 - smoothstep(18.0, 40.0, -sm.y));
    over(pc, a, lin(float3(0.5, 0.55, 0.62)), smk * 0.3);
  }
  // Rain: fine far rain and a few thin near streaks.
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float sp = 5.0 + fk * 6.0;
    float2 rp = float2(P.x + vy * (0.08 + fk * 0.05), vy);
    float rr = hash(floor(rp.x / sp) + fk * 17.0);
    float ry = fract(rp.y / (55.0 + 50.0 * rr + fk * 60.0) - t * (1.2 + rr + fk * 0.8) + rr * 9.0);
    float streak = (1.0 - smoothstep(0.0, 0.07 + fk * 0.1, ry)) * (1.0 - smoothstep(0.015, 0.05 - fk * 0.02, abs(fract(rp.x / sp) - 0.5)));
    over(pc, a, lin(float3(0.84, 0.88, 0.93)), (0.18 + fk * 0.1) * streak * step(0.5 + fk * 0.25, rr));
  }
  // Drops gather on three cusp tips of the arch, swell, and fall.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Cusp tips (inset arch, radius 139 about the arch centres, 6 in).
    float2 tip = i == 0 ? float2(CX - 86.3, 158.2) : (i == 1 ? float2(CX - 36.4, 91.1) : float2(CX + 36.4, 91.1));
    float period = 7.2 + 2.4 * fi;
    float ph = fract(t / period + 0.37 * fi);
    float grow = clamp(ph / 0.8, 0.0, 1.0);
    float fallT = max(ph - 0.8, 0.0) / 0.2;
    float r = mix(0.5, 1.9, grow);
    float2 c = tip + float2(0.0, r * 1.1 + 300.0 * fallT * fallT);
    float2 q = (P - c) / float2(r, r * (1.15 + 0.9 * step(0.0, fallT - 0.001)));
    float drop = cover(length(q) - 1.0, 0.25);
    float shine = cover(length(q - float2(-0.35, -0.35)) - 0.3, 0.2);
    over(pc, a, lin(float3(0.40, 0.46, 0.56)), drop * 0.7);
    over(pc, a, lin(float3(0.90, 0.93, 0.97)), drop * shine * 0.9);
  }
  if (a < 0.002) { return half4(0.0); }
  float3 col = finish(pc / a * EXPOSURE, xy, size, ink, ceilRatio);
  a *= glass;
  return half4(half3(col * a), half(a));
}
`;

/** Steam rising from the mug, lit against the window. Per frame, inside the
 *  "steam" box, on top. */
export const DENISE_STEAM = `${UNIFORMS}
uniform float time;
${COMMON}
half4 main(float2 xy) {
  float2 P = designPoint(xy, size);
  float t = time;
  float2 sp = P - HEAD - float2(-150.0, 91.0);
  if (sp.y > 4.0 || sp.y < -150.0) { return half4(0.0); }
  float rise = -sp.y;
  float wob = 7.0 * sin(rise * 0.045 - t * 0.9) * smoothstep(0.0, 60.0, rise) + 4.0 * (noise1(rise * 0.03 - t * 0.4) - 0.5);
  float q = (sp.x - wob) / (2.5 + rise * 0.06);
  float plume = exp(-q * q) * smoothstep(0.0, 14.0, rise) * (1.0 - smoothstep(60.0, 150.0, rise));
  plume *= smoothstep(0.25, 0.7, noise(float2(sp.x / 6.0, (rise + t * 14.0) / 16.0)));
  float a = plume * 0.3;
  if (a < 0.002) { return half4(0.0); }
  float3 col = finish(lin(float3(0.82, 0.86, 0.9)) * 0.4, xy, size, ink, ceilRatio);
  return half4(half3(col * a), half(a));
}
`;
