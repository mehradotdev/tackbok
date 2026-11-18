import { presets } from './presets.mjs';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Reuse the existing, locked website image dependency without changing the app.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
// Fontconfig resolves its relative cache directory from the working directory.
// Keep that cache beside this tool even when invoked from the repository root.
const invocationDirectory = process.cwd();
process.chdir(here);
await mkdir(resolve(here, '.cache/fonts'), { recursive: true });
const fontConfig = resolve(here, 'fonts.conf');
// Set this at process startup: Bun's native image libraries may not see later
// mutations of process.env. The child inherits the exact same CLI arguments.
if (
  process.env.FONTCONFIG_FILE !== fontConfig ||
  process.env.PANGOCAIRO_BACKEND !== 'fc'
) {
  const child = spawnSync(process.execPath, process.argv.slice(1), {
    cwd: invocationDirectory,
    env: { ...process.env, FONTCONFIG_FILE: fontConfig, PANGOCAIRO_BACKEND: 'fc' },
    stdio: 'inherit',
  });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
const require = createRequire(resolve(root, 'apps/website/package.json'));
const sharp = require('sharp');
const args = process.argv.slice(2);
const check = args.includes('--check');
const targetArg = args.find((arg) => arg.startsWith('--target='));
const targetName = targetArg?.slice('--target='.length);
const validFlags = new Set([
  '--check',
  ...Object.keys(presets).map((name) => `--target=${name}`),
]);
if (
  args.some((arg) => !validFlags.has(arg)) ||
  args.filter((arg) => arg.startsWith('--target=')).length > 1
) {
  throw new Error(
    'Usage: bun marketing/screenshots/render.mjs [--check] [--target=iphone|android-phone|ipad|android-tablet]',
  );
}
const targets = targetName ? [targetName] : Object.keys(presets);
const inputs = JSON.parse(await readFile(resolve(here, 'inputs.json'), 'utf8'));
const panels = JSON.parse(await readFile(resolve(here, 'panels.json'), 'utf8'));

const palette = {
  paper: { bg: '#F7F0E2', fg: '#34382D', accent: '#B1A15F', wash: '#EBDFC3' },
  rose: { bg: '#F3E4DE', fg: '#47332E', accent: '#986B59', wash: '#E5C8BA' },
  ink: { bg: '#283A35', fg: '#F8F0DF', accent: '#D1BD89', wash: '#3C5146' },
  sage: { bg: '#E7EBDC', fg: '#303F34', accent: '#75886B', wash: '#CED8BC' },
};
const expected = [
  '01-moments',
  '02-memories',
  '03-prompts',
  '04-appearance',
  '05-customization',
  '06-revisit',
  '07-yours',
];
const escape = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const uri = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
const pngImage = (buffer, x, y, w, h) =>
  `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${uri(buffer)}"/>`;

// Pango uses the repository's licensed fonts, shapes Unicode and measures the
// actual text. Edit text in panels.json; the composition embeds the shaped PNG.
async function textBlock(text, x, y, maxWidth, size, color, maxHeight, centered = false) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty copy');
  const fontfile = resolve(root, 'apps/mobile/assets/fonts/Figtree_700Bold.ttf');
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${color}">${escape(text)}</span>`,
      font: `Figtree Bold ${size}`,
      fontfile,
      width: maxWidth,
      wrap: 'word',
      align: centered ? 'centre' : 'left',
      rgba: true,
      dpi: 72,
      spacing: 5,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  if (info.height > maxHeight || info.width > maxWidth) {
    throw new Error(`Copy overflows its layout (${info.width}×${info.height}): ${text}`);
  }
  return pngImage(
    data,
    centered ? x + (maxWidth - info.width) / 2 : x,
    y,
    info.width,
    info.height,
  );
}

