/**
 * Christmas: a moonlit snowy valley of firs with one decorated tree.
 * PINE_SCENE is detailed (layered hills, drifts, tiered firs), so it is drawn
 * once into a texture. Two cheap layers animate on top: PINE_LIGHTS (twinkling
 * stars, blinking tree lights and the special-day fireworks, added with `plus`)
 * and PINE_SNOW (falling flakes, drawn over everything).
 */
const SHARED = `
uniform float2 size;

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
float sceneScale() { return min(size.x / 390.0, size.y / 700.0); }

// The decorated tree stands at the left edge of the home action dock (about
// 104 pt wide on the right, and it collapses on scroll), so a little overlap is fine.
const float TREE_H = 175.0;
float treeX(float scale) { return size.x - 140.0 * scale; }
float treeBase(float scale) { return size.y - 18.0 * scale; }

// Hill line for layer k (0 far .. 2 near), in points.
float hillY(int k, float x, float scale) {
  float fk = float(k);
  float base = size.y * (0.56 + fk * 0.11);
  float amp = (34.0 - fk * 6.0) * scale;
  float f = (1.6 + fk * 0.6) / (390.0 * scale);
  return base - amp * (noise1(x * f + fk * 7.0) * 0.75 + noise1(x * f * 2.7 + fk) * 0.25);
}

// Tree light i: position in points and colour choice (0 warm, 1 berry).
float3 bulb(int i, float scale) {
  float fi = float(i);
  float bt = 0.1 + 0.85 * (fi + hash(fi * 3.7 + 1.0)) / 24.0;   // spread down the tree
  float bw = TREE_H * scale * 0.34 * bt * 0.8;
  return float3(treeX(scale) + bw * (hash(fi * 9.1) * 2.0 - 1.0),
                treeBase(scale) - TREE_H * scale * (1.0 - bt),
                step(0.5, hash(fi * 5.3)));
}
`;

