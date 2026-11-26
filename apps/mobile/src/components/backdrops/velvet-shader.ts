/**
 * Velvet: burgundy velvet drapes with coloured fairy-light garlands and glass
 * baubles, and a mantel with a bracket clock and two champagne flutes.
 * VELVET_SCENE is detailed (folds, pile, baubles, clock case), so it is drawn
 * once into a texture. Cheap layers animate on top: VELVET_LIGHTS (blinking
 * bulbs, added with `plus`), VELVET_CLOCK (hands at the real local time, the
 * pendulum, rising bubbles) and VELVET_CONFETTI (the special-day celebration).
 */
const SHARED = `
uniform float2 size;

float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float sceneScale() { return min(size.x / 390.0, size.y / 700.0); }

// Fairy-light and bauble colours: red, green, blue, warm yellow, magenta, orange.
float3 lightCol(float h) {
  if (h < 0.17) return float3(0.95, 0.22, 0.24);
  if (h < 0.34) return float3(0.25, 0.85, 0.40);
  if (h < 0.51) return float3(0.30, 0.55, 1.00);
  if (h < 0.68) return float3(1.00, 0.82, 0.35);
  if (h < 0.84) return float3(0.92, 0.38, 0.82);
  return float3(1.00, 0.55, 0.22);
}

float segDist(float2 p, float2 a, float2 b) {
  float2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}

// Garland k: a string sagging in uneven swags across the top, as y(x) in points.
float garlandY(int k, float x, float scale) {
  float fk = float(k);
  float span = size.x / (1.5 + fk);
  float u = fract(x / span + fk * 0.37);
  return size.y * (0.17 + fk * 0.085) + (34.0 + fk * 8.0) * scale * 4.0 * u * (1.0 - u);
}

// The mantel and what stands on it. The clock sits at the left edge of the home
// action dock (about 104 pt wide, and it collapses on scroll); reading text
// sits on the left, so a little overlap is fine.
float shelfY(float scale) { return size.y - 64.0 * scale; }
float clockX(float scale) { return size.x - 132.0 * scale; }
float caseTopY(float scale) { return shelfY(scale) - 150.0 * scale; }
float2 dialCentre(float scale) { return float2(clockX(scale), caseTopY(scale) + 20.0 * scale); }
float fluteX(int i, float scale) { return clockX(scale) - (118.0 - float(i) * 30.0) * scale; }
// Flute i in its own frame: x across (leaning toward the other), y up from the shelf.
float2 fluteFrame(int i, float2 xy, float scale) {
  float2 q = (xy - float2(fluteX(i, scale), shelfY(scale))) / scale;
  q.x -= (float(i) * 2.0 - 1.0) * q.y * 0.06;
  return q;
}
const float BOWL_TOP = -112.0;
const float BOWL_BOTTOM = -50.0;
float bowlHalfWidth(float y) {
  float tb = clamp((y - BOWL_TOP) / (BOWL_BOTTOM - BOWL_TOP), 0.0, 1.0);
  return 9.5 * (1.0 - tb * tb * tb) + 1.2;
}
`;

