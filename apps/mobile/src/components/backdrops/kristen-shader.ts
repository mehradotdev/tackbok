/**
 * Kristen: a sheer granite wall in the spirit of El Capitan, lit by the morning
 * sun, above a misty pine valley. KRISTEN_SCENE is detailed (fluted granite,
 * black water streaks, a darker band of diorite, layered pines), so it is drawn
 * once into a texture. Per frame only cheap layers run: KRISTEN_MIST drifts
 * through the valley and KRISTEN_LIFE draws a hiker waving from the summit and
 * a hawk soaring over the valley.
 *
 * `bold` (0 soft .. about 2) deepens the wall's shading and streaks and
 * `forestBold` the pines;
 * `floorRatio` is the body-text contrast the scene keeps (1 turns it off).
 */
const GEOMETRY = `
float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float noise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}
// The wall's geometry, shared by the scene and the overlay (the hiker stands on
// the rim). All in points.
float kScale() { return min(size.x / 390.0, size.y / 700.0); }
float wallBaseY() { return size.y * 0.80; }
float wallH() { return 380.0 * kScale(); }
float wallTop() { return wallBaseY() - wallH(); }
float prowX() { return size.x - 178.0 * kScale(); }
// The prow: leans back toward the top, with a gentle bulge at mid-height.
float leftEdge(float y) {
  float s = kScale();
  float t = clamp((y - wallTop()) / wallH(), 0.0, 1.0);  // 0 top .. 1 foot
  return prowX() + 26.0 * s * (1.0 - t) - 12.0 * s * sin(3.14159 * t)
       + (noise1(y / (9.0 * s)) - 0.5) * 2.0 * s;
}
// The summit rim: rises gently away from the prow, then levels off.
float crestY(float x) {
  float s = kScale();
  float u = (x - prowX()) / (200.0 * s);
  return wallTop() - 14.0 * s * smoothstep(0.0, 1.0, u) + (noise1(x / (14.0 * s)) - 0.5) * 3.0 * s;
}
float hikerX() { return prowX() + 78.0 * kScale(); }
`;

