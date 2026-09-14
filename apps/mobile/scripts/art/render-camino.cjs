/* global __dirname */
// Render the actual Camino Skia paths and shader at phone/tablet/picker sizes.
const fs = require('fs'),
  path = require('path'),
  Module = require('module');
const root = path.resolve(__dirname, '../../../..');
const ts = require(root + '/node_modules/typescript');
const React = require(root + '/node_modules/react');
let headless, Skia;
const load = Module._load;
Module._load = function (id, parent, main) {
  if (id === '@shopify/react-native-skia') return { ...headless, Skia };
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
  headless = require(
    root + '/node_modules/@shopify/react-native-skia/lib/commonjs/headless',
  );
  Skia = headless.getSkiaExports().Skia;
  const { CaminoLandscape } = require(
    root + '/apps/mobile/src/components/backdrops/CaminoLandscape.tsx',
  );
  const { CAMINO_SKY_SHADER } = require(
    root + '/apps/mobile/src/components/backdrops/camino-sky-shader.ts',
  );
  const { THEME_DEFINITIONS } = require(
    root + '/apps/mobile/src/lib/theme/theme-tokens.ts',
  );
  const effect = Skia.RuntimeEffect.Make(CAMINO_SKY_SHADER);
  if (!effect) throw Error('Camino shader failed to compile');
  const out = process.argv[2] || '/tmp/camino-previews';
  fs.mkdirSync(out, { recursive: true });
  const e = React.createElement;
  for (const night of [false, true]) {
    const theme = THEME_DEFINITIONS.find(
      (t) => t.id === (night ? 'camino-night' : 'camino'),
    );
    const background = theme.tokens['--color-background'],
      foreground = theme.tokens['--color-foreground'],
      primary = theme.tokens['--color-primary'];
    const rgb = (c) => Array.from(Skia.Color(c)).slice(0, 3);
    for (const [name, width, height] of [
      ['phone', 390, 790],
      ['tablet', 1024, 1280],
      ['landscape', 1180, 720],
      ['picker', 160, 210],
    ]) {
      for (const shimmer of night ? [0, 0.5] : [0]) {
        const surface = headless.makeOffscreenSurface(width, height);
        const scene = e(
          headless.Group,
          null,
          e(
            headless.Rect,
            { x: 0, y: 0, width, height },
            e(headless.Shader, {
              source: effect,
              uniforms: {
                size: [width, height],
                drift: shimmer,
                night: +night,
                crescent: 0,
                shimmer,
                sky: rgb(background),
                cloud: rgb(theme.tokens['--color-accent']),
                light: rgb(night ? foreground : primary),
              },
            }),
          ),
          e(CaminoLandscape, { width, height, night, background, foreground, primary }),
        );
        const img = await headless.drawOffscreen(surface, scene);
        fs.writeFileSync(
          `${out}/${theme.id}-${name}-${shimmer}.png`,
          img.encodeToBytes(),
        );
        // Check the whole art surface: journal text can land on any pixel.
        const pixels = img.readPixels();
        if (!(pixels instanceof Uint8Array)) throw Error('Expected RGBA8 pixels');
        const linear = Array.from({ length: 256 }, (_, i) => {
          const c = i / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        const luminance = (r, g, b) =>
          linear[r] * 0.2126 + linear[g] * 0.7152 + linear[b] * 0.0722;
        const fg = rgb(foreground).map((v) => Math.round(v * 255));
        const textLuminance = luminance(...fg);
        let contrast = Infinity;
        for (let i = 0; i < pixels.length; i += 4) {
          const bg = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
          contrast = Math.min(
            contrast,
            (Math.max(bg, textLuminance) + 0.05) / (Math.min(bg, textLuminance) + 0.05),
          );
        }
        console.log(
          `${theme.id} ${name} phase ${shimmer}: minimum body-text contrast ${contrast.toFixed(2)}:1`,
        );
        if (contrast < 4.5) throw Error('Body-text contrast below 4.5:1');
        img.dispose();
        surface.dispose();
      }
    }
  }
  console.log(
    'Rendered 12 Camino frames: phone, tablet, landscape and picker, including two night animation phases.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
