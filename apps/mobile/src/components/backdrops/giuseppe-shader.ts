/**
 * Giuseppe: a balanced cairn, sharp against a blurred lake at dusk.
 * The lake and the cairn are detailed, so each is drawn once into a texture;
 * GIUSEPPE_BOKEH is the only per-frame pass (glints flickering on the water).
 */
const NOISE = `
float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), f.x),
             mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), f.x), f.y);
}
float fbm(float2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

export const GIUSEPPE_LAKE = `
uniform float2 size;
uniform float3 deep;
uniform float3 haze;
uniform float3 warm;
${NOISE}
half4 main(float2 xy) {
  float scale = min(size.x / 390.0, size.y / 700.0);
  float2 uv = xy / size;
  // ---- Background: dusk sky over a lake, everything out of focus ----
  float horizon = 0.58;
  float skyT = clamp(uv.y / horizon, 0.0, 1.0);
  float3 col = mix(deep * 0.8, mix(deep, haze, 0.6), pow(skyT, 2.4));
  col += warm * 0.10 * pow(skyT, 6.0);
  // Soft far shore, blurred by distance.
  float shore = horizon - 0.03 - 0.035 * fbm(float2(uv.x * 2.5, 1.0));
  float shoreMask = smoothstep(shore - 0.015, shore + 0.015, uv.y) * (1.0 - smoothstep(horizon - 0.005, horizon + 0.015, uv.y));
  col = mix(col, deep * 0.75 + haze * 0.1, shoreMask);
  // Water: darker, with a soft glow band under the sun.
  float water = smoothstep(horizon - 0.005, horizon + 0.015, uv.y);
  float3 lake = mix(mix(deep, haze, 0.4), deep * 0.7, clamp((uv.y - horizon) / 0.42, 0.0, 1.0));
  float sunX = 0.3;
  // Squares are written out: pow() is undefined for a negative base on some GPUs.
  float gx = (uv.x - sunX) * 3.4;
  float glow = exp(-gx * gx) * (1.0 - clamp((uv.y - horizon) * 2.0, 0.0, 1.0));
  lake += warm * glow * 0.2;
  col = mix(col, lake, water);
  float hx = (uv.x - sunX) * 2.4;
  float hy = (uv.y - horizon) * 8.0;
  col += warm * 0.14 * exp(-hx * hx) * exp(-hy * hy);
  col += (hash(xy) - 0.5) * 0.012;   // grain against banding
  return half4(half3(col), 1.0);
}
`;

/** Out-of-focus glints, additive (draw with blendMode "plus"). */
export const GIUSEPPE_BOKEH = `
uniform float2 size;
uniform float time;
uniform float3 haze;
uniform float3 warm;
float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
half4 main(float2 xy) {
  float scale = min(size.x / 390.0, size.y / 700.0);
  float2 uv = xy / size;
  float horizon = 0.58;
  float sunX = 0.3;
  float3 add = float3(0.0);
  // Bokeh: out-of-focus glints on the water, with soft rims.
  for (int i = 0; i < 22; i++) {
    float fi = float(i);
    float2 h = float2(hash(float2(fi, 1.3)), hash(float2(fi, 7.9)));
    float2 bc = float2(h.x * size.x + sin(time * 0.07 + fi) * 6.0 * scale, (horizon + 0.03 + h.y * 0.36) * size.y);
    float br = (8.0 + 26.0 * hash(float2(fi, 3.1))) * scale * (0.6 + 0.8 * (bc.y / size.y - horizon));
    float d = length(xy - bc) / br;
    if (d < 1.0) {   // most pixels miss most discs; skip the rest of the work
      float disc = 1.0 - smoothstep(0.86, 1.0, d);
      float rim = smoothstep(0.7, 0.95, d) * disc;
      float flicker = 0.55 + 0.45 * sin(time * (0.4 + hash(float2(fi, 9.0)) * 0.7) + fi * 2.1);
      float nx = (bc.x / size.x - sunX) * 2.4;
      float near = exp(-nx * nx);
      float3 tint = mix(haze, warm, 0.35 + 0.65 * near);
      add += tint * (disc * 0.055 + rim * 0.045) * flicker * (0.4 + near);
    }
  }
  // Drawn with "plus" over the opaque lake, so alpha stays 1 and the light just adds.
  return half4(half3(add), 1.0);
}
`;

/** The stones only, transparent around them (premultiplied). */
export const GIUSEPPE_CAIRN = `
uniform float2 size;
uniform float3 deep;
uniform float3 haze;
uniform float3 warm;
uniform float3 stoneA;
uniform float3 stoneB;
${NOISE}
// Stones from the base up: centre (x as a fraction of a 390 pt width from the
// right edge, y in pt above the base), radii (pt). The boulder sits 0.30 of the
// real width from the right, so it stays to the right on any width; the stones
// above keep their offsets in points, so the stack scales as one piece.
// The heights sink each stone at least 1.5 pt into the one below across the
// middle half of both, deeper at the centre (solved offline from the outline
// below: superellipse, tilt, flat underside), so no sky shows between them.
float4 stoneShape(int i) {
  if (i == 0) return float4(0.30, 0.0, 128.0, 60.0);   // boulder the cairn stands on
  if (i == 1) return float4(0.27, 78.0, 78.0, 27.0);
  if (i == 2) return float4(0.31, 117.9, 55.0, 19.0);
  if (i == 3) return float4(0.265, 149.0, 52.0, 17.0);
  if (i == 4) return float4(0.30, 176.4, 34.0, 15.0);
  if (i == 5) return float4(0.28, 198.1, 31.0, 11.5);
  return float4(0.292, 214.9, 17.0, 10.0);
}
float2 stoneTilt(int i) {   // rotation (rad), colour mix toward grey
  if (i == 0) return float2(0.02, 0.85);
  if (i == 1) return float2(-0.05, 0.1);
  if (i == 2) return float2(0.09, 0.95);
  if (i == 3) return float2(-0.06, 0.35);
  if (i == 4) return float2(0.13, 1.0);
  if (i == 5) return float2(-0.10, 0.0);
  return float2(0.16, 0.6);
}

