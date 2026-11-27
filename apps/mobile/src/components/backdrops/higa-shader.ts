/**
 * Higa: soft neon blobs of grape, magenta, indigo, orchid, blue and pink
 * drifting slowly behind frosted glass. The blobs keep to the right and the
 * foot of the screen, where the journal text is thinnest. Everything moves,
 * so HIGA_SCENE runs per frame; it is cheap (six blobs and two noise lookups).
 *
 * `ceilRatio` is the body-text contrast the scene keeps against `ink`
 * (1 turns it off). Each loop period divides the forward clock's 6 h wrap.
 */
export const HIGA_SCENE = `
uniform float2 size;
uniform float time;
uniform float3 bg;
uniform float3 ink;
uniform float ceilRatio;

float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + float2(1, 0)), f.x),
             mix(hash2(i + float2(0, 1)), hash2(i + float2(1, 1)), f.x), f.y);
}
float3 toLinear(float3 c) {
  return mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, float3(2.4)), step(0.04045, c));
}
float3 toSrgb(float3 l) {
  return mix(l * 12.92, 1.055 * pow(max(l, 0.0), float3(1.0 / 2.4)) - 0.055, step(0.0031308, l));
}
float luma(float3 l) { return dot(l, float3(0.2126, 0.7152, 0.0722)); }

float3 blobColor(int i) {
  if (i == 0) return float3(0.62, 0.22, 0.95);  // grape
  if (i == 1) return float3(0.95, 0.20, 0.62);  // magenta
  if (i == 2) return float3(0.36, 0.25, 0.98);  // indigo
  if (i == 3) return float3(0.80, 0.30, 1.00);  // orchid
  if (i == 4) return float3(0.20, 0.55, 0.98);  // blue
  return float3(0.86, 0.30, 0.70);              // pink
}
// Lissajous drift: base point, reach (pt at 390 pt wide) and x/y periods (s).
float2 blobCenter(int i, float s, float t) {
  float W = size.x, H = size.y;
  float2 base; float2 reach; float2 period;
  if (i == 0) { base = float2(W - 80.0 * s, H * 0.33); reach = float2(26.0, 41.0); period = float2(18.0, 30.0); }
  else if (i == 1) { base = float2(W - 25.0 * s, H * 0.50); reach = float2(19.0, 45.0); period = float2(24.0, 20.0); }
  else if (i == 2) { base = float2(W - 120.0 * s, H * 0.74); reach = float2(41.0, 30.0); period = float2(32.0, 24.0); }
  else if (i == 3) { base = float2(W - 30.0 * s, H * 0.14); reach = float2(22.0, 22.0); period = float2(20.0, 16.0); }
  else if (i == 4) { base = float2(W * 0.30, H * 0.95); reach = float2(45.0, 15.0); period = float2(40.0, 27.0); }
  else { base = float2(W - 45.0 * s, H * 0.90); reach = float2(30.0, 22.0); period = float2(30.0, 36.0); }
  float fi = float(i);
  float2 phase = t * 6.2831853 / period + float2(fi * 1.7, fi * 2.3);
  return base + reach * s * float2(sin(phase.x), cos(phase.y));
}
// Similar sizes, so every blob fades out over the same distance.
float blobRadius(int i) {
  if (i == 0) return 100.0;
  if (i == 1) return 96.0;
  if (i == 2) return 106.0;
  if (i == 3) return 92.0;
  return 98.0;
}

half4 main(float2 xy) {
  float s = min(size.x / 390.0, size.y / 700.0);
  float2 uv = xy / size;
  float3 col = bg * (0.92 + 0.22 * smoothstep(0.2, 1.3, uv.x * 0.6 + uv.y * 0.7));

  // A slow wobble (one 120 s circle through the noise) so the blobs read as
  // soft, organic shapes, not discs.
  float wa = time * 6.2831853 / 120.0;
  float2 wp = xy / (70.0 * s) + 0.6 * float2(cos(wa), sin(wa));
  float2 p = xy + (float2(noise(wp), noise(wp + 5.2)) - 0.5) * 24.0 * s;

  // Metaball field and its colour mix.
  float f = 0.0;
  float3 acc = float3(0.0);
  for (int i = 0; i < 6; i++) {
    float2 d = p - blobCenter(i, s, time);
    float r = blobRadius(i) * s;
    float k = r * r / (dot(d, d) + r * r);
    f += k;
    acc += blobColor(i) * k * k;
  }
  float3 tint = acc / max(f, 1e-4);
  tint /= max(max(tint.r, max(tint.g, tint.b)), 1e-4);

  // Frosted glass: one wide ramp per blob with no hard edge, a faint milky
  // veil and a fine, still grain.
  col = mix(col, mix(bg, tint, 0.85), 0.9 * smoothstep(0.05, 1.9, f));
  col = mix(col, float3(0.86, 0.80, 0.95), 0.035);
  col += (hash2(floor(xy * 1.5)) - 0.5) * 0.022;

  // Readability ceiling with a soft knee: above half the allowed luminance,
  // roll off smoothly toward it, so a bright blob never flattens into a
  // plateau with a visible rim. Scaling in linear RGB keeps the hue.
  if (ceilRatio > 1.01) {
    float ceilLum = (luma(toLinear(ink)) + 0.05) / ceilRatio - 0.05;
    float3 lin = toLinear(col);
    float L = luma(lin);
    float knee = 0.5 * ceilLum;
    if (L > knee) {
      float room = ceilLum - knee;
      lin *= (knee + room * (1.0 - exp(-(L - knee) / room))) / L;
      col = toSrgb(lin);
    }
  }
  col += (hash2(xy) - 0.5) * 0.012;
  return half4(half3(col), 1.0);
}
`;