export const PINE_SCENE = `
uniform float3 sky;     // theme background: the top of the sky
uniform float3 snow;    // moonlit snow, the brightest landscape tone
uniform float3 pine;    // fir silhouettes
uniform float3 warm;    // star and warm bulbs
uniform float3 berry;   // red bulbs
uniform float3 ink;     // theme foreground: body text drawn over the scene
${SHARED}
float fbm(float2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float lumOf(float3 c) {
  float3 l = mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, float3(2.4)), step(0.04045, c));
  return dot(l, float3(0.2126, 0.7152, 0.0722));
}

// Snowy firs standing on hill k. Returns (coverage, snow on branches).
float2 firs(int k, float2 xy, float scale) {
  float fk = float(k);
  float cw = (7.0 + fk * 6.0) * scale;
  float hMax = (26.0 + fk * 22.0) * scale;
  float cell = floor(xy.x / cw);
  float m = 0.0, s = 0.0;
  for (int j = -2; j <= 2; j++) {
    float c = cell + float(j);
    float r = hash(c * 1.7 + fk * 31.0);
    float dens = noise1(c * 0.13 + fk * 5.0);
    float cx = (c + 0.2 + 0.6 * hash(c + fk * 3.1)) * cw;
    // Keep a clearing behind the decorated tree.
    float clearing = k == 2 ? 1.0 - smoothstep(40.0 * scale, 70.0 * scale, abs(cx - treeX(scale))) : 0.0;
    if (r < (0.15 + smoothstep(0.3, 0.65, dens) * 0.8) * (1.0 - clearing)) {
      float ht = hMax * (0.5 + 0.5 * hash(c * 3.3 + fk));
      float top = hillY(k, cx, scale) - ht + 4.0 * scale;
      float t = (xy.y - top) / ht;
      if (t > 0.0 && t < 1.15) {
        float tier = fract(t * 4.0);
        float hw = ht * 0.30 * t * (0.45 + 0.55 * pow(tier, 0.6)) + 0.6 * scale;
        float dx = abs(xy.x - cx);
        float cov = 1.0 - smoothstep(hw - 0.7 * scale, hw + 0.7 * scale, dx);
        if (cov > m) {
          m = cov;
          // Snow rests on the upper edge of each tier.
          float edge = 1.0 - smoothstep(0.0, 2.2 * scale, hw - dx);
          s = max((1.0 - smoothstep(0.05, 0.35, tier)) * 0.7, edge * smoothstep(0.2, 0.6, tier) * 0.6)
              * (0.55 + 0.45 * hash2(float2(c, floor(t * 4.0))));
        }
      }
    }
  }
  return float2(m, s);
}

// The decorated tree. Returns coverage; tierOut: 0..1 down each tier,
// tOut: 0 at the trunk line .. 1 at the branch tips.
float tree(float2 xy, float scale, out float tierOut, out float tOut) {
  float cx = treeX(scale);
  float ht = TREE_H * scale;
  float top = treeBase(scale) - ht;
  float t = (xy.y - top) / ht;
  tierOut = 0.0; tOut = t;
  if (t < 0.0 || t > 1.0) return 0.0;
  float tierIdx = floor(t * 6.0 + 0.3);
  float tier = fract(t * 6.0 + 0.3);
  tierOut = tier;
  float jag = 0.85 + 0.3 * hash(tierIdx * 4.1 + (xy.x > cx ? 1.0 : 0.0));
  float hw = ht * 0.34 * t * (0.45 + 0.55 * pow(tier, 0.5)) * jag + 1.0 * scale;
  // Ragged branch tips.
  hw *= 1.0 + 0.07 * (noise(float2(xy.y / (7.0 * scale), xy.x > cx ? 3.0 : 9.0)) - 0.5);
  if (t > 0.97) hw = 3.0 * scale;   // trunk stub
  tOut = abs(xy.x - cx) / max(hw, 0.001);
  return 1.0 - smoothstep(hw - 0.8 * scale, hw + 0.8 * scale, abs(xy.x - cx));
}

half4 main(float2 xy) {
  float scale = sceneScale();
  float2 uv = xy / size;

  // Sky: deep pine-blue, a little lighter toward the horizon.
  float3 horizonCol = mix(sky, snow, 0.22);
  float3 col = mix(sky, horizonCol, smoothstep(0.15, 0.62, uv.y));
  // Moon and halo.
  float2 moon = float2(0.2 * size.x, 0.25 * size.y);
  float md = length(xy - moon) / scale;
  col = mix(col, mix(col, snow, 0.5), 0.35 * exp(-md * md / 4200.0));
  float disc = 1.0 - smoothstep(15.0, 16.5, md);
  float crater = 0.06 * fbm((xy - moon) / (5.0 * scale));
  col = mix(col, float3(0.92, 0.94, 0.95) - crater, disc);
  // Thin clouds across the moon.
  float cl = fbm(float2(uv.x * 3.0, uv.y * 14.0));
  col = mix(col, mix(sky, snow, 0.35), 0.35 * smoothstep(0.55, 0.85, cl) * (1.0 - smoothstep(0.18, 0.42, uv.y)));

  // Hills with snowy firs, far to near.
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float depth = fk / 2.0;
    float top = hillY(k, xy.x, scale);
    float hill = smoothstep(top - 0.7 * scale, top + 0.7 * scale, xy.y);
    // Moonlit snow: brighter at the crest, cooler and darker with distance.
    float3 snowCol = mix(mix(horizonCol, snow, 0.55), snow * (0.82 - 0.12 * depth), depth * 0.7 + 0.3);
    float below = clamp((xy.y - top) / (60.0 * scale), 0.0, 1.0);
    snowCol *= 1.0 - 0.25 * below;
    // Wind-sculpted drifts: soft ridges catching moonlight from the left.
    float drift = fbm(float2(xy.x / (70.0 * scale), xy.y / (18.0 * scale)) + fk * 4.0);
    float lightSide = fbm(float2((xy.x - 3.0 * scale) / (70.0 * scale), xy.y / (18.0 * scale)) + fk * 4.0) - drift;
    snowCol *= 0.88 + 0.24 * drift + lightSide * 2.6;
    snowCol = mix(snowCol, snowCol * float3(0.86, 0.95, 1.12), 0.6);   // moonlight is blue
    col = mix(col, snowCol, hill);
    float2 f = firs(k, xy, scale);
    float3 firCol = mix(mix(horizonCol, pine, 0.45), pine, depth);
    float3 firSnow = mix(firCol, snowCol * 1.05, 0.75);
    col = mix(col, mix(firCol, firSnow, f.y), f.x);
  }

  // Readability ceiling: keep the snow dark enough for 4.5:1 body text (the moon is exempt).
  float ceilLum = (lumOf(ink) + 0.05) / 4.6 - 0.05;
  if (disc < 0.5 && lumOf(col) > ceilLum) {
    float lo = 0.0, hi = 1.0;
    for (int s = 0; s < 10; s++) { float m = 0.5 * (lo + hi); if (lumOf(col * m) > ceilLum) hi = m; else lo = m; }
    col *= lo;
  }

  // Decorated tree.
  float tier, tt;
  float tc = tree(xy, scale, tier, tt);
  if (tc > 0.0) {
    float side = clamp((treeX(scale) - xy.x) / (70.0 * scale), -1.0, 1.0);   // the moon is to the left
    float3 tcol = pine * (0.85 + 0.35 * (fbm(xy / (3.0 * scale)) - 0.5)) * (1.0 + 0.35 * side);
    tcol *= 0.9 + 0.2 * noise(xy / (1.2 * scale));
    // Snow sits on the outer branch tips, thickest near the top of each tier.
    float cap = smoothstep(0.55, 0.95, tt) * (1.0 - smoothstep(0.1, 0.6, tier))
              * smoothstep(0.35, 0.65, noise(xy / (2.5 * scale)));
    tcol = mix(tcol, snow * (0.75 + 0.2 * side), cap * 0.9);
    col = mix(col, tcol, tc);
    // The lights, unlit; PINE_LIGHTS adds their glow.
    for (int i = 0; i < 24; i++) {
      float3 b = bulb(i, scale);
      float d = length(xy - b.xy) / scale;
      col = mix(col, mix(warm, berry, b.z) * 0.45, 1.0 - smoothstep(1.6, 2.4, d));
    }
  }
  // Five-pointed star on top.
  float2 sp = (xy - float2(treeX(scale), treeBase(scale) - (TREE_H + 3.0) * scale)) / scale;
  float ang = atan(sp.y, sp.x + 1e-6) + 1.5708; // atan(0, 0) is undefined
  float rr = length(sp);
  float arm = 6.2832 / 5.0;
  float a = abs(mod(ang, arm) - arm * 0.5) / (arm * 0.5);   // 0 at a point, 1 between
  float star = 1.0 - smoothstep(-0.6, 0.6, rr - mix(8.0, 3.4, pow(a, 0.8)));
  col = mix(col, warm * 1.2, star);
  col += warm * 0.5 * exp(-rr * rr / 150.0);
  return half4(half3(col), 1.0);
}
`;