// Signed distance in points (negative inside). q: local coords, rr: 0 centre .. 1 rim.
float stoneDist(int i, float2 xy, float scale, float baseY, out float2 q, out float rr) {
  float4 s = stoneShape(i);
  float2 t = stoneTilt(i);
  float2 c = float2(size.x * 0.70 - (s.x - 0.30) * 390.0 * scale, baseY - s.y * scale);
  float2 p = (xy - c) / scale;
  float cs = cos(t.x), sn = sin(t.x);
  p = float2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
  q = p / s.zw;
  // Superellipse: flatter tops and bottoms, like water-worn slabs.
  float e = 2.4;
  float r = pow(pow(abs(q.x), e) + pow(abs(q.y), e), 1.0 / e);
  float2 dir = q / max(r, 0.0001);
  float fi = float(i);
  // Irregular outline sampled on a circle, so there is no seam.
  float wobble = (noise(dir * 1.3 + fi * 5.1) - 0.5) * 0.22
               + (noise(dir * 4.0 + fi * 2.7) - 0.5) * 0.07
               + (noise(dir * 11.0 + fi) - 0.5) * 0.02;
  // Smooth where stones touch (the middle of each top and underside), so the
  // stack rests the same on every GPU; the shoulders stay irregular.
  wobble *= q.y < 0.0 ? smoothstep(0.35, 0.7, abs(q.x)) : smoothstep(0.5, 0.85, abs(q.x));
  wobble -= step(0.0, q.y) * 0.05 * q.y;   // resting underside sits flatter
  float R = 1.0 + wobble;
  rr = r / R;
  return (r - R) * min(s.z, s.w);
}

