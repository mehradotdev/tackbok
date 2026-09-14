// Render actual Skia geometry at sampled animation times; no native device required.
// Reanimated is replaced only with fixed shared values for these still frames.
console.error = (...args) => {
  throw new Error(args.map(String).join(' '));
};
const fs = require('fs'),
  path = require('path'),
  Module = require('module');
const root = path.resolve(__dirname, '../../../..');
const ts = require(root + '/node_modules/typescript'),
  React = require(root + '/node_modules/react');
let headless, Skia;
const load = Module._load;
const shared = (value) => ({ _isReanimatedSharedValue: true, value });
Module._load = function (id, parent, main) {
  if (id === 'react-native-reanimated') return { useDerivedValue: (fn) => shared(fn()) };
  if (id === '@shopify/react-native-skia')
    return { ...headless, Skia, vec: (x, y) => ({ x, y }) };
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
  const { ShadowCatArt } = require(
    root + '/apps/mobile/src/components/backdrops/ShadowCat.tsx',
  );
  const out = process.argv[2] || '/tmp/shadow-frames';
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < 385; i++) {
    const t = i / 24;
    const idle = t < 8 ? t : 0;
    const performance = t < 8 ? 0 : t < 12 ? t - 8 : t - 12;
    const surface = headless.makeOffscreenSurface(360, 530);
    const el = React.createElement(
      headless.Group,
      null,
      React.createElement(headless.Rect, {
        x: 0,
        y: 0,
        width: 360,
        height: 530,
        color: '#111B32',
      }),
      React.createElement(
        headless.Group,
        { transform: [{ translateX: 20 }, { translateY: 20 }, { scale: 0.32 }] },
        React.createElement(ShadowCatArt, {
          idle: shared(idle),
          performance: shared(performance),
          variant: shared(t < 12 ? 0 : 1),
        }),
      ),
    );
    const img = await headless.drawOffscreen(surface, el);
    fs.writeFileSync(`${out}/${String(i).padStart(3, '0')}.png`, img.encodeToBytes());
    img.dispose();
    surface.dispose();
  }
  console.log('Rendered 385 frames of Shadow: idle, eyes-first glance and silent meow.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
