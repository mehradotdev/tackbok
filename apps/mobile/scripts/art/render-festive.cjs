// Render the Christmas and New Year shader scenes at phone, iPad, landscape and
// picker sizes, still and mid-celebration, and report body-text contrast against
// the background pixels. Both scenes keep small bright subjects (the moon, tree
// lights, flutes, garland bulbs), so contrast is reported, not enforced: the
// lowest ratio and the share of pixels under 4.5:1. It fails if a swaying New
// Year bauble leaves the region its overlay is clipped to.
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
  const christmas = require(backdrops + 'christmas-shader.ts');
  const newYear = require(backdrops + 'new-year-shader.ts');
  const { THEME_DEFINITIONS, CHRISTMAS_PALETTE, NEW_YEAR_PALETTE } = require(
    root + '/apps/mobile/src/lib/theme/theme-tokens.ts',
  );
  const fx = {};
  for (const [name, source] of Object.entries({
    CHRISTMAS_SCENE: christmas.CHRISTMAS_SCENE,
    CHRISTMAS_LIGHTS: christmas.CHRISTMAS_LIGHTS,
    CHRISTMAS_SNOW: christmas.CHRISTMAS_SNOW,
    NEW_YEAR_SCENE: newYear.NEW_YEAR_SCENE,
    NEW_YEAR_BAUBLES: newYear.NEW_YEAR_BAUBLES,
    NEW_YEAR_LIGHTS: newYear.NEW_YEAR_LIGHTS,
    NEW_YEAR_CLOCK: newYear.NEW_YEAR_CLOCK,
    NEW_YEAR_CONFETTI: newYear.NEW_YEAR_CONFETTI,
  })) {
    fx[name] = Skia.RuntimeEffect.Make(source);
    if (!fx[name]) throw Error(name + ' failed to compile');
  }
  const out = process.argv[2] || '/tmp/festive-previews';
  fs.mkdirSync(out, { recursive: true });
  const e = React.createElement;
  const rgb = (c) => Array.from(Skia.Color(c)).slice(0, 3);
  const tokens = (id) => THEME_DEFINITIONS.find((t) => t.id === id).tokens;
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = (r, g, b) =>
    linear(r / 255) * 0.2126 + linear(g / 255) * 0.7152 + linear(b / 255) * 0.0722;
  const layer = (effect, uniforms, region, blendMode) =>
    e(
      headless.Rect,
      { ...region, blendMode },
      e(headless.Shader, { source: effect, uniforms }),
    );
  const p = tokens('christmas');
  const v = tokens('new-year');
  let failed = false;

  for (const [size, width, height] of [
    ['phone', 390, 790],
    ['ipad', 820, 1180],
    ['landscape', 1180, 720],
    ['picker', 160, 210],
  ]) {
    const full = { x: 0, y: 0, width, height };
    // Still (Reduce Motion and picker look: steady lights, no sway) and
    // mid-celebration with the lights and baubles moving.
    for (const [moment, time, party, still] of [
      ['still', 0, -1, 1],
      ['party', 30, 3.3, 0],
    ]) {
      const scenes = [
        {
          name: 'christmas',
          foreground: p['--color-foreground'],
          tree: [
            layer(
              fx.CHRISTMAS_SCENE,
              {
                size: [width, height],
                sky: rgb(p['--color-background']),
                snow: rgb(CHRISTMAS_PALETTE.snow),
                pine: rgb(CHRISTMAS_PALETTE.pine),
                warm: rgb(CHRISTMAS_PALETTE.warm),
                berry: rgb(CHRISTMAS_PALETTE.berry),
                ink: rgb(p['--color-foreground']),
              },
              full,
            ),
            layer(
              fx.CHRISTMAS_LIGHTS,
              {
                size: [width, height],
                time,
                party,
                snow: rgb(CHRISTMAS_PALETTE.snow),
                warm: rgb(CHRISTMAS_PALETTE.warm),
                berry: rgb(CHRISTMAS_PALETTE.berry),
              },
              full,
              'plus',
            ),
            layer(fx.CHRISTMAS_SNOW, { size: [width, height], time }, full),
          ],
        },
        {
          name: 'new-year',
          foreground: v['--color-foreground'],
          tree: [
            layer(
              fx.NEW_YEAR_SCENE,
              {
                size: [width, height],
                wine: rgb(NEW_YEAR_PALETTE.wine),
                rose: rgb(NEW_YEAR_PALETTE.rose),
                gold: rgb(NEW_YEAR_PALETTE.gold),
                glow: rgb(NEW_YEAR_PALETTE.glow),
              },
              full,
            ),
            layer(
              fx.NEW_YEAR_BAUBLES,
              {
                size: [width, height],
                time,
                still,
                gold: rgb(NEW_YEAR_PALETTE.gold),
                glow: rgb(NEW_YEAR_PALETTE.glow),
              },
              newYear.newYearBaubleRegion(width, height),
            ),
            layer(
              fx.NEW_YEAR_LIGHTS,
              { size: [width, height], time, still },
              full,
              'plus',
            ),
            layer(
              fx.NEW_YEAR_CLOCK,
              {
                size: [width, height],
                time,
                clock: party < 0 ? [23, 58, 30] : [0, 0, 12],
                wine: rgb(NEW_YEAR_PALETTE.wine),
                gold: rgb(NEW_YEAR_PALETTE.gold),
              },
              newYear.newYearClockRegion(width, height),
            ),
            layer(
              fx.NEW_YEAR_CONFETTI,
              {
                size: [width, height],
                party,
                gold: rgb(NEW_YEAR_PALETTE.gold),
              },
              full,
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
        const file = `${out}/${scene.name}-${size}-${moment}.png`;
        fs.writeFileSync(file, await image.encodeToBytes());
        const pixels = await image.readPixels();
        const text = luminance(...rgb(scene.foreground).map((c) => Math.round(c * 255)));
        let lowest = Infinity,
          low = 0;
        for (let i = 0; i < width * height * 4; i += 4) {
          const bg = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
          const ratio = (Math.max(bg, text) + 0.05) / (Math.min(bg, text) + 0.05);
          lowest = Math.min(lowest, ratio);
          if (ratio < 4.5) low++;
        }
        const share = (100 * low) / (width * height);
        console.log(
          `${file}: lowest text contrast ${lowest.toFixed(2)}:1, ` +
            `${share.toFixed(2)}% of pixels under 4.5:1`,
        );
        image.dispose();
        surface.dispose();
      }
    }
    // The swaying baubles must fit the region their overlay is clipped to:
    // draw them over the whole canvas through every sway period (5, 6 and 8 s)
    // and look for bauble pixels outside newYearBaubleRegion.
    const region = newYear.newYearBaubleRegion(width, height);
    let outside = 0,
      inside = 0;
    for (let t = 0; t < 24; t += 0.5) {
      const surface = headless.makeOffscreenSurface(width, height);
      const image = await headless.drawOffscreen(
        surface,
        layer(
          fx.NEW_YEAR_BAUBLES,
          {
            size: [width, height],
            time: t,
            still: 0,
            gold: rgb(NEW_YEAR_PALETTE.gold),
            glow: rgb(NEW_YEAR_PALETTE.glow),
          },
          full,
        ),
      );
      const pixels = await image.readPixels();
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] === 0) continue;
          const within =
            x >= region.x &&
            x < region.x + region.width &&
            y >= region.y &&
            y < region.y + region.height;
          if (within) inside++;
          else outside++;
        }
      image.dispose();
      surface.dispose();
    }
    const contained = outside === 0 && inside > 0;
    failed ||= !contained;
    console.log(
      `${contained ? 'ok  ' : 'FAIL'} new-year-${size} bauble region: ` +
        `${outside} bauble pixels outside, ${inside} inside`,
    );
  }
  if (failed) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
