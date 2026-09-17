/** Meadow-only sky: continuous wind, ivory clouds and a sun/full moon.
 * Three noise octaves keep the full-canvas pass bounded on mobile GPUs.
 */
export const MEADOW_SKY_SHADER = `
uniform float2 size;
uniform float time;
uniform float night;
uniform float crescent;
uniform float3 sky;
uniform float3 cloud;
uniform float3 light;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), f.x),
             mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), f.x), f.y);
}
float mist(float2 p) {
  return noise(p) * 0.58 + noise(p * 2.03 + 7.1) * 0.28
       + noise(p * 4.01 + 19.7) * 0.14;
}
half4 main(float2 xy) {
  float2 uv = xy / size;
  float shortSide = min(size.x, size.y);
  float2 p = xy / shortSide;
  float3 color = sky * mix(0.94, 1.06, uv.y);

  // Keep the celestial body inside the upper-right of every container.
  float radius = shortSide * 0.088;
  float2 center = float2(size.x - radius * 2.1, max(radius * 1.8, size.y * 0.17));
  float2 moon = (xy - center) / radius;
  float distance = length(moon);
  float halo = exp(-distance * distance * 0.45);
  color = mix(color, light, halo * mix(0.32, 0.035, night));
  if (distance < 1.03) {
    float z = sqrt(max(0.0, 1.0 - dot(moon, moon)));
    float relief = mist(moon * 4.5 + 12.0);
    float shading = 0.70 + 0.30 * max(0.0, dot(float3(moon, z), normalize(float3(-0.4, -0.5, 1.0))));
    float3 lunar = light * 0.80 * shading * (0.74 + relief * 0.30);
    float3 solar = mix(light, float3(1.0, 0.98, 0.87), z * 0.65);
    float disc = 1.0 - smoothstep(0.975, 1.025, distance);
    float cutout = smoothstep(0.84, 0.88, length(moon - float2(0.42, -0.3)));
    disc *= mix(1.0, cutout, crescent * night);
    color = mix(color, mix(solar, lunar, night), disc);
  }

  if (night > 0.5) {
    float2 grid = xy / (shortSide * 0.065);
    float2 cell = floor(grid);
    float seed = hash(cell + 41.0);
    float2 starCenter = float2(hash(cell + 13.0), hash(cell + 71.0)) * 0.6 + 0.2;
    float star = (1.0 - smoothstep(0.008, 0.043, length(fract(grid) - starCenter)))
               * step(0.91, seed) * (0.2 + seed * 0.35);
    color = mix(color, light, star * smoothstep(1.05, 1.2, distance));
  }

  // Unbounded elapsed seconds: no reverse and no visible loop seam.
  float2 wind = float2(-time * 2.0 / 75.0, 0.0);
  float density = mist(p * float2(2.0, 3.8) + wind + float2(2.7, 0.3));
  // Cloud banks frame the view, leaving an open center for journal content.
  float edges = smoothstep(0.27, 0.51, abs(uv.x - 0.5));
  float top = 1.0 - smoothstep(0.0, 0.3, uv.y);
  float bank = smoothstep(0.48, 0.74, density + edges * 0.10 + top * 0.08);
  color = mix(color, cloud, bank * mix(0.78, 0.32, night));
  float grain = (hash(xy) - 0.5) * mix(0.014, 0.009, night);
  return half4(clamp(color + grain, 0.0, 1.0), 1.0);
}
`;