export const KRISTEN_SCENE = `
uniform float2 size;
uniform float3 sky;      // pale morning sky near the horizon (theme background)
uniform float3 skyTop;   // cooler sky at the top
uniform float3 granite;  // sunlit granite
uniform float3 shade;    // granite in shadow (cool)
uniform float3 streak;   // water stains on the rock
uniform float3 pine;     // pine green
uniform float3 haze;     // valley haze
uniform float3 sun;      // warm morning light
uniform float3 ink;      // theme foreground: body text drawn over the scene
uniform float bold;        // how hard the wall is drawn
uniform float forestBold;  // how hard the pines are drawn
uniform float floorRatio;
${GEOMETRY}
float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
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
// Rounded intersection of two signed distances (negative inside).
float roundCut(float a, float b, float r) {
  float2 u = max(float2(r + a, r + b), float2(0.0));
  return min(-r, max(a, b)) + length(u);
}
float ridgeY(float x, float baseY, float amp, float freq, float seed) {
  float v = noise1(x * freq + seed) * 0.6 + noise1(x * freq * 2.3 + seed * 3.0) * 0.28
          + noise1(x * freq * 5.1 + seed * 7.0) * 0.12;
  return baseY - amp * v;
}
// Pines on a ridge line: coverage in x, lit side (1 = left edge) in y.
float2 pines(float2 xy, float baseY, float amp, float freq, float seed, float cw, float hMax) {
  float cell = floor(xy.x / cw);
  float m = 0.0, lit = 0.5;
  for (int j = -3; j <= 3; j++) {
    float c = cell + float(j);
    if (hash(c * 1.7 + seed * 31.0) < 0.86) {
      float cx = (c + 0.15 + 0.7 * hash(c + seed * 3.1)) * cw;
      float ht = hMax * (0.45 + 0.55 * hash(c * 3.3 + seed));
      float top = ridgeY(cx, baseY, amp, freq, seed) - ht + 2.0;
      float t = (xy.y - top) / ht;
      if (t > 0.0 && t < 1.6) {
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
// Small pines along the summit rim, right of the hiker.
float rimPines(float2 xy, float s) {
  float cw = 6.5 * s;
  float cell = floor(xy.x / cw);
  float m = 0.0;
  for (int j = -2; j <= 2; j++) {
    float c = cell + float(j);
    float cx = (c + 0.2 + 0.6 * hash(c * 5.3)) * cw;
    if (cx > prowX() + 104.0 * s && hash(c * 2.9 + 4.0) < 0.62) {
      float ht = (6.0 + 9.0 * hash(c * 7.7)) * s;
      float top = crestY(cx) - ht + 1.5 * s;
      float t = (xy.y - top) / ht;
      if (t > 0.0 && t < 1.15) {
        float hw = ht * 0.2 * min(t, 1.0) * (0.75 + 0.25 * fract(t * 4.0)) + 0.3;
        m = max(m, 1.0 - smoothstep(hw - 0.5, hw + 0.5, abs(xy.x - cx)));
      }
    }
  }
  return m;
}

half4 main(float2 xy) {
  float s = kScale();
  float2 uv = xy / size;
  float aspect = size.y / size.x;

  // Sky: cool at the top, warming toward the horizon and the low sun on the left.
  float3 col = mix(skyTop, sky, smoothstep(0.0, 0.62, uv.y));
  float sd = length((uv - float2(-0.05, 0.42)) * float2(1.0, aspect));
  col = mix(col, sun, 0.38 * exp(-sd * sd * 3.5));
  float2 cp = float2(uv.x * 1.3, uv.y * 9.0);
  float wisp = fbm(cp + float2(fbm(cp * 0.5) * 1.5, 0.0));
  col = mix(col, mix(float3(1.0), sun, 0.15),
            0.45 * smoothstep(0.55, 0.82, wisp) * smoothstep(0.03, 0.12, uv.y) * (1.0 - smoothstep(0.2, 0.4, uv.y)));

  // Far ranges across the valley, fading into the haze.
  float far1 = ridgeY(xy.x, size.y * 0.60, 60.0 * s, 1.0 / (160.0 * s), 2.0);
  col = mix(col, mix(sky, shade, 0.30), 0.80 * smoothstep(far1 - 0.7, far1 + 0.7, xy.y));
  float far2 = ridgeY(xy.x, size.y * 0.68, 55.0 * s, 1.0 / (110.0 * s), 4.0);
  float3 far2Col = mix(mix(sky, shade, 0.45 + 0.1 * bold), pine, 0.12);
  far2Col *= 0.97 + 0.06 * fbm(xy / (30.0 * s));
  col = mix(col, far2Col, 0.85 * smoothstep(far2 - 0.7, far2 + 0.7, xy.y));

  // The wall: a sheer granite monolith with a rounded summit, its prow facing left.
  float le = leftEdge(xy.y);
  float rim = crestY(xy.x);
  float dist = roundCut(le - xy.x, rim - xy.y, 60.0 * s);
  float inside = 1.0 - smoothstep(-0.7, 0.7, dist);
  if (inside > 0.0) {
    float t = clamp((xy.y - wallTop()) / wallH(), 0.0, 1.0);
    float2 rp = xy / (16.0 * s);
    // The prow is rounded: across its first stretch the rock turns from the low
    // sun on the left to face us, so the light falls off gradually, not in a band.
    float px = le + (44.0 + 10.0 * t) * s;
    float side = 1.0 - smoothstep(le, px, xy.x + (noise1(xy.y / (9.0 * s)) - 0.5) * 8.0 * s);
    float across = clamp((xy.x - px) / max(size.x - px, 1.0), 0.0, 1.0);
    float3 n = normalize(mix(float3(0.1 + 0.55 * across, 0.0, 1.0), float3(-0.6, 0.0, 0.8), side));
    // The rounded summit: the surface turns up toward the sky near the rim.
    float below = max(xy.y - rim, 0.0);
    n = normalize(n + float3(0.0, 1.3 * (1.0 - smoothstep(0.0, 42.0 * s, below)), 0.0));
    // Vertical flutes rather than blotches.
    n = normalize(n + float3((fbm(xy / (float2(7.0, 34.0) * s)) - 0.5) * 0.4, (fbm(rp + 9.0) - 0.5) * 0.12, 0.0));
    float3 L = normalize(float3(-0.75, 0.35, 0.55));
    float key = clamp(dot(n, L), 0.0, 1.0);
    float fill = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);

    float depthShade = min((1.0 - key) * (0.35 + 0.45 * bold), 1.0);
    float3 rock = mix(granite, shade, depthShade);
    rock += (sun - 0.85) * 0.14 * key * key;                       // a hint of warm morning light
    rock = mix(rock, rock * float3(0.93, 0.96, 1.03), (1.0 - key) * fill * 0.5);  // cool sky fill
    float tone = fbm(rp * 0.3 + 3.0);
    rock *= mix(float3(0.97, 0.98, 1.0), float3(1.03, 1.0, 0.95), tone);
    rock *= 0.93 + 0.12 * fbm(xy / (2.0 * s));                       // grain

    // Long cracks and dihedrals running the height of the wall.
    float cx = (xy.x + (fbm(float2(xy.y / (60.0 * s), 3.0)) - 0.5) * 18.0 * s) / (21.0 * s);
    float cid = floor(cx);
    float cOn = step(0.55, hash(cid * 3.1 + 1.0));
    float cStart = hash(cid * 1.9) * 0.5, cEnd = cStart + 0.3 + 0.6 * hash(cid * 6.1);
    float cSpan = smoothstep(cStart, cStart + 0.04, t) * (1.0 - smoothstep(cEnd - 0.05, cEnd, t));
    float crack = cOn * cSpan * (1.0 - smoothstep(0.0, 0.035, abs(fract(cx) - 0.5)));
    rock = mix(rock, rock * 0.62, crack * (0.35 + 0.35 * bold));

    // Black water streaks, mostly on the front face: wide at the rim or a ledge,
    // tapering and fading unevenly downward.
    float sx = xy.x / (11.0 * s) + (noise1(xy.y / (55.0 * s) + 2.0) - 0.5) * 0.45;
    float sid = floor(sx);
    float sOn = step(0.5, hash(sid * 1.3 + 5.0)) * (1.0 - 0.6 * side);
    float sStart = step(0.5, hash(sid * 8.3)) * hash(sid * 2.7) * 0.3;
    float along = (t - sStart) / (0.35 + 0.6 * hash(sid * 4.1));
    float sWidth = mix(0.44, 0.1, clamp(along, 0.0, 1.0)) * (0.6 + 0.5 * hash(sid * 3.3));
    float sf = abs(fract(sx) - 0.5 + (hash(sid) - 0.5) * 0.2);
    float stains = sOn * (1.0 - smoothstep(0.0, sWidth, sf))
                 * smoothstep(-0.02, 0.12, along) * (1.0 - smoothstep(0.35, 1.0, along))
                 * (0.45 + 0.55 * noise1(xy.y / (14.0 * s) + sid * 7.0)) * (0.7 + 0.6 * fbm(xy / (5.0 * s)));
    rock = mix(rock, mix(streak, shade * 0.6, 0.5), clamp(stains, 0.0, 1.0) * (0.28 + 0.32 * bold));

    // A darker band of diorite across the front face.
    float2 dc = (xy - float2(px + 110.0 * s, wallTop() + wallH() * 0.40)) / float2(55.0 * s, 75.0 * s);
    float dio = smoothstep(0.5, 0.66, fbm(xy / (34.0 * s) + 7.0) * 0.8 + 0.5 * (1.0 - length(dc)));
    float speck = step(0.55, noise(xy / (1.3 * s)));
    rock = mix(rock, mix(shade, streak, 0.25 + 0.2 * speck), dio * (0.16 + 0.24 * bold) * (1.0 - side));

    // A thin highlight along the rim.
    rock += 0.06 * (1.0 - smoothstep(0.0, 2.0 * s, below));
    // Aerial perspective: the foot of the wall sinks into the haze.
    rock = mix(rock, haze, max(0.10 - 0.06 * bold, 0.0) + 0.5 * smoothstep(0.6, 1.0, t));
    col = mix(col, rock, inside);
  }
  // Summit pines against the sky.
  float rp2 = rimPines(xy, s);
  col = mix(col, mix(haze, pine, 0.42 + 0.25 * forestBold), rp2);

  // Valley mist at the wall's foot.
  float hy = (xy.y - size.y * 0.74) / (60.0 * s);
  float band = smoothstep(-1.6, 0.0, hy) * (1.0 - smoothstep(0.8, 2.6, hy));
  float2 fp = float2(xy.x / (220.0 * s), xy.y / (46.0 * s));
  float mist = fbm(fp + float2(fbm(fp * 0.7) * 0.8, 0.0)) * 0.75 + noise(fp * 0.5) * 0.25;
  col = mix(col, haze, band * smoothstep(0.3, 0.7, mist) * 0.75);

  // Forested valley floor, then the nearest pines.
  float midBase = size.y * 0.83;
  float midAmp = 30.0 * s, midFreq = 1.0 / (120.0 * s);
  float midTop = ridgeY(xy.x, midBase, midAmp, midFreq, 5.0);
  float2 midP = pines(xy, midBase, midAmp, midFreq, 5.0, 6.0 * s, 22.0 * s);
  float midM = max(smoothstep(midTop - 0.7, midTop + 0.7, xy.y), midP.x);
  float3 midCol = mix(haze, pine, 0.36 + 0.24 * forestBold);
  midCol *= 0.98 + 0.12 * fbm(float2(xy.x / (5.0 * s), xy.y / (8.0 * s)));
  midCol = mix(midCol, midCol * float3(1.06, 1.07, 1.03), midP.y * midP.x);
  midCol = mix(midCol, haze, 0.35 * smoothstep(0.0, 60.0 * s, xy.y - midTop));
  col = mix(col, midCol, midM);

  float nearBase = size.y * 0.95;
  float nAmp = 28.0 * s, nFreq = 1.0 / (90.0 * s);
  float nearTop = ridgeY(xy.x, nearBase, nAmp, nFreq, 9.0);
  float2 nearP = pines(xy, nearBase, nAmp, nFreq, 9.0, 10.0 * s, 62.0 * s);
  float nearM = max(smoothstep(nearTop - 0.7, nearTop + 0.7, xy.y), nearP.x);
  float3 nearCol = mix(haze, pine, 0.5 + 0.28 * forestBold);
  nearCol *= 0.97 + 0.12 * fbm(float2(xy.x / (4.0 * s), xy.y / (6.0 * s)));
  nearCol = mix(nearCol, nearCol * float3(1.08, 1.09, 1.04), nearP.y * nearP.x);
  nearCol = mix(nearCol, nearCol * float3(0.9, 0.92, 0.95), (1.0 - nearP.y) * nearP.x * 0.6);
  col = mix(col, nearCol, nearM);

  // Readability floor: lift any pixel darker than floorRatio:1 against the text.
  if (floorRatio > 1.01) {
    float floorLum = (lumOf(ink) + 0.05) * floorRatio - 0.05;
    if (lumOf(col) < floorLum) {
      float lo = 0.0, hi = 1.0;
      for (int k = 0; k < 10; k++) {
        float m = 0.5 * (lo + hi);
        if (lumOf(mix(col, haze, m)) < floorLum) lo = m; else hi = m;
      }
      col = mix(col, haze, hi);
    }
  }
  col += (hash2(xy) - 0.5) * 0.008;
  return half4(half3(col), 1.0);
}
`;

