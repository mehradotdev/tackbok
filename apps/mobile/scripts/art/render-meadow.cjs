/* global __dirname */
// Render meadow geometry and shader at phone/tablet/picker sizes and check text contrast.
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
  const { MEADOW_SKY_SHADER } = require(
    root + '/apps/mobile/src/components/backdrops/meadow-sky-shader.ts',
  );
  const {
    meadowBlades,
    meadowPath,
    DRAGONFLY_BODY,
    DRAGONFLY_WINGS,
    MOTH_BODY,
    MOTH_WINGS,
  } = require(root + '/apps/mobile/src/components/backdrops/meadow-art.ts');
  const { THEME_DEFINITIONS, MEADOW_PALETTES } = require(
    root + '/apps/mobile/src/lib/theme/theme-tokens.ts',
  );
  const effect = Skia.RuntimeEffect.Make(MEADOW_SKY_SHADER);
  if (!effect) throw Error('Meadow shader failed to compile');
  const out = process.argv[2] || '/tmp/meadow-previews';
  fs.mkdirSync(out, { recursive: true });
  const e = React.createElement;
  for (const night of [false, true]) {
    const theme = THEME_DEFINITIONS.find((t) => t.id === (night ? 'poonam' : 'helena'));
    const palette = MEADOW_PALETTES[night ? 'night' : 'day'];
    const background = theme.tokens['--color-background'],
      foreground = theme.tokens['--color-foreground'];
    const rgb = (c) => Array.from(Skia.Color(c)).slice(0, 3);
    for (const [name, width, height] of [
      ['phone', 390, 790],
      ['tablet', 1024, 1280],
      ['landscape', 1180, 720],
      ['picker', 160, 210],
    ]) {
      for (const shimmer of [0, 3, 45]) {
        const unit = Math.min(width, height, 620);
        const surface = headless.makeOffscreenSurface(width, height);
        const layers = [0, 1, 2].map((layer) => meadowBlades(width, height, layer));
        const grass = (blades, color, blur) =>
          e(
            headless.Path,
            { path: meadowPath(blades, shimmer), color },
            e(headless.BlurMask, { blur, style: 'normal' }),
          );
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
                time: shimmer,
                night: +night,
                crescent: 0,
                sky: rgb(background),
                cloud: rgb(palette.cloud),
                light: rgb(palette.light),
              },
            }),
          ),
          e(
            headless.Rect,
            { x: 0, y: height * 0.72, width, height: height * 0.28 },
            e(headless.LinearGradient, {
              start: { x: 0, y: height * 0.72 },
              end: { x: 0, y: height },
              colors: ['transparent', palette.distant],
            }),
          ),
          grass(layers[0], palette.distant, unit * 0.005),
          grass(layers[1], palette.middle, unit * 0.002),
          grass(layers[2], palette.grass, unit * 0.0008),
          e(
            headless.Group,
            { opacity: 0.22 },
            grass(
              layers[2].filter((_, i) => i % 4 === 0),
              palette.highlight,
              0.5,
            ),
          ),
          e(headless.Rect, {
            x: 0,
            y: 0,
            width,
            height,
            color: palette.wash,
            opacity: palette.washOpacity,
          }),
          ...(name === 'picker' || shimmer === 0
            ? []
            : [
                e(
                  headless.Group,
                  {
                    opacity: 0.7,
                    transform: [
                      { translateX: width * 0.3 },
                      { translateY: height * 0.78 },
                      { scale: unit / 520 },
                    ],
                  },
                  e(
                    headless.Path,
                    {
                      path: night ? MOTH_WINGS : DRAGONFLY_WINGS,
                      color: palette.visitor,
                    },
                    e(headless.BlurMask, { blur: 0.9, style: 'normal' }),
                  ),
                  e(
                    headless.Path,
                    { path: night ? MOTH_BODY : DRAGONFLY_BODY, color: palette.visitor },
                    e(headless.BlurMask, { blur: 0.65, style: 'normal' }),
                  ),
                ),
              ]),
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
        if (contrast < 4.5) process.exitCode = 1;
        img.dispose();
        surface.dispose();
      }
    }
  }
  console.log(
    'Rendered 24 meadow frames: phone, tablet, landscape and picker at three wind/cloud phases.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
