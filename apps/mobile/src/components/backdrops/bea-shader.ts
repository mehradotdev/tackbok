/**
 * Bea: a forest at dusk. Trunks stand against a blue-grey sky with a mauve
 * afterglow, under a leafy canopy, with mist along the floor. A brass lantern
 * hangs from a branch of the near trunk on the right, and fireflies blink as
 * they drift.
 *
 * BEA_SCENE is the expensive, still part (sky, trunks, canopy, bark) and is
 * baked once. Three cheap layers animate on top of it:
 * - BEA_MIST drifts the ground mist (alpha over the scene);
 * - BEA_LIGHT adds the lamplight and the fireflies (blend mode `plus`);
 * - BEA_LANTERN draws the swaying lantern inside `beaLanternBox`.
 *
 * Text contrast: `ceilRatio` is the body-text contrast the art keeps against
 * `ink`, with a soft knee (as in Higa). BEA_LIGHT cannot read the scene below
 * it, so it ceils against a bright estimate of it (the sky or a hazy far trunk
 * under the densest mist, plus grain; everything else is darker). A darker real pixel then ends up
 * darker still, never brighter than the ceiling. Only the lantern's glass is
 * drawn above the ceiling (the owner's choice, 2026-11-27): a small, bright
 * spot at the right edge, like Giuseppe's lit cairn.
 *
 * Every loop period divides the forward clock's 6 h wrap.
 */

/** Noise, colour conversion and the near trunk, branch and lantern geometry
 *  that all four shaders share. */
const COMMON = `
const float TAU = 6.2831853;
const float3 SKY_TOP = float3(0.16, 0.21, 0.26);
const float3 AFTERGLOW = float3(0.33, 0.25, 0.28);
const float3 MIST = float3(0.19, 0.24, 0.23);
const float3 FAR_TRUNK = float3(0.10, 0.14, 0.13);

float hash1(float n) { return fract(sin(n * 91.7) * 43758.5453); }
float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + float2(1, 0)), f.x),
             mix(hash2(i + float2(0, 1)), hash2(i + float2(1, 1)), f.x), f.y);
}
// 1 below lo, 0 above hi. GLSL and Metal leave smoothstep with descending
// edges undefined, so falling edges go through here.
float fall(float hi, float lo, float x) { return 1.0 - smoothstep(lo, hi, x); }
float fbm(float2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
float3 toLinear(float3 c) {
  return mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, float3(2.4)), step(0.04045, c));
}
float3 toSrgb(float3 l) {
  return mix(l * 12.92, 1.055 * pow(max(l, 0.0), float3(1.0 / 2.4)) - 0.055, step(0.0031308, l));
}
float luma(float3 l) { return dot(l, float3(0.2126, 0.7152, 0.0722)); }

float sceneScale(float2 size) { return min(size.x / 390.0, size.y / 700.0); }

// The sky and afterglow behind the trees.
float3 skyAt(float2 xy, float3 bg, float W, float H) {
  float3 col = mix(bg, SKY_TOP, 0.75 * fall(H * 0.72, 0.0, xy.y));
  // Square by hand: pow() of a negative base is undefined in SkSL.
  float v = (xy.y - H * 0.56) / (H * 0.13);
  float band = exp(-v * v) * smoothstep(0.0, W, xy.x * 1.2);
  return mix(col, AFTERGLOW, 0.55 * band);
}
float mistBand(float y, float H) { return smoothstep(H * 0.70, H, y); }

// The near trunk at the right edge: its centre line at height y, and coverage.
float trunkX(float y, float W, float s) {
  return W - 6.0 * s + (noise(float2(y / (50.0 * s), 9.0)) - 0.5) * 4.0 * s;
}
float trunkCov(float2 xy, float W, float s) {
  return fall(24.0 * s, 23.0 * s, abs(xy.x - trunkX(xy.y, W, s)));
}
// The branch grows left from the trunk; bx is points from the right edge.
float branchY(float bx, float H, float s) {
  return H * 0.20 + (bx * 0.10 + bx * bx * 0.00055 + 3.0 * sin(bx / 23.0)) * s;
}
float branchCov(float2 xy, float W, float H, float s) {
  float bx = (W - xy.x) / s;
  float th = (mix(20.0, 3.0, pow(clamp(bx / 210.0, 0.0, 1.0), 0.8))
    + 3.0 * exp(-(bx - 60.0) * (bx - 60.0) / 64.0)) * s;
  return fall(th * 0.5, th * 0.5 - 1.0, abs(xy.y - branchY(bx, H, s))) * step(bx, 212.0);
}

// The lantern hangs 96 pt in from the right edge, drawn 1.35 times its
// design size, and sways a little on a 10 s swing.
const float LANTERN_SCALE = 1.35;
float2 lanternHook(float W, float H, float s) {
  return float2(W - 96.0 * s, branchY(96.0, H, s) + 4.0 * s);
}
float lanternSway(float t) { return 0.035 * sin(t * TAU / 10.0); }
// A one-minute loop keeps the noise input small (GPU sin loses precision on
// large inputs); the restart each minute is lost in the flicker.
float lanternFlicker(float t) {
  float tf = mod(t, 60.0);
  return 0.86 + 0.14 * noise(float2(tf * 3.1, 0.5)) + 0.06 * sin(tf * TAU * 3.0);
}
// The flame sits 60 design points below the hook.
float2 flameAt(float2 hook, float sway, float s) {
  return hook + float2(-sin(sway), cos(sway)) * 60.0 * s * LANTERN_SCALE;
}
`;