export const PINE_LIGHTS = `
uniform float time;
uniform float party;    // seconds into the special-day fireworks; < 0 when off
uniform float3 snow;
uniform float3 warm;
uniform float3 berry;
${SHARED}
float segDist(float2 p, float2 a, float2 b) {
  float2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}
float3 fireworkCol(float h) {
  if (h < 0.2) return float3(1.00, 0.35, 0.35);
  if (h < 0.4) return float3(0.40, 1.00, 0.55);
  if (h < 0.6) return float3(0.45, 0.65, 1.00);
  if (h < 0.8) return float3(1.00, 0.85, 0.40);
  return float3(1.00, 0.50, 0.90);
}

half4 main(float2 xy) {
  float scale = sceneScale();
  float3 add = float3(0.0);
  // Only the sky above the farthest hills (with room for its firs).
  float sky = 1.0 - smoothstep(-34.0 * scale, -24.0 * scale, xy.y - hillY(0, xy.x, scale));

  // Stars twinkle in the sky (not over the moon).
  float2 sc = floor(xy / (16.0 * scale));
  float sh = hash2(sc);
  float2 moon = float2(0.2 * size.x, 0.25 * size.y);
  if (sh < 0.16 && sky > 0.0 && length(xy - moon) > 22.0 * scale) {
    float2 spos = (sc + 0.2 + 0.6 * float2(hash2(sc + 1.3), hash2(sc + 7.1))) * 16.0 * scale;
    float d = length(xy - spos) / scale;
    float tw = 0.55 + 0.45 * sin(time * (1.0 + 2.0 * hash2(sc + 3.0)) + sh * 40.0);
    add += snow * (1.0 - smoothstep(0.3, 1.3, d)) * tw * (0.4 + 0.6 * hash2(sc + 9.0))
         * (1.0 - smoothstep(0.3, 0.62, xy.y / size.y)) * sky;
  }

  // Tree lights blink.
  if (length(xy - float2(treeX(scale), treeBase(scale) - TREE_H * 0.5 * scale)) < TREE_H * 0.65 * scale) {
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float3 b = bulb(i, scale);
      float d = length(xy - b.xy) / scale;
      float3 bc = mix(warm, berry, b.z);
      float on = 0.35 + 0.65 * smoothstep(-0.2, 0.6, sin(time * (0.8 + hash(fi) * 1.4) + fi * 2.3));
      add += bc * 0.65 * (1.0 - smoothstep(1.6, 2.4, d)) * on + bc * 0.3 * exp(-d * d / 22.0) * on;
    }
  }

  // Fireworks on the special days: rockets rise from behind the hills and burst.
  if (party >= 0.0 && sky > 0.0) {
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float tl = party - (fi * 0.6 + 0.3 * hash(fi * 7.3));
      if (tl < 0.0 || tl > 3.4) continue;
      float2 burst = float2((0.15 + 0.7 * hash(fi * 3.7 + 0.2)) * size.x,
                            (0.18 + 0.22 * hash(fi * 5.1 + 0.9)) * size.y);
      float2 launch = float2(burst.x + (hash(fi * 2.9) - 0.5) * 60.0 * scale, size.y * 0.6);
      float rise = 0.9;
      if (tl < rise) {
        // The rocket: a bright head with a fading trail.
        float k = tl / rise;
        float e = 1.0 - (1.0 - k) * (1.0 - k);
        float2 head = mix(launch, burst, e);
        float2 tail = mix(launch, burst, max(e - 0.18, 0.0));
        float d = segDist(xy, tail, head) / scale;
        float along = clamp(dot(xy - tail, head - tail) / max(dot(head - tail, head - tail), 0.001), 0.0, 1.0);
        add += warm * (1.0 - smoothstep(0.4, 1.4, d)) * along * 0.9 * sky;
      } else {
        float tb = tl - rise;
        float2 rel = (xy - burst) / scale;
        float R = 70.0 + 30.0 * hash(fi * 4.4);
        if (length(rel) < R * 1.4 + 40.0) {
          float3 fc = fireworkCol(hash(fi * 9.7 + 0.3));
          float fade = 1.0 - smoothstep(0.6, 2.4, tb);
          add += fc * exp(-dot(rel, rel) / (R * R * 0.6)) * (1.0 - smoothstep(0.0, 0.6, tb)) * 0.35 * sky;
          float ex = 1.0 - exp(-tb * 2.6);
          float tp = max(tb - 0.32, 0.0);
          float exPrev = 1.0 - exp(-tp * 2.6);
          float3 sparkCol = mix(float3(1.0, 0.95, 0.85), fc, smoothstep(0.0, 0.5, tb));
          for (int s = 0; s < 32; s++) {
            float fs = float(s);
            float a = fs / 32.0 * 6.2832 + hash(fi + fs * 0.37) * 0.15;
            float v = R * (0.8 + 0.2 * hash(fi * 3.0 + fs));
            float2 dir = float2(cos(a), sin(a));
            float2 pos = dir * v * ex + float2(0.0, 9.0 * tb * tb);
            float2 prev = dir * v * exPrev + float2(0.0, 9.0 * tp * tp);
            float d = segDist(rel, prev, pos);
            float hd = length(rel - pos);
            float crackle = 0.7 + 0.3 * sin(tb * 30.0 + fs * 2.1);
            add += sparkCol * ((1.0 - smoothstep(0.4, 1.6, d)) * 0.8 + (1.0 - smoothstep(0.8, 2.4, hd)) * 0.9
                               + exp(-hd * hd / 30.0) * 0.25) * fade * crackle * sky;
          }
        }
      }
    }
  }
  // Drawn with the plus blend mode, so this light adds to the scene below.
  return half4(half3(add), 0.0);
}
`;

