// Render the Denise and Giuseppe shader scenes at phone/landscape/picker sizes
// and check body-text contrast against every background pixel. Denise must stay
// at or above 4.5:1; Giuseppe (lit cairn and sun glow, about 2:1 and 3:1) is
// reported only, because the owner kept it as is (2026-11-26).
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
    ...require(backdrops + 'denise-shader.ts'),
    ...require(backdrops + 'giuseppe-shader.ts'),
  };
  const { THEME_DEFINITIONS, DENISE_PALETTE, GIUSEPPE_PALETTE } = require(
    root + '/apps/mobile/src/lib/theme/theme-tokens.ts',
  );
  const fx = {};
  for (const name of [
    'DENISE_SCENE',
    'DENISE_MIST',
    'GIUSEPPE_LAKE',
    'GIUSEPPE_BOKEH',
    'GIUSEPPE_CAIRN',
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
    ['landscape', 1180, 720],
    ['picker', 160, 210],
  ]) {
    for (const time of [0, 30]) {
      const d = tokens('denise');
      const g = tokens('giuseppe');
      const scenes = [
        {
          name: 'denise',
          foreground: d['--color-foreground'],
          minimum: 4.5,
          tree: [
            layer(
              fx.DENISE_SCENE,
              {
                size: [width, height],
                sky: rgb(d['--color-background']),
                ridge: rgb(DENISE_PALETTE.ridge),
                near: rgb(DENISE_PALETTE.near),
                fogCol: rgb(DENISE_PALETTE.fog),
                sun: rgb(DENISE_PALETTE.sun),
                ink: rgb(d['--color-foreground']),
              },
              0,
              0,
              width,
              height,
            ),
            layer(
              fx.DENISE_MIST,
              { size: [width, height], time, fogCol: rgb(DENISE_PALETTE.fog) },
              0,
              height * 0.45,
              width,
              height * 0.55,
            ),
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
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
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
    }
  }
  if (failed) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