/** The soft-knee ceiling; needs the `ink` and `ceilRatio` uniforms. */
const CEILING = `
float3 ceilColor(float3 col) {
  if (ceilRatio <= 1.01) return col;
  float ceilLum = (luma(toLinear(ink)) + 0.05) / ceilRatio - 0.05;
  float3 lin = toLinear(col);
  float L = luma(lin);
  float knee = 0.5 * ceilLum;
  if (L <= knee) return col;
  float room = ceilLum - knee;
  lin *= (knee + room * (1.0 - exp(-(L - knee) / room))) / L;
  return toSrgb(lin);
}
`;

/** The still forest: sky, far and mid trunks, canopy, and the near trunk with
 *  its branch, twigs and leaves (unlit; BEA_LIGHT adds the lamplight). */
export const BEA_SCENE = `
uniform float2 size;
uniform float3 bg;
uniform float3 ink;
uniform float ceilRatio;
${COMMON}${CEILING}
// Trunks in cells of width cw: returns coverage.
float trunks(float2 xy, float cw, float wMin, float wMax, float seed, float s) {
  float c = floor(xy.x / cw);
  float cov = 0.0;
  for (int j = -1; j <= 1; j++) {
    float cc = c + float(j);
    if (hash2(float2(cc, seed)) < 0.25) continue;
    float cx = (cc + 0.5) * cw + (hash2(float2(cc, seed + 1.0)) - 0.5) * cw * 0.6;
    float w = mix(wMin, wMax, hash2(float2(cc, seed + 2.0))) * s;
    // A slight lean and a wobbly bark line.
    cx += (xy.y / s - 400.0) * (hash2(float2(cc, seed + 3.0)) - 0.5) * 0.04 * s;
    cx += (noise(float2(xy.y / (38.0 * s), cc * 3.1)) - 0.5) * 3.0 * s;
    cov = max(cov, fall(w * 0.5, w * 0.5 - 1.0, abs(xy.x - cx)));
  }
  return cov;
}

half4 main(float2 xy) {
  float W = size.x, H = size.y;
  float s = sceneScale(size);
  float3 col = skyAt(xy, bg, W, H);

  // Far trunks, hazy with distance, then darker mid trunks.
  float far = trunks(xy, 44.0 * s, 4.0, 9.0, 3.0, s);
  col = mix(col, mix(col, FAR_TRUNK, 0.75), far);
  float mid = trunks(xy + float2(17.0 * s, 0.0), 96.0 * s, 11.0, 20.0, 11.0, s);
  col = mix(col, float3(0.055, 0.082, 0.068), mid);

  // Canopy: leaf masses hanging into the top of the frame.
  float edge = H * (0.05 + 0.07 * fbm(float2(xy.x / (90.0 * s), 2.0)));
  float lumps = fbm(xy / (9.0 * s)) - 0.5;
  float leaves = fall(edge + 10.0 * s, edge - 4.0 * s, xy.y + 30.0 * s * lumps);
  col = mix(col, float3(0.045, 0.07, 0.055), leaves);

  // The near trunk and its branch, with one twig rising and one drooping.
  float wood = max(trunkCov(xy, W, s), branchCov(xy, W, H, s));
  float tx1 = (W - 150.0 * s - xy.x) / s;
  float ty1 = branchY(150.0, H, s) - tx1 * 0.55 * s;
  wood = max(wood, fall(1.6 * s, 0.6 * s, abs(xy.y - ty1)) * step(0.0, tx1) * step(tx1, 46.0));
  float tx2 = (W - 70.0 * s - xy.x) / s;
  float ty2 = branchY(70.0, H, s) + tx2 * 0.42 * s;
  wood = max(wood, fall(1.8 * s, 0.6 * s, abs(xy.y - ty2)) * step(0.0, tx2) * step(tx2, 38.0));
  // A few leaves along the rising twig.
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float along = 8.0 + fi * 5.5;
    float2 c = float2(W - (150.0 + along) * s, branchY(150.0, H, s) - along * 0.55 * s);
    c.y += (mod(fi, 2.0) < 1.0 ? -5.0 : 5.0) * s;
    float2 d = (xy - c) / (float2(5.5, 3.0) * s);
    wood = max(wood, fall(1.0, 0.8, length(d)));
  }
  float barkTex = fbm(float2(xy.x / (3.0 * s), xy.y / (26.0 * s)));
  col = mix(col, float3(0.035, 0.05, 0.042) * (0.75 + 0.5 * barkTex), wood);

  // Fine grain against banding in the dark gradients.
  col += (hash2(floor(xy * 1.5)) - 0.5) * 0.012;
  col = ceilColor(col);
  col += (hash2(xy) - 0.5) * 0.008;
  return half4(half3(col), 1.0);
}
`;

