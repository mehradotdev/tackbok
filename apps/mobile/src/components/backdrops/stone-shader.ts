/** Static masonry pass: projecting coping stones, recessed mortar and fine grain. */
export const STONE_SHADER = `
uniform float2 size;
uniform float wallY;
uniform float cap;
uniform float3 stone;
uniform float3 mortar;
uniform float3 highlight;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1,0)), f.x),
             mix(hash(i + float2(0,1)), hash(i + float2(1,1)), f.x), f.y);
}
half4 main(float2 xy) {
  float scale = min(size.x, size.y);
  float edge = wallY + sin(xy.x / scale * 8.0) * scale * 0.004;
  float y = xy.y - edge;
  if (y < 0.0) return half4(0.0);
  float blockW = scale * 0.22;
  float rowH = scale * 0.12;
  float row = floor(max(0.0, y - cap) / rowH);
  float x = xy.x + mod(row, 2.0) * blockW * 0.5;
  float2 cell = float2(floor(x / blockW), row);
  float2 local = float2(mod(x, blockW), mod(max(0.0, y-cap), rowH));
  float seam = min(min(local.x, blockW-local.x), min(local.y, rowH-local.y));
  float rough = noise(xy * 0.11) * scale * 0.004;
  float inside = smoothstep(scale * 0.003, scale * 0.009, seam + rough);
  float variation = hash(cell) * 0.16 - 0.08;
  float mineral = noise(xy * 0.075) * 0.06 + (hash(xy) - 0.5) * 0.045;
  float3 face = stone * (0.91 + variation + mineral);
  float bevel = (1.0 - smoothstep(0.0, scale * 0.018, local.y)) * 0.22;
  face = mix(face, highlight, bevel);
  float3 color = mix(mortar, face, inside);
  // The broad lit top and its narrow dark underside make this a ledge, not a grid.
  if (y < cap) {
    float capJoint = smoothstep(scale * 0.002, scale * 0.007,
      min(mod(xy.x, blockW * 1.35), blockW * 1.35 - mod(xy.x, blockW * 1.35)));
    float3 top = mix(highlight, stone, smoothstep(0.0, cap, y) * 0.38);
    color = mix(mortar, top + mineral * 0.4, capJoint);
    color = mix(highlight, color, smoothstep(0.0, scale * 0.004, y));
  } else {
    color *= 0.72 + 0.28 * smoothstep(cap, cap + scale * 0.025, y);
  }
  return half4(color, 1.0);
}
`;