export const VELVET_SCENE = `
uniform float3 wine;    // shadowed velvet
uniform float3 rose;    // velvet sheen
uniform float3 gold;    // wire, trims, brass
uniform float3 glow;    // warm light from the bulbs
${SHARED}
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + float2(1, 0)), f.x),
             mix(hash2(i + float2(0, 1)), hash2(i + float2(1, 1)), f.x), f.y);
}
float fbm(float2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

// Height of the hanging cloth: vertical folds that loosen toward the hem.
float drape(float2 p, float scale) {
  float x = p.x / scale, y = p.y / scale;
  float wob = 18.0 * sin(y * 0.006 + x * 0.004);
  float h = sin((x + wob) * 0.045);
  h += sin((x - wob * 0.6) * 0.083 + 1.7) * 0.45;
  h += sin((x + wob * 1.3) * 0.15 + y * 0.004 + 0.4) * 0.18;
  return h;
}

half4 main(float2 xy) {
  float scale = sceneScale();
  float2 uv = xy / size;

  // Velvet folds, lit from the upper left.
  float e = 1.5 * scale;
  float h = drape(xy, scale);
  float hx = (drape(xy + float2(e, 0.0), scale) - drape(xy - float2(e, 0.0), scale)) / (2.0 * e / scale);
  float3 n = normalize(float3(-hx * 5.5, 0.0, 1.0));
  float diff = max(dot(n, normalize(float3(-0.45, -0.3, 0.85))), 0.0);
  // Velvet glows at grazing angles: sheen on the flanks of each fold.
  float sheen = smoothstep(0.05, 0.5, 1.0 - n.z) * (0.35 + 0.65 * smoothstep(-0.2, 0.4, -n.x));
  float pile = 0.93 + 0.14 * fbm(xy / (1.2 * scale));   // fine nap
  float valley = smoothstep(-1.4, 1.2, h);               // deep folds stay dark
  float3 col = wine * (0.35 + 0.95 * diff) * (0.55 + 0.45 * valley) * pile;
  col += rose * sheen * 0.42 * pile * (0.6 + 0.4 * valley);
  // Soft light from the garlands above, falling off downwards.
  col += glow * 0.06 * (1.0 - smoothstep(0.12, 0.55, uv.y));
  float2 vig = (uv - float2(0.5, 0.45)) * float2(1.1, 0.9);
  col *= 1.0 - 0.35 * dot(vig, vig);

  // Distant gold bokeh behind the garlands.
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float2 c = float2(hash(fi * 3.1) * size.x, (0.1 + 0.4 * hash(fi * 7.7)) * size.y);
    float d = length(xy - c) / ((10.0 + 16.0 * hash(fi * 1.3)) * scale);
    col += gold * 0.05 * (1.0 - smoothstep(0.8, 1.0, d));
  }

  // Garland wires, with the bulbs unlit; VELVET_LIGHTS adds their glow.
  float pitch = 15.0 * scale;
  for (int k = 0; k < 3; k++) {
    float gy = garlandY(k, xy.x, scale);
    float slope = (garlandY(k, xy.x + 1.0, scale) - garlandY(k, xy.x - 1.0, scale)) * 0.5;
    float dist = abs(xy.y - gy) / sqrt(1.0 + slope * slope);
    col = mix(col, gold * 0.45, (1.0 - smoothstep(0.35 * scale, 0.9 * scale, dist)) * 0.9);
    float bi = floor(xy.x / pitch + 0.5);
    float d = length(xy - float2(bi * pitch, garlandY(k, bi * pitch, scale) + 2.5 * scale)) / scale;
    float3 bc = lightCol(hash(bi * 1.7 + float(k) * 23.0 + 9.0));
    col = mix(col, bc * 0.45, 1.0 - smoothstep(1.3, 2.1, d));
  }

  // Glass baubles on threads, hanging from the garlands.
  float3 key = normalize(float3(-0.5, -0.6, 0.6));
  for (int k = 0; k < 3; k++) {
    for (int j = 0; j < 4; j++) {
      float id = float(k * 4 + j);
      float bx = (0.08 + 0.84 * (float(j) + hash(id * 5.1)) / 4.0) * size.x;
      float top = garlandY(k, bx, scale);
      float r = (8.0 + 5.0 * hash(id * 8.7)) * scale;
      float2 c = float2(bx, top + (18.0 + 70.0 * hash(id * 2.3)) * scale + r);
      if (xy.y > top && xy.y < c.y - r)
        col = mix(col, gold * 0.5, (1.0 - smoothstep(0.2 * scale, 0.7 * scale, abs(xy.x - bx))) * 0.8);
      float2 q = (xy - (c - float2(0.0, r))) / scale;
      if (abs(q.x) < 2.6 && q.y > -2.5 && q.y < 1.0) col = mix(col, gold * (0.7 + 0.3 * step(0.0, -q.x)), 0.95);
      float d = length(xy - c) / r;
      if (d < 1.0) {
        float3 nn = float3((xy - c) / r, sqrt(max(1.0 - d * d, 0.0)));
        float3 ball = lightCol(hash(id * 3.9 + 0.5)) * (0.18 + 0.55 * max(dot(nn, key), 0.0))
                    + glow * 0.25 * pow(1.0 - nn.z, 3.0);
        ball += float3(0.9) * pow(max(dot(reflect(float3(0.0, 0.0, -1.0), nn), key), 0.0), 40.0);
        col = mix(col, ball, 1.0 - smoothstep(0.92, 1.0, d));
      }
    }
  }

  // Gold glitter caught in the pile toward the hem.
  float2 gc = floor(xy / (5.0 * scale));
  if (hash2(gc) > 0.93) {
    float gd = length(xy - (gc + 0.5) * 5.0 * scale) / scale;
    col += gold * (1.0 - smoothstep(0.2, 0.9, gd)) * smoothstep(0.55, 1.0, uv.y) * 0.5 * hash2(gc + 2.0);
  }

  // Mantel shelf along the bottom, darkening the velvet just above it.
  float shelf = shelfY(scale);
  float3 wood = float3(0.16, 0.07, 0.05);
  if (xy.y > shelf - 26.0 * scale && xy.y < shelf) col *= 1.0 - 0.35 * smoothstep(shelf - 26.0 * scale, shelf, xy.y);
  if (xy.y >= shelf) {
    float3 m = wood * (0.7 + 0.5 * fbm(float2(xy.x / (40.0 * scale), xy.y / (2.0 * scale))));
    if (xy.y < shelf + 12.0 * scale) m *= 1.35;   // the lip catches the light
    else m *= 0.75 - 0.25 * smoothstep(shelf + 12.0 * scale, size.y, xy.y);
    m = mix(m, gold * 0.85, 1.0 - smoothstep(0.6 * scale, 1.4 * scale, abs(xy.y - shelf - 0.8 * scale)));
    m = mix(m, gold * 0.55, 1.0 - smoothstep(0.4 * scale, 1.0 * scale, abs(xy.y - shelf - 12.5 * scale)));
    col = m;
  }

  // Two champagne flutes, leaning toward each other.
  for (int i = 0; i < 2; i++) {
    float2 q = fluteFrame(i, xy, scale);
    float hw = bowlHalfWidth(q.y);
    float tb = clamp((q.y - BOWL_TOP) / (BOWL_BOTTOM - BOWL_TOP), 0.0, 1.0);
    if (q.y > BOWL_TOP && q.y < BOWL_BOTTOM && abs(q.x) < hw) {
      float liquid = step(BOWL_TOP + 14.0, q.y);
      float3 g = mix(col * 1.25 + 0.04, gold * (0.85 + 0.3 * (1.0 - tb)), liquid * 0.85);
      g = mix(g, float3(0.95, 0.9, 0.85), (1.0 - smoothstep(0.3, 1.1, hw - abs(q.x))) * 0.55);   // glass edges
      g += float3(0.18) * (1.0 - smoothstep(0.0, 1.2, abs(q.x + hw * 0.45))) * (1.0 - tb);
      col = g;
    } else if ((q.y > BOWL_BOTTOM && q.y < -3.0 && abs(q.x) < 1.1)
               || length(float2(q.x / 11.0, (q.y + 1.5) / 2.0)) < 1.0) {
      col = mix(col, float3(0.85, 0.82, 0.8), 0.55);   // stem and foot
    }
  }

  // Bracket clock: an arched wooden case with gilt trim.
  float caseW = 56.0 * scale;
  float2 cq = xy - float2(clockX(scale), caseTopY(scale));
  float body = max(abs(cq.x) - caseW, max(-cq.y, cq.y - 150.0 * scale));
  float caseD = min(body, max(length(cq) - caseW, cq.y));   // body plus arched top
  caseD = min(caseD, max(abs(abs(cq.x) - caseW + 10.0 * scale) - 7.0 * scale, abs(cq.y - 146.0 * scale) - 4.0 * scale));   // feet
  float shadowD = min(max(abs(cq.x - 7.0 * scale) - caseW, max(-cq.y, cq.y - 150.0 * scale)),
                      length(cq - float2(7.0, 4.0) * scale) - caseW);
  if (caseD > 0.0 && xy.y < shelf) col *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 14.0 * scale, shadowD));
  if (caseD < 0.6 * scale) {
    float side = clamp(-cq.x / caseW, -1.0, 1.0);
    float3 c = wood * (0.85 + 0.35 * side) * (0.85 + 0.3 * fbm(float2(xy.x / (3.0 * scale), xy.y / (30.0 * scale))));
    c = mix(c, gold * (0.7 + 0.3 * side), 1.0 - smoothstep(0.8 * scale, 1.8 * scale, abs(caseD + 5.0 * scale)));
    c = mix(c, gold * 0.8, 1.0 - smoothstep(0.5 * scale, 1.5 * scale, -caseD));
    // The pendulum window's gilt frame; VELVET_CLOCK draws inside it.
    float2 wq = cq - float2(0.0, 112.0 * scale);
    float win = max(abs(wq.x) - 26.0 * scale, abs(wq.y) - 26.0 * scale);
    c = mix(c, gold * 0.75, 1.0 - smoothstep(0.6 * scale, 1.4 * scale, abs(win)));
    col = mix(col, c, 1.0 - smoothstep(-0.6 * scale, 0.6 * scale, caseD));
  }

  // The dial: dark enamel (it keeps body text readable), gilt ticks, brass bezel.
  float R = 42.0 * scale;
  float2 cp = (xy - dialCentre(scale)) / R;
  float rr = length(cp);
  if (rr < 1.02) {
    float ang = atan(cp.x, 1e-6 - cp.y); // 0 at twelve o'clock, clockwise; never atan(0, 0)
    float3 face = mix(float3(0.11, 0.045, 0.06), float3(0.06, 0.025, 0.035), rr);
    float a60 = abs(fract(ang / 6.2832 * 60.0 + 0.5) - 0.5) * (6.2832 / 60.0) * rr * R / scale;
    float a12 = abs(fract(ang / 6.2832 * 12.0 + 0.5) - 0.5) * (6.2832 / 12.0) * rr * R / scale;
    float ticks = (1.0 - smoothstep(0.3, 0.7, a60)) * step(0.78, rr) * step(rr, 0.85);
    float bars = (1.0 - smoothstep(1.0, 1.6, a12)) * step(0.64, rr) * step(rr, 0.85);
    face = mix(face, gold * 1.05, max(ticks * 0.8, bars));
    face += float3(0.06) * (1.0 - smoothstep(0.0, 0.25, abs(cp.x + cp.y + 0.6))) * step(rr, 0.88);   // glass glare
    float rl = 0.55 + 0.45 * dot(normalize(cp + 0.0001), normalize(float2(-0.6, -0.8)));
    face = mix(face, gold * (0.45 + 0.75 * rl) * (0.85 + 0.15 * cos(ang * 40.0)), smoothstep(0.87, 0.9, rr));
    col = mix(col, face, 1.0 - smoothstep(1.0, 1.02, rr));
  }

  col += (hash2(xy) - 0.5) * 0.012;   // film grain against banding
  return half4(half3(col), 1.0);
}
`;