/** Ground mist drifting on a 120 s loop over the bottom 30% (not over the
 *  near trunk, which stands in front of it). Draw it from 0.70 of the height. */
export const BEA_MIST = `
uniform float2 size;
uniform float time;
${COMMON}
half4 main(float2 xy) {
  float W = size.x, H = size.y;
  float s = sceneScale(size);
  float band = mistBand(xy.y, H);
  if (band <= 0.0) return half4(0.0);
  float a = TAU * time / 120.0;
  float n = fbm(float2(xy.x / (110.0 * s) + 0.5 * cos(a), xy.y / (40.0 * s) + 0.5 * sin(a)));
  float alpha = band * (0.35 + 0.45 * n) * (1.0 - trunkCov(xy, W, s));
  return half4(half3(MIST * alpha), half(alpha));
}
`;

/** The lamplight (a warm halo, stronger on the bark and the trunk's rim) and
 *  sixteen fireflies drifting on slow loops, each blinking on its own rhythm.
 *  Additive: draw it with blend mode `plus` over the whole scene. */
export const BEA_LIGHT = `
uniform float2 size;
uniform float time;
uniform float3 bg;
uniform float3 ink;
uniform float ceilRatio;
${COMMON}${CEILING}
half4 main(float2 xy) {
  float W = size.x, H = size.y;
  float s = sceneScale(size);
  float t = time;

  // The brightest the scene below can be here: the sky or a hazy far trunk
  // (which can be a touch lighter than the sky low in the frame) under the
  // densest mist (it never passes 0.8; the mid trunks, canopy and near wood
  // are darker), plus the most BEA_SCENE's grain adds (0.006 + 0.004).
  float3 sky = skyAt(xy, bg, W, H);
  float3 bright = max(sky, mix(sky, FAR_TRUNK, 0.75));
  float3 below = mix(bright, MIST, 0.8 * mistBand(xy.y, H)) + 0.01;

  float sway = lanternSway(t);
  float flick = lanternFlicker(t);
  float d = length(xy - flameAt(lanternHook(W, H, s), sway, s)) / s;
  float halo = (0.6 * exp(-d / 30.0) + 0.5 * exp(-d / 110.0)) * flick;
  float trunk = trunkCov(xy, W, s);
  float wood = max(trunk, branchCov(xy, W, H, s));
  float rim = fall(8.0 * s, 0.0, abs(xy.x - (trunkX(xy.y, W, s) - 23.0 * s))) * trunk;
  float3 light = mix(float3(1.0, 0.60, 0.24) * 0.38,
                     float3(0.55, 0.32, 0.12) * 0.9 + float3(0.40, 0.24, 0.10) * 1.2 * rim,
                     wood) * halo;

  float3 fly = float3(0.0);
  float core = 0.0;
  // No firefly (home at least 0.34 H, drifting 16 up) or its glow reaches
  // more than 80 design points above the highest one.
  for (int i = 0; i < 16; i++) {
    if (xy.y < H * 0.34 - 96.0 * s) break;
    float fi = float(i);
    float2 home = float2(W * (0.22 + 0.76 * hash1(fi + 1.0)), H * (0.34 + 0.62 * hash1(fi + 7.0)));
    float px = i < 6 ? 24.0 : (i < 11 ? 36.0 : 45.0);
    float py = i < 4 ? 30.0 : (i < 10 ? 40.0 : 20.0);
    float per = mod(fi, 3.0) < 1.0 ? 5.0 : (mod(fi, 3.0) < 2.0 ? 6.0 : 8.0);
    float ph = fract(t / per + hash1(fi + 13.0));
    float on = smoothstep(0.0, 0.08, ph) * fall(0.38, 0.12, ph);
    // Dark fireflies add nothing; this is the same for every pixel.
    if (on <= 0.0) continue;
    float2 pos = home + float2(sin(t * TAU / px + fi * 2.1) * 26.0,
                               cos(t * TAU / py + fi * 1.3) * 16.0) * s;
    float fd = length(xy - pos) / s;
    // Past 80 design points a firefly's glow is under half an 8-bit step.
    if (fd > 80.0) continue;
    core = max(core, fall(2.3, 0.8, fd) * on);
    fly += float3(0.62, 0.85, 0.30) * (exp(-fd / 5.0) * 0.5 + exp(-fd / 16.0) * 0.22) * on;
  }

  float3 lit = mix(below + light + fly, float3(0.90, 1.0, 0.62), core);
  // Alpha 1 under plus keeps the colour valid premultiplied (as in Giuseppe's
  // bokeh); the destination is opaque, so the sum is the same.
  return half4(half3(max(ceilColor(lit) - below, 0.0)), 1.0);
}
`;