async function capture(key, input) {
  const entry = key === 'logo' ? inputs.logo : inputs[input]?.[key];
  if (!entry || typeof entry.file !== 'string')
    throw new Error(`Missing input: ${input}/${key}`);
  // Raw captures are shared with the website; see the README there.
  const base = resolve(root, 'apps/website/src/assets/screenshots');
  const path = resolve(base, entry.file);
  const rel = relative(base, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error('Input escapes the screenshots directory');
  const data = await readFile(path);
  const metadata = await sharp(data).metadata();
  if (key !== 'logo') {
    const validSize =
      input === 'tablet'
        ? metadata.width >= 1640 &&
          metadata.height >= 2360 &&
          metadata.height > metadata.width
        : metadata.width >= 1179 &&
          metadata.height >= 2556 &&
          metadata.height > metadata.width;
    if (!validSize) throw new Error(`Undersized or wrong orientation: ${entry.file}`);
  }
  let captureImage = sharp(data).rotate();
  if (entry.crop) {
    const { left, top, width: cropWidth, height: cropHeight } = entry.crop;
    if (
      ![left, top, cropWidth, cropHeight].every(Number.isInteger) ||
      left < 0 ||
      top < 0 ||
      cropWidth <= 0 ||
      cropHeight <= 0 ||
      left + cropWidth > metadata.width ||
      top + cropHeight > metadata.height
    ) {
      throw new Error(`Invalid capture crop: ${input}/${key}`);
    }
    captureImage = captureImage.extract(entry.crop);
  }
  return captureImage.png().toBuffer();
}

async function appImage(data, x, y, w, h, mode, colors, id) {
  // Fit the editorial container to the actual image, avoiding empty tails.
  if (data && mode !== 'detail') {
    const meta = await sharp(data).metadata();
    const scale = Math.min(w / meta.width, h / meta.height);
    const fittedWidth = meta.width * scale;
    x += (w - fittedWidth) / 2;
    w = fittedWidth;
    h = meta.height * scale;
  }
  const backing = `<rect x="${x + 10}" y="${y + 20}" width="${w}" height="${h}" rx="28" fill="${colors.fg}" opacity=".10"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${colors.bg}" stroke="${colors.accent}" stroke-width="2"/>`;
  const meta = await sharp(data).metadata();
  const scale =
    mode === 'detail' ? w / meta.width : Math.min(w / meta.width, h / meta.height);
  const iw = meta.width * scale;
  const ih = meta.height * scale;
  return (
    backing +
    `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28"/></clipPath></defs><g clip-path="url(#${id})">${pngImage(data, x + (w - iw) / 2, y, iw, ih)}</g>`
  );
}

const rendered = [];
if (JSON.stringify(panels.map((panel) => panel.id)) !== JSON.stringify(expected)) {
  throw new Error('Panel IDs/order must match the seven-panel set');
}
for (const name of targets) {
  const target = presets[name];
  const landscape = target.width > target.height;
  const width = landscape ? 1920 : 1080;
  const height = (width * target.height) / target.width;
  const out = resolve(here, 'output', name);
  for (const panel of panels) {
    const colors = palette[panel.theme];
    if (!colors || !['hero', 'detail', 'pair', 'quiet'].includes(panel.layout))
      throw new Error('Unknown theme/layout');
    if (panel.captures.length !== (panel.layout === 'pair' ? 2 : 1))
      throw new Error('Incorrect capture count');
    const images = await Promise.all(
      panel.captures.map((key) => capture(key, target.input)),
    );
    const background = `<rect width="${width}" height="${height}" fill="${colors.bg}"/><circle cx="${width - 60}" cy="${height - 120}" r="460" fill="${colors.wash}"/>`;
    let content = '';
    if (landscape) {
      if (panel.layout === 'quiet') {
        const cardX = 880,
          cardY = 100,
          cardW = 920,
          cardH = height - 200;
        content += await textBlock(
          panel.title,
          50,
          height / 2 - 145,
          780,
          102,
          colors.fg,
          380,
          true,
        );
        content += `<rect x="${cardX + 10}" y="${cardY + 18}" width="${cardW}" height="${cardH}" rx="48" fill="${colors.fg}" opacity=".12"/><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="48" fill="#3A3529" stroke="#D1BD89" stroke-width="3"/>`;
        const logo = images[0];
        content += pngImage(
          logo,
          cardX + 280,
          cardY + cardH * 0.15,
          360,
          (360 * 240) / 350,
        );
        content += await textBlock(
          panel.cardTitle,
          cardX + 40,
          cardY + cardH * 0.56,
          cardW - 80,
          102,
          '#F0E8D6',
          140,
          true,
        );
        content += await textBlock(
          panel.cardTagline,
          cardX + 40,
          cardY + cardH * 0.77,
          cardW - 80,
          54,
          '#D1BD89',
          150,
          true,
        );
      } else {
        content += await textBlock(
          panel.title.replaceAll('\n', ' '),
          70,
          65,
          width - 140,
          88,
          colors.fg,
          180,
          true,
        );
        const y = 230,
          availableH = height - y - 55;
        if (panel.layout === 'pair') {
          for (let i = 0; i < 2; i++) {
            content += `<defs><clipPath id="tablet-half-${i}"><rect x="${(i * width) / 2}" y="${y}" width="${width / 2}" height="${availableH + 30}"/></clipPath></defs><g clip-path="url(#tablet-half-${i})">`;
            content += await appImage(
              images[i],
              80,
              y,
              1760,
              availableH,
              'hero',
              colors,
              `tablet-theme-${i}`,
            );
            content += '</g>';
          }
        } else {
          content += await appImage(
            images[0],
            80,
            y + (panel.id === '03-prompts' ? 80 : 0),
            1760,
            availableH - (panel.id === '03-prompts' ? 160 : 0),
            'hero',
            colors,
            'screen',
          );
        }
      }
    } else {
      const closing = panel.layout === 'quiet';
      content += await textBlock(
        panel.title,
        70,
        closing ? height - 410 : 110,
        940,
        104,
        colors.fg,
        290,
        true,
      );
      if (closing) {
        const cardY = 390;
        const cardHeight = height - 940;
        const rgb = await sharp(images[0])
          .extract({ left: 0, top: 0, width: 1, height: 1 })
          .removeAlpha()
          .raw()
          .toBuffer();
        const cardColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        content += `<rect x="70" y="${cardY + 18}" width="960" height="${cardHeight}" rx="48" fill="${colors.fg}" opacity=".12"/><rect x="60" y="${cardY}" width="960" height="${cardHeight}" rx="48" fill="${cardColor}" stroke="#D1BD89" stroke-width="3"/>`;
        // Shrink the logo on short (tablet) canvases so it clears the title.
        const logoHeight = Math.min((390 * 240) / 350, cardHeight * 0.4);
        const logoWidth = (logoHeight * 350) / 240;
        content += pngImage(
          images[0],
          (width - logoWidth) / 2,
          cardY + Math.min(cardHeight * 0.16, cardHeight * 0.5 - logoHeight - 20),
          logoWidth,
          logoHeight,
        );
        content += await textBlock(
          panel.cardTitle,
          100,
          cardY + cardHeight * 0.55,
          880,
          110,
          '#F0E8D6',
          150,
          true,
        );
        content += await textBlock(
          panel.cardTagline,
          110,
          cardY + cardHeight * 0.75,
          860,
          58,
          '#D1BD89',
          160,
          true,
        );
      } else if (panel.layout === 'pair') {
        // Same real timeline, split into light/dark halves at identical scale.
        for (let i = 0; i < 2; i++) {
          content += `<defs><clipPath id="theme-half-${i}"><rect x="${(i * width) / 2}" y="350" width="${width / 2}" height="${height}"/></clipPath></defs><g clip-path="url(#theme-half-${i})">`;
          content += await appImage(
            images[i],
            60,
            390,
            960,
            height - 390,
            'detail',
            colors,
            `theme-${i}`,
          );
          content += '</g>';
        }
      } else {
        let box = [60, 390, 960, height - 390];
        let imageMode = 'detail';
        if (panel.id === '02-memories') {
          box = [90, 370, 900, height - 410];
          imageMode = 'hero';
        } else if (
          panel.id === '03-prompts' &&
          inputs[target.input]?.[panel.captures[0]]?.crop
        ) {
          box = [40, 590, 1000, height - 740];
          imageMode = 'hero';
        } else if (panel.id === '05-customization') {
          box = [60, 390, 960, height - 390];
        } else if (panel.id === '06-revisit') {
          box = [30, 410, 1020, height - 410];
        }
        content += await appImage(images[0], ...box, imageMode, colors, 'screen');
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${target.width}" height="${target.height}" viewBox="0 0 ${width} ${height}"><title>${escape(panel.title.replaceAll('\n', ' '))}</title>${background}${content}</svg>`;
    const png = await sharp(Buffer.from(svg))
      .flatten({ background: colors.bg })
      .removeAlpha()
      .png()
      .toBuffer();
    rendered.push({ out, id: panel.id, png, name });
  }
}

// Validate every requested panel before writing anything. A failed run never
// produces a partially new set that might be mistaken for a complete export.
if (!check) {
  for (const item of rendered) {
    await mkdir(item.out, { recursive: true });
    await writeFile(resolve(item.out, `${item.id}.png`), item.png);
  }
  for (const name of targets) {
    const target = presets[name];
    const landscape = target.width > target.height;
    const items = rendered.filter((item) => item.name === name);
    const tw = landscape ? 480 : 270;
    const th = Math.round((tw * target.height) / target.width);
    const columns = landscape ? 3 : 7;
    const rows = Math.ceil(items.length / columns);
    const thumbs = await Promise.all(
      items.map(async (item, i) => ({
        input: await sharp(item.png).resize(tw, th).toBuffer(),
        left: (i % columns) * (tw + 12),
        top: Math.floor(i / columns) * (th + 12),
      })),
    );
    await sharp({
      create: {
        width: columns * (tw + 12) - 12,
        height: rows * (th + 12) - 12,
        channels: 3,
        background: '#FFFFFF',
      },
    })
      .composite(thumbs)
      .png()
      .toFile(resolve(items[0].out, 'contact-sheet.png'));
  }
}
console.log(
  `${check ? 'Validated' : 'Rendered'} ${rendered.length} panels: ${targets.join(', ')}.`,
);