/** The hiker on the rim and the soaring hawk, drawn at the darkest tone the
 * readability floor allows. Output is premultiplied. */
export const KRISTEN_LIFE = `
uniform float2 size;
uniform float time;
uniform float3 ink;
uniform float3 haze;
uniform float floorRatio;
${GEOMETRY}
float seg(float2 p, float2 a, float2 b) {
  float2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
float2 dirFromDown(float a) { return float2(-sin(a), -cos(a)); }
float lumOf(float3 c) {
  float3 l = mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, float3(2.4)), step(0.04045, c));
  return dot(l, float3(0.2126, 0.7152, 0.0722));
}

// A hiker on the rim, facing us. Coordinates in figure units, y up, feet at 0.
// Returns a signed distance in figure units.
float hiker(float2 q, float time) {
  time += 2.0;  // a still frame (time 0) catches him mid-wave
  float d = seg(q, float2(-0.9, 7.5), float2(-1.5, 0.4)) - 1.0;           // legs
  d = min(d, seg(q, float2(0.9, 7.5), float2(1.5, 0.4)) - 1.0);
  d = min(d, seg(q, float2(0.0, 7.8), float2(0.0, 12.4)) - 1.9);          // torso
  d = min(d, seg(q, float2(1.7, 9.0), float2(1.8, 12.0)) - 1.4);          // backpack
  d = min(d, length(q - float2(0.0, 15.2)) - 1.9);                        // head
  d = min(d, seg(q, float2(1.7, 12.2), float2(2.6, 7.6)) - 0.75);         // left arm, at rest
  // Right arm (our left): waves for about five seconds, rests for four.
  float ct = mod(time, 9.0);
  float up = smoothstep(0.0, 0.6, ct) * (1.0 - smoothstep(5.0, 5.8, ct));
  float swing = sin(time * 6.2831853 * 1.7) * 0.5 * up;
  float upper = mix(0.25, 2.45, up);
  float fore = mix(0.35, 2.9 + swing, up);
  float2 shoulder = float2(-1.7, 12.2);
  float2 elbow = shoulder + 3.6 * dirFromDown(upper);
  float2 hand = elbow + 3.3 * dirFromDown(fore);
  d = min(d, seg(q, shoulder, elbow) - 0.75);
  d = min(d, seg(q, elbow, hand) - 0.7);
  return d;
}

// A hawk soaring in slow loops over the valley: wings in a shallow V, banking
// with the turn. Signed distance in bird units.
float hawk(float2 q, float time) {
  float flex = 0.5 * sin(time * 6.2831853 / 8.0);  // 8 s divides the 6 h clock wrap
  float d = seg(q, float2(0.0, 0.3), float2(0.0, -1.2)) - 0.65;            // body
  for (int k = 0; k < 2; k++) {
    float sx = k == 0 ? -1.0 : 1.0;
    float2 elbow = float2(sx * 4.8, 1.1 + flex * 0.4);
    float2 tip = float2(sx * 10.0, 0.4 + flex);
    d = min(d, seg(q, float2(0.0, 0.0), elbow) - 0.85);
    d = min(d, seg(q, elbow, tip) - mix(0.75, 0.35, clamp(abs(q.x) / 10.0, 0.0, 1.0)));
  }
  d = min(d, seg(q, float2(0.0, -1.2), float2(0.0, -2.6)) - 0.9);         // tail
  return d;
}

half4 main(float2 xy) {
  float s = kScale();
  float a = 0.0;

  float hx = hikerX();
  float2 feet = float2(hx, crestY(hx) + 0.6 * s);
  float k = 1.05 * s;                                   // points per figure unit
  float2 q = float2(xy.x - feet.x, feet.y - xy.y) / k;
  if (abs(q.x) < 12.0 && q.y > -2.0 && q.y < 24.0) {
    a = max(a, 1.0 - smoothstep(-0.5 / k, 0.5 / k, hiker(q, time)));
  }

  float orbit = time * 6.2831853 / 36.0;
  float2 c = float2(size.x * 0.40 + 120.0 * s * cos(orbit), wallTop() - 75.0 * s + 22.0 * s * sin(orbit));
  float kb = s * (0.85 + 0.15 * sin(orbit));
  float bank = 0.3 * cos(orbit);
  float2 r = (xy - c) / kb;
  float2 bq = float2(r.x * cos(bank) + r.y * sin(bank), -(-r.x * sin(bank) + r.y * cos(bank)));
  if (abs(bq.x) < 12.0 && abs(bq.y) < 5.0) {
    a = max(a, 1.0 - smoothstep(-0.5 / kb, 0.5 / kb, hawk(bq, time)));
  }
  if (a <= 0.0) return half4(0.0);

  // Darkest tone the scene allows, so text over the figures still reads
  // (a fixed soft tone when the floor is off).
  float3 figure = mix(ink, haze, 0.35);
  if (floorRatio > 1.01) {
    float floorLum = (lumOf(ink) + 0.05) * floorRatio - 0.05;
    float lo = 0.0, hi = 1.0;
    for (int i = 0; i < 10; i++) {
      float m = 0.5 * (lo + hi);
      if (lumOf(mix(ink, haze, m)) < floorLum) lo = m; else hi = m;
    }
    figure = mix(ink, haze, hi);
  }
  return half4(half3(figure * a), half(a));
}
`;

/** Soft valley mist drifting past the wall's foot and between the pine rows.
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
    float valley = size.y * (0.75 + fk * 0.11);
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

/** Where the life layer draws, mirroring kScale() and wallTop() in GEOMETRY:
 * from above the hawk's loop down to just below the rim. */
export function kristenLifeBand(width: number, height: number) {
  const s = Math.min(width / 390, height / 700);
  const wallTop = height * 0.8 - 380 * s;
  const y = Math.max(0, Math.floor(wallTop - 125 * s));
  return { x: 0, y, width, height: Math.ceil(wallTop + 4 * s) - y };
}
