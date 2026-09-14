import { SKY_SHADER } from './sky-shader';

// Camino keeps the shared sky's cloud drift, with enough cloud/star contrast to
// remain visible through its full-scene readability wash. Other skies are unchanged.
export const CAMINO_SKY_SHADER = SKY_SHADER.replace(
  'uniform float crescent;',
  'uniform float crescent;\nuniform float shimmer;',
)
  .replace(
    'float3 color = sky * mix(0.94, 1.06, uv.y);',
    `float3 daylight = mix(sky, float3(0.58, 0.73, 0.85), 0.48);
  float3 color = mix(daylight, sky, night) * mix(0.94, 1.06, uv.y);`,
  )
  .replace(
    'step(0.91, seed) * (0.2 + seed * 0.35)',
    'step(0.85, seed) * (0.65 + seed * 0.35)',
  )
  .replace('smoothstep(0.008, 0.043,', 'smoothstep(0.012, 0.055,')
  .replace(
    'star * smoothstep',
    'star * (0.78 + 0.22 * sin(shimmer * 6.28318 + seed * 37.0)) * smoothstep',
  )
  .replace(
    'color = mix(color, cloud, bank * mix(0.72, 0.24, night));',
    `float3 cloudColor = mix(cloud, mix(cloud, light, 0.46), night);
  color = mix(color, cloudColor, bank * mix(0.88, 0.70, night));`,
  );