/** The brass lantern on its chain, swaying; its frame keeps the ceiling and
 *  its glass glows above it. Draw it inside `beaLanternBox`. */
export const BEA_LANTERN = `
uniform float2 size;
uniform float time;
uniform float3 ink;
uniform float ceilRatio;
${COMMON}${CEILING}
half4 main(float2 xy) {
  float W = size.x, H = size.y;
  float s = sceneScale(size);
  float t = time;
  float2 hook = lanternHook(W, H, s);
  float sway = lanternSway(t);
  float flick = lanternFlicker(t);
  float2 lp = xy - hook;
  lp = float2(cos(sway) * lp.x + sin(sway) * lp.y, -sin(sway) * lp.x + cos(sway) * lp.y);
  lp /= LANTERN_SCALE;

  float chainL = 20.0 * s;
  float c0 = chainL + 8.0 * s;
  float chain = fall(1.1 * s, 0.4 * s, abs(lp.x)) * step(0.0, lp.y) * step(lp.y, chainL);
  float ring = fall(1.2 * s, 0.5 * s, abs(length(lp - float2(0.0, chainL + 4.0 * s)) - 3.6 * s));
  float capW = mix(6.0, 16.0, clamp((lp.y - c0) / (10.0 * s), 0.0, 1.0)) * s;
  float cap = step(c0, lp.y) * step(lp.y, c0 + 10.0 * s) * fall(capW, capW - 1.0, abs(lp.x));
  float gy0 = c0 + 10.0 * s;
  float gy1 = c0 + 46.0 * s;
  float ghw = mix(13.0, 11.5, clamp((lp.y - gy0) / (gy1 - gy0), 0.0, 1.0)) * s;
  float glass = step(gy0, lp.y) * step(lp.y, gy1) * fall(ghw, ghw - 1.0, abs(lp.x));
  float bars = max(smoothstep(ghw - 2.2 * s, ghw - 1.6 * s, abs(lp.x)),
                   fall(0.9 * s, 0.4 * s, abs(lp.x)));
  bars = max(bars, fall(1.0 * s, 0.4 * s, abs(lp.y - (gy0 + 3.0 * s))));
  float base = step(gy1, lp.y) * step(lp.y, gy1 + 5.0 * s) * fall(15.0 * s, 14.0 * s, abs(lp.x));
  float finW = mix(5.0, 0.5, clamp((lp.y - gy1 - 5.0 * s) / (7.0 * s), 0.0, 1.0)) * s;
  float finial = step(gy1 + 5.0 * s, lp.y) * step(lp.y, gy1 + 12.0 * s) * fall(finW, finW - 0.8, abs(lp.x));
  float knob = fall(2.6 * s, 1.8 * s, length(lp - float2(0.0, c0 - 1.0 * s)));
  float frame = max(max(chain, ring), max(max(cap, base), max(finial, knob)));

  // The flame, and the glass glowing amber around it.
  float2 fc = float2(0.0, gy0 + 22.0 * s);
  float2 fq = (lp - fc) / (float2(3.4, 7.0) * s * (0.92 + 0.08 * flick));
  fq.y += 0.25 * fq.x * fq.x;
  float flame = fall(1.0, 0.55, length(fq));
  float glow = exp(-length((lp - fc) / s) / 14.0);
  float3 glassCol = mix(float3(0.62, 0.36, 0.14), float3(1.0, 0.66, 0.28), glow) * flick;
  glassCol = mix(glassCol, float3(1.0, 0.93, 0.72), flame);
  float d = length(xy - flameAt(hook, sway, s)) / s;
  float3 brass = ceilColor(float3(0.62, 0.46, 0.20) * (0.45 + 1.1 * exp(-d / 30.0) * flick));

  float3 col = mix(brass, mix(glassCol, brass, bars), glass);
  float alpha = max(frame, glass);
  return half4(half3(col * alpha), half(alpha));
}
`;

/** The rectangle BEA_LANTERN must cover: the lantern reaches 86 design points
 *  below its hook (times LANTERN_SCALE) and 16 to each side, plus room for the
 *  sway. Mirrors lanternHook() and branchY() in COMMON. */
export function beaLanternBox(width: number, height: number) {
  const s = Math.min(width / 390, height / 700);
  const hookX = width - 96 * s;
  const hookY =
    height * 0.2 + (96 * 0.1 + 96 * 96 * 0.00055 + 3 * Math.sin(96 / 23)) * s + 4 * s;
  const x = Math.max(0, Math.floor(hookX - 30 * s));
  const y = Math.max(0, Math.floor(hookY - 4 * s));
  return {
    x,
    y,
    width: Math.min(width, Math.ceil(hookX + 30 * s)) - x,
    height: Math.min(height, Math.ceil(hookY + 124 * s)) - y,
  };
}
