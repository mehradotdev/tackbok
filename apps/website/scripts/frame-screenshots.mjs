// Bakes a generic phone frame into raw app screenshots for the repository README.
// GitHub can't apply the website's CSS frame (PhoneFrame.astro), so the frame is
// drawn here as plain SVG shapes: no Apple or Samsung device artwork.
//
// Usage (from apps/website): bun run frame-screenshots
// Input:  src/assets/screenshots/ios/<name>.webp (raw captures, see README.md there)
// Output: <repo>/assets/screenshots/<name>.webp

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const websiteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputDir = path.join(websiteDir, 'src/assets/screenshots/ios');
const outputDir = path.resolve(websiteDir, '../../assets/screenshots');

/** Raw captures the README shows. */
const NAMES = ['timeline-light', 'timeline-dark', 'editor-light', 'editor-dark'];

const SCREEN_WIDTH = 540; // README shows the images at 270px, so this is 2x.
const SCREEN_RADIUS = 58;
const BEZEL = 14;
const BUTTON_DEPTH = 4; // How far the side buttons stick out of the body.

async function frame(name) {
  const screen = sharp(path.join(inputDir, `${name}.webp`)).resize({
    width: SCREEN_WIDTH,
  });
  const { data, info } = await screen.png().toBuffer({ resolveWithObject: true });
  const screenHeight = info.height;

  const roundedScreen = await sharp(data)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${SCREEN_WIDTH}" height="${screenHeight}"><rect width="${SCREEN_WIDTH}" height="${screenHeight}" rx="${SCREEN_RADIUS}" ry="${SCREEN_RADIUS}"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const bodyWidth = SCREEN_WIDTH + BEZEL * 2;
  const bodyHeight = screenHeight + BEZEL * 2;
  const width = bodyWidth + BUTTON_DEPTH * 2;
  const height = bodyHeight;
  const bodyRadius = SCREEN_RADIUS + BEZEL;

  // A dark body with a subtle lighter edge, plus a power button on the right
  // and two volume buttons on the left.
  const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b5f66"/>
      <stop offset="0.5" stop-color="#2b2e33"/>
      <stop offset="1" stop-color="#4a4e55"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${Math.round(height * 0.2)}" width="${BUTTON_DEPTH + 2}" height="${Math.round(height * 0.07)}" rx="2" fill="#3a3d42"/>
  <rect x="0" y="${Math.round(height * 0.29)}" width="${BUTTON_DEPTH + 2}" height="${Math.round(height * 0.07)}" rx="2" fill="#3a3d42"/>
  <rect x="${width - BUTTON_DEPTH - 2}" y="${Math.round(height * 0.24)}" width="${BUTTON_DEPTH + 2}" height="${Math.round(height * 0.11)}" rx="2" fill="#3a3d42"/>
  <rect x="${BUTTON_DEPTH}" y="0" width="${bodyWidth}" height="${bodyHeight}" rx="${bodyRadius}" ry="${bodyRadius}" fill="url(#edge)"/>
  <rect x="${BUTTON_DEPTH + 3}" y="3" width="${bodyWidth - 6}" height="${bodyHeight - 6}" rx="${bodyRadius - 3}" ry="${bodyRadius - 3}" fill="#121315"/>
</svg>`;

  await sharp(Buffer.from(frameSvg))
    .composite([{ input: roundedScreen, left: BUTTON_DEPTH + BEZEL, top: BEZEL }])
    .webp({ quality: 82, effort: 6 })
    .toFile(path.join(outputDir, `${name}.webp`));

  console.log(`Framed ${name} (${width}x${height})`);
}

await mkdir(outputDir, { recursive: true });
for (const name of NAMES) {
  await frame(name);
}