export const VELVET_LIGHTS = `
uniform float time;
${SHARED}
half4 main(float2 xy) {
  float scale = sceneScale();
  float pitch = 15.0 * scale;
  float3 add = float3(0.0);
  float bi = floor(xy.x / pitch + 0.5);
  for (int k = 0; k < 3; k++) {
    float d = length(xy - float2(bi * pitch, garlandY(k, bi * pitch, scale) + 2.5 * scale)) / scale;
    if (d > 12.0) continue;
    float seed = bi * 1.7 + float(k) * 23.0;
    float on = 0.25 + 0.75 * smoothstep(-0.3, 0.8, sin(time * (0.6 + hash(seed) * 1.6) + hash(seed + 4.0) * 6.28));
    float3 bc = lightCol(hash(seed + 9.0));
    add += bc * (0.2 + 0.65 * on) * (1.0 - smoothstep(1.3, 2.1, d)) + bc * 0.45 * on * exp(-d * d / 26.0);
  }
  // Drawn with the plus blend mode, so this light adds to the scene below.
  return half4(half3(add), 0.0);
}
`;

export const VELVET_CLOCK = `
uniform float time;
uniform float3 clock;   // local hours, minutes, seconds; seconds < 0 hides the second hand
uniform float3 wine;
uniform float3 gold;
${SHARED}
half4 main(float2 xy) {
  float scale = sceneScale();
  float R = 42.0 * scale;

  // The pendulum swings behind the window (opaque: it repaints the window).
  float2 wq = xy - float2(clockX(scale), caseTopY(scale) + 112.0 * scale);
  if (max(abs(wq.x), abs(wq.y)) < 25.4 * scale) {
    float3 c = float3(0.05, 0.02, 0.03) + wine * 0.15;
    float swing = 0.22 * sin(time * 3.1416);
    float2 pr = wq - float2(0.0, -40.0 * scale);
    pr = float2(pr.x * cos(swing) + pr.y * sin(swing), -pr.x * sin(swing) + pr.y * cos(swing));
    float rod = (1.0 - smoothstep(0.6 * scale, 1.2 * scale, abs(pr.x))) * step(0.0, pr.y) * step(pr.y, 52.0 * scale);
    float bob = 1.0 - smoothstep(8.0 * scale, 9.0 * scale, length(pr - float2(0.0, 56.0 * scale)));
    c = mix(c, gold * 0.9, max(rod, bob));
    c += float3(0.1) * bob * (1.0 - smoothstep(-8.0 * scale, 0.0, pr.x));
    return half4(half3(c), 1.0);
  }

  // Hands at the real local time.
  float2 cp = (xy - dialCentre(scale)) / R;
  if (length(cp) < 0.9) {
    float hA = (mod(clock.x, 12.0) + clock.y / 60.0) / 12.0 * 6.2832;
    float mA = (clock.y + max(clock.z, 0.0) / 60.0) / 60.0 * 6.2832;
    float2 hp = float2(sin(hA), -cos(hA));
    float2 mp = float2(sin(mA), -cos(mA));
    float px = R / scale;   // points per dial unit
    float hand = max(1.0 - smoothstep(1.8, 2.5, segDist(cp, -hp * 0.08, hp * 0.46) * px),
                     1.0 - smoothstep(1.1, 1.7, segDist(cp, -mp * 0.1, mp * 0.7) * px));
    float2 sc = cp - float2(0.03, 0.05);
    float shade = (1.0 - smoothstep(1.0, 3.0, min(segDist(sc, -hp * 0.08, hp * 0.46),
                                                   segDist(sc, -mp * 0.1, mp * 0.7)) * px)) * 0.5;
    float3 c = gold * 1.05;
    float a = hand;
    if (clock.z >= 0.0) {
      float sA = clock.z / 60.0 * 6.2832;
      float2 sp = float2(sin(sA), -cos(sA));
      float second = 1.0 - smoothstep(0.35, 0.9, segDist(cp, -sp * 0.16, sp * 0.78) * px);
      c = mix(c, lightCol(0.05) * 0.8, second * (1.0 - hand));
      a = max(a, second);
    }
    float hub = 1.0 - smoothstep(2.0, 2.8, length(cp) * px);
    c = mix(c, gold * 0.8, hub);
    a = max(a, hub);
    // Premultiplied: the hands over a soft shadow.
    return half4(half3(c * a), a + shade * (1.0 - a));
  }

  // Bubbles rise in the champagne.
  for (int i = 0; i < 2; i++) {
    float2 q = fluteFrame(i, xy, scale);
    if (q.y > BOWL_TOP + 14.0 && q.y < BOWL_BOTTOM && abs(q.x) < bowlHalfWidth(q.y) - 1.0) {
      // The rise wraps after 64 cells, and their hashes repeat with it.
      float2 bc = float2(q.x, q.y + mod(time * 9.0, 2.6 * 64.0));
      float2 id = floor(bc / 2.6);
      float on = step(0.86, hash2(float2(id.x, mod(id.y, 64.0)) + float(i) * 7.0));
      float a = on * (1.0 - smoothstep(0.12, 0.3, length(fract(bc / 2.6) - 0.5))) * 0.5;
      return half4(half3(1.0, 0.95, 0.8) * a, a);
    }
  }
  return half4(0.0);
}
`;