export const PINE_SNOW = `
uniform float time;
${SHARED}
half4 main(float2 xy) {
  float scale = sceneScale();
  float alpha = 0.0;
  // Falling snow at three depths, swaying a little.
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float rows = 34.0 - fk * 9.0;
    float cell = rows * scale;
    // The fall wraps after 256 rows, and the rows' hashes repeat with it, so
    // the wrap is seamless and sin() in the hash keeps small, precise inputs.
    float2 p = xy;
    p.y -= mod(time * (14.0 + fk * 12.0), rows * 256.0) * scale;
    p.x += sin(time * 0.31 + fk * 2.0 + xy.y / (60.0 * scale)) * 8.0 * scale;
    float2 c = floor(p / cell);
    float2 id = float2(c.x, mod(c.y, 256.0));
    if (hash2(id + fk * 17.0) < 0.22 + fk * 0.08) {
      float2 fp = (c + 0.15 + 0.7 * float2(hash2(id + 3.1 + fk), hash2(id + 8.7 + fk))) * cell;
      float r = (0.7 + fk * 0.7 + hash2(id + 5.5) * 0.6) * scale;
      float a = (1.0 - smoothstep(r * 0.3, r, length(p - fp))) * (0.3 + fk * 0.2);
      alpha = alpha + a * (1.0 - alpha);
    }
  }
  return half4(half3(0.9, 0.94, 0.97) * alpha, alpha);
}
`;

/** Seconds of special-day fireworks (the last rocket has faded by then). */
export const PINE_FIREWORKS_SECONDS = 7;