half4 main(float2 xy) {
  float scale = min(size.x / 390.0, size.y / 700.0);
  float2 uv = xy / size;
  float baseY = size.y + 30.0 * scale;
  half4 acc = half4(0.0);
  // ---- Cairn: sharp, lit by the low sun from the left ----
  float3 L = normalize(float3(-0.8, -0.55, 0.55));
  float3 F = normalize(float3(0.7, -0.4, 0.6));
  for (int i = 6; i >= 0; i--) {
    float2 q; float rr;
    float d = stoneDist(i, xy, scale, baseY, q, rr);
    if (d < 1.0) {
      float fi = float(i);
      float cover = clamp(0.5 - d / 0.7, 0.0, 1.0);
      float2 dir = q / max(length(q), 0.0001);
      float rim = clamp(rr, 0.0, 1.0);
      // Flattened dome: broad top, rounded edges.
      float hgt = sqrt(max(0.0, 1.0 - pow(rim, 2.6)));
      float3 n = float3(dir.x * rim * 0.85, dir.y * rim * 1.25, hgt * 0.8 + 0.08);
      // Fine surface relief only; the form stays smooth.
      float2 tex = xy / scale;
      float e = 0.5;
      float2 o = tex * 0.16 + fi * 9.0;
      float2 g = float2(fbm(o + float2(e, 0.0)) - fbm(o - float2(e, 0.0)),
                        fbm(o + float2(0.0, e)) - fbm(o - float2(0.0, e)));
      n = normalize(n + float3(g * 0.55, 0.0));
      float2 tt = stoneTilt(i);
      float3 base = mix(stoneA, stoneB, tt.y);
      float hue = hash(float2(fi, 11.0));
      if (hue < 0.25) base = mix(base, base * float3(1.0, 0.84, 0.74), 0.5);        // rusty
      else if (hue < 0.5) base = mix(base, float3(0.82, 0.76, 0.64), 0.55);           // sandy cream
      else if (hue < 0.75) base = mix(base, mix(stoneB, deep, 0.35) * 0.9, 0.6);      // slate
      // Mottling, grain, pits and the odd quartz vein.
      base *= 0.9 + 0.2 * (fbm(tex * 0.06 + fi * 3.0) - 0.5) * 2.0;
      base *= 0.96 + (noise(tex * 2.2 + fi) - 0.5) * 0.10;
      float2 cell = floor(tex / 3.5);
      float2 inCell = fract(tex / 3.5) - 0.5;
      float pit = step(0.93, hash(cell + fi * 13.0)) * (1.0 - smoothstep(0.08, 0.2, length(inCell)));
      base *= 1.0 - pit * 0.35;
      if (hash(float2(fi, 2.0)) > 0.5) {
        float vein = abs(q.y - 0.3 * sin(q.x * 2.3 + fi) + 0.15 * (hash(float2(fi, 5.0)) - 0.5));
        base = mix(base, float3(0.86, 0.83, 0.76), (1.0 - smoothstep(0.02, 0.05, vein)) * 0.45);
      }
      float key = pow(max(dot(n, L) * 0.6 + 0.4, 0.0), 1.8);
      float fill = max(dot(n, F), 0.0);
      float3 light = warm * key * 1.25 + haze * fill * 0.38 + mix(deep, haze, 0.5) * 0.3;
      float3 h3 = normalize(L + float3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(n, h3), 0.0), 22.0) * 0.16;
      float3 lit = base * light + warm * spec;
      // Crevices and cast shadows where stones touch.
      if (i < 6) {
        float2 q2; float r2;
        float up = stoneDist(i + 1, xy, scale, baseY, q2, r2);
        float sh = stoneDist(i + 1, xy - float2(8.0, 5.0) * scale, scale, baseY, q2, r2);
        lit *= mix(0.35, 1.0, smoothstep(0.0, 9.0 * scale, up));
        lit *= 1.0 - (1.0 - smoothstep(-3.0 * scale, 5.0 * scale, sh)) * 0.5;
      }
      if (i > 0) {
        float2 q3; float r3;
        float below = stoneDist(i - 1, xy, scale, baseY, q3, r3);
        lit *= mix(0.55, 1.0, smoothstep(0.0, 6.0 * scale, below));
      }
      acc = half4(half3(lit * cover), half(cover)) + acc * half(1.0 - cover);
    }
  }
  return acc;
}
`;
