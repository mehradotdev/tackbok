/**
 * Denise: layered blue ridges with fir silhouettes in morning mist.
 * DENISE_SCENE is detailed (ridged noise, tiered firs, fbm fog), so it is drawn
 * once into a texture; DENISE_MIST is the cheap drifting layer animated on top.
 */
const UNIFORMS = `
uniform float2 size;
uniform float3 sky;
uniform float3 ridge;
uniform float3 near;
uniform float3 fogCol;
uniform float3 sun;
`;

const HELPERS = `
float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
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
// Ridged 1D profile: sharp peaks, soft valleys.
float ridgeLine(float x, float seed) {
  float v = 0.0, a = 0.55, f = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = noise1(x * f + seed * 13.0 + float(i) * 7.3);
    v += a * (1.0 - abs(n * 2.0 - 1.0));
    f *= 2.1; a *= 0.45;
  }
  return v;
}

// Layer k (0 far .. 4 near): ridge top in points.
float ridgeY(int k, float x, float scale) {
  float fk = float(k);
  float base = size.y * (0.50 + fk * 0.085);
  float amp = (70.0 + fk * 18.0) * scale;
  float freq = (1.3 + fk * 0.55) / (390.0 * scale);
  float sharp = ridgeLine(x * freq, fk + 1.0);
  float soft = noise1(x * freq * 0.9 + fk * 4.0) * 0.6 + noise1(x * freq * 2.3 + fk) * 0.25 + 0.15;
  return base - amp * mix(sharp, soft, fk / 4.0 * 0.7);
}

// Fir trees standing on a ridge: tiered silhouette, 1 inside.
float firs(int k, float2 xy, float scale) {
  float fk = float(k);
  float cw = (2.2 + fk * 1.3) * scale;          // tree spacing
  float hMax = (6.0 + fk * 5.5) * scale;
  float cell = floor(xy.x / cw);
  float m = 0.0;
  for (int j = -3; j <= 3; j++) {
    float c = cell + float(j);
    float r = hash(c * 1.7 + fk * 31.0);
    float density = noise1(c * 0.09 + fk * 5.0);  // clumps and clearings
    if (r < 0.1 + smoothstep(0.25, 0.6, density) * 0.9) {
      float cx = (c + 0.2 + 0.6 * hash(c + fk * 3.1)) * cw;
      float ht = hMax * (0.45 + 0.55 * hash(c * 3.3 + fk));
      float top = ridgeY(k, cx, scale) - ht + 3.0 * scale;
      float t = (xy.y - top) / ht;                // 0 tip .. 1 foot
      if (t > 0.0) {
        float tiers = 1.0 - 0.32 * fract(t * 5.0); // branch tiers
        float hw = ht * 0.24 * t * tiers + 0.5 * scale;
        m = max(m, 1.0 - smoothstep(hw - 0.6 * scale, hw + 0.6 * scale, abs(xy.x - cx)));
      }
    }
  }
  return m;
}
`;

export const DENISE_SCENE = `${UNIFORMS}${HELPERS}
half4 main(float2 xy) {
  float scale = min(size.x / 390.0, size.y / 700.0);
  float2 uv = xy / size;

  // Sky: pale, brighter toward the soft sun at the upper right.
  float3 col = mix(sky, mix(sky, fogCol, 0.6), smoothstep(0.1, 0.55, uv.y));
  float2 sp = float2(0.74, 0.30);
  float sd = length((uv - sp) * float2(1.0, size.y / size.x));
  col = mix(col, sun, 0.35 * exp(-sd * sd * 18.0));
  col = mix(col, float3(1.0), 0.5 * exp(-sd * sd * 900.0));

  // High thin cloud wisps.
  float wisp = fbm(float2(uv.x * 2.0, uv.y * 9.0));
  col = mix(col, fogCol, 0.25 * smoothstep(0.5, 0.8, wisp) * smoothstep(0.45, 0.15, uv.y));

  float drift = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float depth = fk / 4.0;
    float top = ridgeY(k, xy.x, scale);
    float land = smoothstep(top - 0.7 * scale, top + 0.7 * scale, xy.y);
    if (k >= 1) land = max(land, firs(k, xy, scale));
    // Atmospheric perspective: far ridges melt into the mist.
    float3 tone = mix(mix(fogCol, ridge, 0.35 + 0.5 * depth), near, depth * depth);
    // Light from the sun side, slightly brighter on the upper slopes.
    float below = clamp((xy.y - top) / (90.0 * scale), 0.0, 1.0);
    tone = mix(tone, mix(tone, sun, 0.25), (1.0 - below) * (1.0 - depth) * smoothstep(0.2, 1.0, uv.x));
    col = mix(col, tone, land);

    // Valley fog pooling below this ridge, drifting sideways.
    float valley = size.y * (0.53 + fk * 0.085);
    float fy = (xy.y - valley) / (60.0 * scale);
    float band = smoothstep(-1.6, 0.4, fy) * (1.0 - smoothstep(0.8, 2.6, fy));
    float2 fp = float2(xy.x / (260.0 * scale) + drift * (1.0 + fk * 0.4) + fk * 3.7, xy.y / (55.0 * scale));
    float wisps = fbm(fp + float2(0.0, -drift * 0.3)) * 0.7 + noise(fp * 0.5) * 0.3;
    float dens = band * smoothstep(0.25, 0.7, wisps) * (0.9 - depth * 0.25);
    col = mix(col, fogCol, dens);
  }
  // Ground haze at the very bottom so cards read cleanly.
  col = mix(col, fogCol, 0.55 * smoothstep(0.8, 1.0, uv.y) * (0.75 + 0.25 * fbm(float2(uv.x * 3.0 + drift, uv.y * 6.0))));
  col += (hash2(xy) - 0.5) * 0.01;
  return half4(half3(col), 1.0);
}
`;

/** Soft fog wisps sliding through the valleys. Three noise octaves per band
 * keep the per-frame pass cheap; output is premultiplied fog. */
export const DENISE_MIST = `
uniform float2 size;
uniform float time;
uniform float3 fogCol;

float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + float2(1, 0)), f.x),
             mix(hash2(i + float2(0, 1)), hash2(i + float2(1, 1)), f.x), f.y);
}
half4 main(float2 xy) {
  float scale = min(size.x / 390.0, size.y / 700.0);
  float a = 0.0;
  for (int k = 1; k < 5; k++) {
    float fk = float(k);
    float valley = size.y * (0.53 + fk * 0.085);
    float fy = (xy.y - valley) / (45.0 * scale);
    float band = smoothstep(-1.4, 0.2, fy) * (1.0 - smoothstep(0.4, 1.8, fy));
    float2 p = float2(xy.x / (190.0 * scale) + time * (0.018 + fk * 0.006) + fk * 5.3,
                      xy.y / (40.0 * scale));
    float n = noise(p) * 0.6 + noise(p * 2.1 + 3.7) * 0.28 + noise(p * 4.3 + 9.1) * 0.12;
    a = max(a, band * smoothstep(0.45, 0.8, n) * (0.42 - fk * 0.04));
  }
  return half4(half3(fogCol * a), half(a));
}
`;
