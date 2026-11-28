// Render the Erika, Denise, Giuseppe, Kristen, Higa and Bea shader scenes at
// phone/iPad/landscape/picker sizes and check body-text contrast against every
// background pixel. Erika, Denise, Higa and Bea must stay at or above 4.5:1
// (Bea outside beaLanternBox, whose glass glows on purpose) and Kristen at its
// KRISTEN_CONTRAST floor;
// Giuseppe (lit cairn and sun glow, about 2:1 and 3:1) is reported only,
// because the owner kept it as is (2026-11-26). It also checks that Kristen's
// hiker and hawk stay inside the strip their overlay is clipped to, and that
// each Denise layer stays inside the box the canvas draws it in.
const fs = require('fs'),
  path = require('path'),
  Module = require('module');
const root = path.resolve(__dirname, '../../../..');
const ts = require(root + '/node_modules/typescript');
const React = require(root + '/node_modules/react');
let headless, Skia;
const load = Module._load;
Module._load = function (id, parent, main) {
  if (id === 'react-native-skia') return { ...headless, Skia };
  return load.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx'])
  Module._extensions[ext] = (m, file) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
      }).outputText,
      file,
    );
(async () => {
  global.CanvasKit = await require(
    root + '/node_modules/canvaskit-wasm/bin/full/canvaskit.js',
  )({ locateFile: (f) => root + '/node_modules/canvaskit-wasm/bin/full/' + f });
  headless = require(root + '/node_modules/react-native-skia/lib/commonjs/headless');
  Skia = headless.getSkiaExports().Skia;
  const backdrops = root + '/apps/mobile/src/components/backdrops/';
  const shaders = {
    ...require(backdrops + 'erika-shader.ts'),
    ...require(backdrops + 'denise-shader.ts'),
    ...require(backdrops + 'giuseppe-shader.ts'),
    ...require(backdrops + 'kristen-shader.ts'),
    ...require(backdrops + 'higa-shader.ts'),
    ...require(backdrops + 'bea-shader.ts'),
  };
  const {
    THEME_DEFINITIONS,
    ERIKA_PALETTE,
    DENISE_TEXT_CONTRAST,
    GIUSEPPE_PALETTE,
    KRISTEN_PALETTE,
    KRISTEN_CONTRAST,
    HIGA_TEXT_CONTRAST,
    BEA_TEXT_CONTRAST,
  } = require(root + '/apps/mobile/src/lib/theme/theme-tokens.ts');
  const fx = {};
  for (const name of [
    'ERIKA_SCENE',
    'ERIKA_MIST',
    'DENISE_ROOM',
    'DENISE_FIGURE',
    'DENISE_HEAD',
    'DENISE_AIR',
    'DENISE_STEAM',
    'GIUSEPPE_LAKE',
    'GIUSEPPE_BOKEH',
    'GIUSEPPE_CAIRN',
    'KRISTEN_SCENE',
    'KRISTEN_MIST',
    'KRISTEN_LIFE',
    'HIGA_SCENE',
    'BEA_SCENE',
    'BEA_MIST',
    'BEA_LIGHT',
    'BEA_LANTERN',
  ]) {
    fx[name] = Skia.RuntimeEffect.Make(shaders[name]);
    if (!fx[name]) throw Error(name + ' failed to compile');
  }
  const out = process.argv[2] || '/tmp/friend-previews';
  fs.mkdirSync(out, { recursive: true });
  const e = React.createElement;
  const rgb = (c) => Array.from(Skia.Color(c)).slice(0, 3);
  const tokens = (id) => THEME_DEFINITIONS.find((t) => t.id === id).tokens;
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = (r, g, b) =>
    linear(r / 255) * 0.2126 + linear(g / 255) * 0.7152 + linear(b / 255) * 0.0722;
  const layer = (effect, uniforms, x, y, width, height, blendMode) =>
    e(
      headless.Rect,
      { x, y, width, height, blendMode },
      e(headless.Shader, { source: effect, uniforms }),
    );
  let failed = false;

  for (const [size, width, height] of [
    ['phone', 390, 790],
    ['ipad', 820, 1180],
    ['landscape', 1180, 720],
    ['picker', 160, 210],
  ]) {
    for (const time of [0, 30]) {
      const d = tokens('erika');
      const dn = tokens('denise');
      const deniseColors = {
        size: [width, height],
        ink: rgb(dn['--color-foreground']),
        ceilRatio: DENISE_TEXT_CONTRAST,
      };
      const box = (name) => shaders.deniseRegion(width, height, name);
      const at = (r) => [r.x, r.y, r.width, r.height];
      const s = shaders.deniseScale(width, height);
      const pose = shaders.deniseHeadPose(time);
      const pivot = shaders.DENISE_GEOMETRY.pivot;
      const g = tokens('giuseppe');
      const k = tokens('kristen');
      const h = tokens('higa');
      const b = tokens('bea');
      const lantern = shaders.beaLanternBox(width, height);
      const beaColors = {
        size: [width, height],
        bg: rgb(b['--color-background']),
        ink: rgb(b['--color-foreground']),
        ceilRatio: BEA_TEXT_CONTRAST,
      };
      const lifeBand = shaders.kristenLifeBand(width, height);
      const scenes = [
        {
          name: 'erika',
          foreground: d['--color-foreground'],
          minimum: 4.5,
          tree: [
            layer(
              fx.ERIKA_SCENE,
              {
                size: [width, height],
                sky: rgb(d['--color-background']),
                ridge: rgb(ERIKA_PALETTE.ridge),
                near: rgb(ERIKA_PALETTE.near),
                fogCol: rgb(ERIKA_PALETTE.fog),
                sun: rgb(ERIKA_PALETTE.sun),
                ink: rgb(d['--color-foreground']),
              },
              0,
              0,
              width,
              height,
            ),
            layer(
              fx.ERIKA_MIST,
              { size: [width, height], time, fogCol: rgb(ERIKA_PALETTE.fog) },
              0,
              height * 0.45,
              width,
              height * 0.55,
            ),
          ],
        },
        {
          // The app bakes the room, figure and head into textures; drawing the
          // shaders straight into their boxes gives the same pixels.
          name: 'denise',
          foreground: dn['--color-foreground'],
          minimum: 4.5,
          tree: [
            layer(fx.DENISE_ROOM, deniseColors, 0, 0, width, height),
            layer(fx.DENISE_AIR, { ...deniseColors, time }, ...at(box('glass'))),
            layer(fx.DENISE_FIGURE, deniseColors, ...at(box('figure'))),
            e(
              headless.Group,
              {
                origin: { x: width / 2 + pivot.x * s, y: pivot.y * s },
                transform: [
                  { translateX: pose.dx * s },
                  { translateY: pose.dy * s },
                  { rotate: pose.angle },
                ],
              },
              layer(fx.DENISE_HEAD, deniseColors, ...at(box('head'))),
            ),
            layer(fx.DENISE_STEAM, { ...deniseColors, time }, ...at(box('steam'))),
          ],
        },
        {
          name: 'giuseppe',
          foreground: g['--color-foreground'],
          minimum: 0,
          tree: [
            layer(
              fx.GIUSEPPE_LAKE,
              {
                size: [width, height],
                deep: rgb(g['--color-background']),
                haze: rgb(GIUSEPPE_PALETTE.haze),
                warm: rgb(GIUSEPPE_PALETTE.warm),
              },
              0,
              0,
              width,
              height,
            ),
            layer(
              fx.GIUSEPPE_BOKEH,
              {
                size: [width, height],
                time,
                haze: rgb(GIUSEPPE_PALETTE.haze),
                warm: rgb(GIUSEPPE_PALETTE.warm),
              },
              0,
              height * 0.55,
              width,
              height * 0.45,
              'plus',
            ),
            layer(
              fx.GIUSEPPE_CAIRN,
              {
                size: [width, height],
                deep: rgb(g['--color-background']),
                haze: rgb(GIUSEPPE_PALETTE.haze),
                warm: rgb(GIUSEPPE_PALETTE.warm),
                stoneA: rgb(GIUSEPPE_PALETTE.stoneA),
                stoneB: rgb(GIUSEPPE_PALETTE.stoneB),
              },
              0,
              0,
              width,
              height,
            ),
          ],
        },
        {
          name: 'kristen',
          foreground: k['--color-foreground'],
          // The scene keeps KRISTEN_CONTRAST.floor (4.6 targets 4.5:1); 1 turns it off.
          minimum:
            KRISTEN_CONTRAST.floor > 1 ? Math.min(4.5, KRISTEN_CONTRAST.floor - 0.1) : 0,
          tree: [
            layer(
              fx.KRISTEN_SCENE,
              {
                size: [width, height],
                sky: rgb(k['--color-background']),
                skyTop: rgb(KRISTEN_PALETTE.skyTop),
                granite: rgb(KRISTEN_PALETTE.granite),
                shade: rgb(KRISTEN_PALETTE.shade),
                streak: rgb(KRISTEN_PALETTE.streak),
                pine: rgb(KRISTEN_PALETTE.pine),
                haze: rgb(KRISTEN_PALETTE.haze),
                sun: rgb(KRISTEN_PALETTE.sun),
                ink: rgb(k['--color-foreground']),
                bold: KRISTEN_CONTRAST.wall,
                forestBold: KRISTEN_CONTRAST.forest,
                floorRatio: KRISTEN_CONTRAST.floor,
              },
              0,
              0,
              width,
              height,
            ),
            layer(
              fx.KRISTEN_MIST,
              { size: [width, height], time, haze: rgb(KRISTEN_PALETTE.haze) },
              0,
              height * 0.62,
              width,
              height * 0.38,
            ),
            layer(
              fx.KRISTEN_LIFE,
              {
                size: [width, height],
                time,
                ink: rgb(k['--color-foreground']),
                haze: rgb(KRISTEN_PALETTE.haze),
                floorRatio: KRISTEN_CONTRAST.floor,
              },
              lifeBand.x,
              lifeBand.y,
              lifeBand.width,
              lifeBand.height,
            ),
          ],
        },
        {
          name: 'higa',
          foreground: h['--color-foreground'],
          minimum: 4.5,
          tree: [
            layer(
              fx.HIGA_SCENE,
              {
                size: [width, height],
                time,
                bg: rgb(h['--color-background']),
                ink: rgb(h['--color-foreground']),
                ceilRatio: HIGA_TEXT_CONTRAST,
              },
              0,
              0,
              width,
              height,
            ),
          ],
        },
        {
          name: 'bea',
          foreground: b['--color-foreground'],
          minimum: 4.5,
          exclude: lantern,
          tree: [
            layer(fx.BEA_SCENE, beaColors, 0, 0, width, height),
            layer(
              fx.BEA_MIST,
              { size: [width, height], time },
              0,
              height * 0.7,
              width,
              height * 0.3,
            ),
            layer(fx.BEA_LIGHT, { ...beaColors, time }, 0, 0, width, height, 'plus'),
            layer(
              fx.BEA_LANTERN,
              {
                size: [width, height],
                time,
                ink: beaColors.ink,
                ceilRatio: BEA_TEXT_CONTRAST,
              },
              lantern.x,
              lantern.y,
              lantern.width,
              lantern.height,
            ),
          ],
        },
      ];
      for (const scene of scenes) {
        const surface = headless.makeOffscreenSurface(width, height);
        const image = await headless.drawOffscreen(
          surface,
          e(headless.Group, null, ...scene.tree),
        );
        const file = `${out}/${scene.name}-${size}-t${time}.png`;
        fs.writeFileSync(file, await image.encodeToBytes());
        const pixels = await image.readPixels();
        const text = luminance(...rgb(scene.foreground).map((v) => Math.round(v * 255)));
        let lowest = Infinity;
        const skip = scene.exclude;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            if (
              skip &&
              x >= skip.x &&
              x < skip.x + skip.width &&
              y >= skip.y &&
              y < skip.y + skip.height
            )
              continue;
            const i = (y * width + x) * 4;
            const bg = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
            const ratio = (Math.max(bg, text) + 0.05) / (Math.min(bg, text) + 0.05);
            lowest = Math.min(lowest, ratio);
          }
        const pass = lowest >= scene.minimum;
        failed ||= !pass;
        console.log(
          `${pass ? 'ok  ' : 'FAIL'} ${file}: lowest text contrast ${lowest.toFixed(2)}:1` +
            (scene.minimum ? ` (needs ${scene.minimum}:1)` : ' (reported only)'),
        );
        image.dispose();
        surface.dispose();
      }
      // Each Denise layer must fit the box the canvas draws (or bakes) it in:
      // draw it over the whole canvas and look for pixels outside the box.
      if (time === 0)
        for (const [name, effect, times] of [
          ['glass', fx.DENISE_AIR, [0, 3.3, 7.9, 11.2]],
          ['figure', fx.DENISE_FIGURE, [0]],
          ['head', fx.DENISE_HEAD, [0]],
          ['steam', fx.DENISE_STEAM, [0, 1.7, 4.1]],
        ]) {
          const r = box(name);
          let outside = 0,
            inside = 0;
          for (const t of times) {
            const surface = headless.makeOffscreenSurface(width, height);
            const image = await headless.drawOffscreen(
              surface,
              layer(effect, { ...deniseColors, time: t }, 0, 0, width, height),
            );
            const pixels = await image.readPixels();
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                if (pixels[(y * width + x) * 4 + 3] === 0) continue;
                const within =
                  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
                if (within) inside++;
                else outside++;
              }
            image.dispose();
            surface.dispose();
          }
          const contained = outside === 0 && inside > 0;
          failed ||= !contained;
          console.log(
            `${contained ? 'ok  ' : 'FAIL'} denise-${size} ${name} box: ${outside} pixels outside, ${inside} inside`,
          );
        }
      // Kristen's hiker and hawk must fit the strip their overlay is clipped to:
      // draw the life layer over the whole canvas through a full hawk orbit and
      // look for figure pixels outside kristenLifeBand.
      if (time !== 0) continue;
      let outside = 0,
        inside = 0;
      for (let t = 0; t < 36; t += 3) {
        const surface = headless.makeOffscreenSurface(width, height);
        const life = layer(
          fx.KRISTEN_LIFE,
          {
            size: [width, height],
            time: t,
            ink: rgb(k['--color-foreground']),
            haze: rgb(KRISTEN_PALETTE.haze),
            floorRatio: KRISTEN_CONTRAST.floor,
          },
          0,
          0,
          width,
          height,
        );
        const image = await headless.drawOffscreen(surface, life);
        const pixels = await image.readPixels();
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            if (pixels[(y * width + x) * 4 + 3] === 0) continue;
            const within =
              x >= lifeBand.x &&
              x < lifeBand.x + lifeBand.width &&
              y >= lifeBand.y &&
              y < lifeBand.y + lifeBand.height;
            if (within) inside++;
            else outside++;
          }
        image.dispose();
        surface.dispose();
      }
      const contained = outside === 0 && inside > 0;
      failed ||= !contained;
      console.log(
        `${contained ? 'ok  ' : 'FAIL'} kristen-${size} life band: ${outside} figure pixels outside, ${inside} inside`,
      );
    }
  }
  if (failed) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