export const VELVET_CONFETTI = `
uniform float party;    // seconds into the special-day confetti; < 0 when off
uniform float3 gold;
${SHARED}
half4 main(float2 xy) {
  if (party < 0.0) return half4(0.0);
  float scale = sceneScale();
  // Three depths of tumbling paper, released for three seconds from above the screen.
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float cell = (26.0 - fk * 6.0) * scale;
    float fall = (110.0 + fk * 45.0) * scale;
    float2 p = float2(xy.x, xy.y - party * fall);
    float2 ci = floor(p / cell);
    float h = hash2(ci + fk * 11.0);
    if (h < 0.14 && p.y < 0.0 && p.y > -3.0 * fall) {
      float2 fp = (ci + 0.2 + 0.6 * float2(hash2(ci + 2.0), hash2(ci + 5.0))) * cell;
      float rot = party * (2.0 + 3.0 * hash2(ci + 7.0)) + h * 20.0;
      float2 q = p - fp;
      q = float2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
      float flip = abs(cos(party * 4.0 + h * 9.0));
      float2 half_size = float2(3.2 * flip + 0.4, 1.6) * scale * (0.8 + fk * 0.25);
      if (abs(q.x) < half_size.x && abs(q.y) < half_size.y) {
        float3 c = hash2(ci + 3.0) < 0.3 ? gold * 1.2 : lightCol(hash2(ci + 9.0));
        return half4(half3(c * (0.6 + 0.5 * flip)), 1.0);
      }
    }
  }
  return half4(0.0);
}
`;

/** Seconds the confetti needs to clear a phone screen at the slowest fall speed. */
export const VELVET_CONFETTI_SECONDS = 11;

/**
 * The part of the screen VELVET_CLOCK draws on (the flutes and the clock), in
 * points; mirrors clockX, caseTopY and fluteX in the shader.
 */
export function velvetClockRegion(width: number, height: number) {
  const scale = Math.min(width / 390, height / 700);
  const clockX = width - 132 * scale;
  const shelf = height - 64 * scale;
  const x = Math.max(0, Math.floor(clockX - 134 * scale));
  const y = Math.max(0, Math.floor(shelf - 176 * scale));
  return {
    x,
    y,
    width: Math.min(width, Math.ceil(clockX + 46 * scale)) - x,
    height: Math.ceil(shelf) - y,
  };
}
