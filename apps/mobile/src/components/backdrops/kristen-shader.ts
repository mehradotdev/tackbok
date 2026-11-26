/**
 * Kristen: a granite dome in clear morning light above a misty pine valley.
 * KRISTEN_SCENE is detailed (an ellipsoid-lit dome with exfoliation sheets,
 * joints and water stains, layered pines), so it is drawn once into a texture;
 * KRISTEN_MIST is the cheap drifting layer animated on top.
 */
export const KRISTEN_SCENE = `
uniform float2 size;
uniform float3 sky;      // pale morning sky near the horizon
uniform float3 skyTop;   // cooler sky at the top
uniform float3 granite;  // sunlit granite
uniform float3 shade;    // granite in shadow (cool)
uniform float3 streak;   // water stains on the rock
uniform float3 pine;     // pine green
uniform float3 haze;     // valley haze
uniform float3 sun;      // warm morning light
uniform float3 ink;      // body text colour, for the readability floor

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
float lumOf(float3 c) {
  float3 l = mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, float3(2.4)), step(0.04045, c));
  return dot(l, float3(0.2126, 0.7152, 0.0722));
}

// Ridge line for the forested shoulders and the far range.
float ridgeY(float x, float baseY, float amp, float freq, float seed) {
  float v = noise1(x * freq + seed) * 0.6 + noise1(x * freq * 2.3 + seed * 3.0) * 0.28
          + noise1(x * freq * 5.1 + seed * 7.0) * 0.12;
  return baseY - amp * v;
}

// Pines standing on a ridge line: narrow spires with ragged tiers. Returns
// coverage in x and a 0..1 shading term in y (lit left edge, darker right).
float2 pines(float2 xy, float baseY, float amp, float freq, float seed, float cw, float hMax) {
  float cell = floor(xy.x / cw);
  float m = 0.0, lit = 0.5;
  for (int j = -3; j <= 3; j++) {
    float c = cell + float(j);
    float r = hash(c * 1.7 + seed * 31.0);
    if (r < 0.86) {
      float cx = (c + 0.15 + 0.7 * hash(c + seed * 3.1)) * cw;
      float ht = hMax * (0.45 + 0.55 * hash(c * 3.3 + seed));
      float top = ridgeY(cx, baseY, amp, freq, seed) - ht + 2.0;
      float t = (xy.y - top) / ht;
      if (t > 0.0 && t < 1.6) {
        // Tiers: each whorl flares out, then pulls in to the trunk.
        float tier = fract(t * 5.0 + hash(c) * 0.7);
        float rag = 0.75 + 0.25 * tier + 0.12 * (noise1(xy.y * 0.9 + c * 13.0) - 0.5);
        float hw = ht * 0.16 * min(t, 1.0) * rag + 0.35;
        float dx = xy.x - cx;
        float cov = 1.0 - smoothstep(hw - 0.6, hw + 0.6, abs(dx));
        if (cov > m) { m = cov; lit = 0.5 - 0.5 * clamp(dx / max(hw, 0.5), -1.0, 1.0); }
      }
    }
  }
  return float2(m, lit);
}

half4 main(float2 xy) {
  float scale = min(size.x / 390.0, size.y / 700.0);
  float2 uv = xy / size;
  float aspect = size.y / size.x;

  // Sky: cool at the top, warming toward the horizon and the low sun on the left.
  float3 col = mix(skyTop, sky, smoothstep(0.0, 0.62, uv.y));
  float2 sp = float2(-0.05, 0.42);
  float sd = length((uv - sp) * float2(1.0, aspect));
  col = mix(col, sun, 0.38 * exp(-sd * sd * 3.5));

  // A few high, thin streaks of cloud.
  float2 cp = float2(uv.x * 1.3, uv.y * 9.0);
  float wisp = fbm(cp + float2(fbm(cp * 0.5) * 1.5, 0.0));
  col = mix(col, mix(float3(1.0), sun, 0.15),
            0.45 * smoothstep(0.55, 0.82, wisp) * smoothstep(0.03, 0.12, uv.y) * (1.0 - smoothstep(0.2, 0.4, uv.y)));

  // Two far ranges, fading into the haze.
  float far1 = ridgeY(xy.x, size.y * 0.58, 60.0 * scale, 1.0 / (160.0 * scale), 2.0);
  col = mix(col, mix(sky, shade, 0.30), 0.80 * smoothstep(far1 - 0.7, far1 + 0.7, xy.y));
  float far2 = ridgeY(xy.x, size.y * 0.66, 55.0 * scale, 1.0 / (110.0 * scale), 4.0);
  float3 far2Col = mix(mix(sky, shade, 0.45), pine, 0.12);
  far2Col *= 0.97 + 0.06 * fbm(xy / (30.0 * scale));
  col = mix(col, far2Col, 0.85 * smoothstep(far2 - 0.7, far2 + 0.7, xy.y));

  // The dome, on the right: a half-ellipsoid with a steeper face toward the left.
  float cx = size.x - 70.0 * scale;
  float baseY = size.y * 0.76;
  float w = 270.0 * scale;
  float h = 285.0 * scale;
  float d = (xy.x - cx) / w;
  d = d < 0.0 ? d * 1.3 : d;
  float v = (baseY - xy.y) / h;  // 0 at the base, 1 at the crown
  float edgeWob = (noise1(xy.y * 0.05 / scale) - 0.5) * 0.04 + (noise1(xy.y * 0.21 / scale) - 0.5) * 0.015;
  // Superellipse outline: a fuller shoulder than an ellipse.
  float ad = max(abs(d) + edgeWob, 0.0), av = max(v, 0.0);
  float r = pow(pow(ad, 2.4) + pow(av, 2.0), 0.5);
  float px = 1.0 / w;  // one point in d-units, for antialiasing
  float inside = (1.0 - smoothstep(1.0 - px * 1.2, 1.0 + px * 1.2, r)) * step(0.0, v + 0.05);
  if (inside > 0.0) {
    float z = sqrt(max(1.0 - d * d - av * av, 0.02));
    float3 n = normalize(float3(d * 1.2, av * 0.9, z));
    // Small relief: big slabs plus grain.
    float2 rp = float2(xy.x, xy.y) / (18.0 * scale);
    float bump = fbm(rp) - 0.5;
    n = normalize(n + float3(bump * 0.35, (fbm(rp + 9.0) - 0.5) * 0.35, 0.0));
    float3 L = normalize(float3(-0.70, 0.45, 0.55));
    float key = clamp(dot(n, L), 0.0, 1.0);
    float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
    float fill = clamp(n.y * 0.5 + 0.5, 0.0, 1.0); // sky fill from above

    // Exfoliation sheets: broken shells parallel to the surface.
    float shell = r * 9.0 + fbm(rp * 0.18) * 1.6;
    float sf = fract(shell);
    float shellOn = smoothstep(0.35, 0.6, noise(float2(xy.x / (60.0 * scale), shell * 0.7)));
    float lip = (1.0 - smoothstep(0.0, 0.06, sf)) * shellOn;          // lit lip of a sheet
    float under = smoothstep(0.82, 1.0, sf) * shellOn;               // shadow under the next sheet

    // Joints: a few dark cracks running down-slope.
    float jx = (xy.x + fbm(rp * 0.6) * 22.0 * scale) / (46.0 * scale);
    float joint = 1.0 - smoothstep(0.0, 0.03, abs(fract(jx) - 0.5));
    joint *= step(0.7, hash(floor(jx) + 3.0)) * smoothstep(0.1, 0.4, noise(float2(floor(jx), xy.y / (90.0 * scale))));

    // Water stains: thin dark streaks starting at ledges and fading downwards.
    float sx = xy.x / (4.5 * scale) + fbm(rp * 0.4) * 3.0;
    float sid = floor(sx);
    float sOn = step(0.6, hash(sid * 1.3 + 5.0));
    float sStart = hash(sid * 2.7) * 0.7 + 0.15;  // start height (v)
    float sLen = 0.25 + 0.45 * hash(sid * 4.1);
    float sAlong = clamp((sStart - v) / sLen, 0.0, 1.0);
    float sProfile = smoothstep(0.0, 0.08, sStart - v) * (1.0 - sAlong);
    float sW = 1.0 - smoothstep(0.15, 0.48, abs(fract(sx) - 0.5));
    float stains = sOn * sW * sProfile * (0.5 + 0.5 * hash(sid * 9.1));

    // Granite colour: warm in sun, cool in shade, patchy tone.
    float tone = fbm(rp * 0.35 + 3.0);
    float3 rock = mix(shade, granite, smoothstep(0.25, 1.0, wrap * 0.75 + key * 0.45));
    rock = mix(rock, rock * float3(1.03, 0.99, 0.94), tone);                   // warm patches
    rock += (sun - 0.85) * 0.35 * key * key;                                  // sun glow
    rock = mix(rock, rock * mix(float3(0.9, 0.93, 1.0), float3(1.0), fill), 0.5);
    rock *= 0.93 + 0.12 * fbm(xy / (2.2 * scale)) ;                            // fine grain
    rock += lip * 0.07 * (0.4 + key);
    rock *= 1.0 - under * 0.12 * (1.0 - key * 0.5);
    rock = mix(rock, streak, stains * 0.42);
    rock = mix(rock, shade * 0.8, joint * 0.25);
    // Rim darkening and haze thickening toward the foot.
    rock *= 1.0 - 0.10 * smoothstep(0.85, 1.0, r);
    rock = mix(rock, haze, 0.16 + 0.45 * (1.0 - smoothstep(0.0, 0.35, v)));
    col = mix(col, rock, inside);
  }

  // Valley mist in front of the dome's foot.
  float hy = (xy.y - size.y * 0.72) / (60.0 * scale);
  float band = smoothstep(-1.6, 0.0, hy) * (1.0 - smoothstep(0.8, 2.6, hy));
  float2 fp = float2(xy.x / (220.0 * scale), xy.y / (46.0 * scale));
  float mist = fbm(fp + float2(fbm(fp * 0.7) * 0.8, 0.0)) * 0.75 + noise(fp * 0.5) * 0.25;
  col = mix(col, haze, band * smoothstep(0.3, 0.7, mist) * 0.75);

  // Forested shoulder: a canopy of soft pine tops, hazy.
  float midBase = size.y * 0.80;
  float midAmp = 34.0 * scale, midFreq = 1.0 / (120.0 * scale);
  float midTop = ridgeY(xy.x, midBase, midAmp, midFreq, 5.0);
  float2 midP = pines(xy, midBase, midAmp, midFreq, 5.0, 6.0 * scale, 22.0 * scale);
  float midFill = smoothstep(midTop - 0.7, midTop + 0.7, xy.y);
  float midM = max(midFill, midP.x);
  float canopy = fbm(float2(xy.x / (5.0 * scale), xy.y / (8.0 * scale)));
  float3 midCol = mix(haze, pine, 0.36);
  midCol *= 0.98 + 0.12 * canopy;
  midCol = mix(midCol, midCol * float3(1.06, 1.07, 1.03), midP.y * midP.x);
  // Mist settles between the rows.
  midCol = mix(midCol, haze, 0.35 * smoothstep(0.0, 60.0 * scale, xy.y - midTop));
  col = mix(col, midCol, midM);

  // Nearest pines: taller, but still softened by the morning haze.
  float nearBase = size.y * 0.93;
  float nAmp = 30.0 * scale, nFreq = 1.0 / (90.0 * scale);
  float nearTop = ridgeY(xy.x, nearBase, nAmp, nFreq, 9.0);
  float2 nearP = pines(xy, nearBase, nAmp, nFreq, 9.0, 10.0 * scale, 62.0 * scale);
  float nearFill = smoothstep(nearTop - 0.7, nearTop + 0.7, xy.y);
  float nearM = max(nearFill, nearP.x);
  float3 nearCol = mix(haze, pine, 0.5);
  nearCol *= 0.97 + 0.12 * fbm(float2(xy.x / (4.0 * scale), xy.y / (6.0 * scale)));
  nearCol = mix(nearCol, nearCol * float3(1.08, 1.09, 1.04), nearP.y * nearP.x);
  // Trunks of the nearest trees show as darker cores.
  nearCol = mix(nearCol, nearCol * float3(0.9, 0.92, 0.95), (1.0 - nearP.y) * nearP.x * 0.6);
  col = mix(col, nearCol, nearM);

  // Readability floor: journal text sits straight on the scene, so lift any
  // pixel darker than 4.5:1 against the text toward the haze (as Denise does).
  float floorLum = (lumOf(ink) + 0.05) * 4.6 - 0.05;
  if (lumOf(col) < floorLum) {
    float lo = 0.0, hi = 1.0;
    for (int s = 0; s < 10; s++) {
      float m = 0.5 * (lo + hi);
      if (lumOf(mix(col, haze, m)) < floorLum) lo = m; else hi = m;
    }
    col = mix(col, haze, hi);
  }

  col += (hash2(xy) - 0.5) * 0.008;
  return half4(half3(col), 1.0);
}
`;

/** Soft valley mist drifting past the dome's foot and between the pine rows.
 * Three noise octaves keep the per-frame pass cheap; output is premultiplied. */
export const KRISTEN_MIST = `
uniform float2 size;
uniform float time;
uniform float3 haze;

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
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float valley = size.y * (0.73 + fk * 0.11);
    float fy = (xy.y - valley) / (40.0 * scale);
    float band = smoothstep(-1.4, 0.2, fy) * (1.0 - smoothstep(0.4, 1.8, fy));
    if (band <= 0.0) continue;   // outside this band: skip the noise
    float2 p = float2(xy.x / (200.0 * scale) + time * (0.02 + fk * 0.008) + fk * 5.3,
                      xy.y / (36.0 * scale));
    float n = noise(p) * 0.6 + noise(p * 2.1 + 3.7) * 0.28 + noise(p * 4.3 + 9.1) * 0.12;
    a = max(a, band * smoothstep(0.45, 0.8, n) * (0.4 - fk * 0.08));
  }
  return half4(half3(haze * a), half(a));
}
`;
