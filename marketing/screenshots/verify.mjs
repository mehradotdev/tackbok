// Test a disposable copy; never modify the real inputs or exports.
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  cp,
  symlink,
  readFile,
  writeFile,
  rm,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { presets } from './presets.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../..');
const sharp = createRequire(resolve(root, 'apps/website/package.json'))('sharp');
const temp = await mkdtemp(resolve(tmpdir(), 'tackbok-screenshots-'));
const fixture = resolve(temp, 'marketing/screenshots');
const run = (...args) =>
  spawnSync(process.execPath, [resolve(fixture, 'render.mjs'), ...args], {
    encoding: 'utf8',
  });
const succeeded = (result) => assert.equal(result.status, 0, result.stderr);
const failed = (result, pattern) => {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
};
try {
  await mkdir(fixture, { recursive: true });
  for (const name of [
    'render.mjs',
    'presets.mjs',
    'inputs.json',
    'panels.json',
    'fonts.conf',
  ]) {
    await cp(resolve(source, name), resolve(fixture, name), { recursive: true });
  }
  await cp(
    resolve(root, 'apps/website/src/assets/screenshots'),
    resolve(temp, 'apps/website/src/assets/screenshots'),
    { recursive: true },
  );
  await mkdir(resolve(temp, 'apps/mobile/assets'), { recursive: true });
  await mkdir(resolve(temp, 'apps/website'), { recursive: true });
  await writeFile(resolve(temp, 'apps/website/package.json'), '{}');
  await symlink(resolve(root, 'node_modules'), resolve(temp, 'node_modules'));
  await symlink(
    resolve(root, 'apps/mobile/assets/fonts'),
    resolve(temp, 'apps/mobile/assets/fonts'),
  );

  failed(run('--target=unknown'), /Usage:/);
  succeeded(run('--check'));
  await assert.rejects(readdir(resolve(fixture, 'output')), { code: 'ENOENT' });
  succeeded(run());
  for (const [name, size] of Object.entries(presets)) {
    const folder = resolve(fixture, 'output', name);
    const files = await readdir(folder);
    assert.equal(files.length, 8);
    assert(files.includes('contact-sheet.png'));
    for (const file of files.filter((file) => /^\d/.test(file))) {
      const metadata = await sharp(resolve(folder, file)).metadata();
      assert.equal(metadata.width, size.width);
      assert.equal(metadata.height, size.height);
      assert.equal(metadata.hasAlpha, false);
    }
  }
  const inputPath = resolve(fixture, 'inputs.json');
  const original = await readFile(inputPath, 'utf8');
  const originalPanel = await readFile(resolve(fixture, 'output/iphone/01-moments.png'));
  const inputs = JSON.parse(original);
  inputs.tablet.revisit.file = 'ipad/missing.webp';
  await writeFile(inputPath, JSON.stringify(inputs));
  failed(run(), /ENOENT/);
  assert.deepEqual(
    await readFile(resolve(fixture, 'output/iphone/01-moments.png')),
    originalPanel,
  );
  inputs.phone.timeline.file = '../../../package.json';
  await writeFile(inputPath, JSON.stringify(inputs));
  failed(run('--target=iphone'), /Input escapes/);
  await writeFile(inputPath, original);
  const cropInputs = JSON.parse(original);
  cropInputs.phone.timeline.crop.width = 99999;
  await writeFile(inputPath, JSON.stringify(cropInputs));
  failed(run('--target=android-phone'), /Invalid capture crop/);
  await writeFile(inputPath, original);
  const panelsPath = resolve(fixture, 'panels.json');
  const panels = JSON.parse(await readFile(panelsPath, 'utf8'));
  panels[0].title = 'Very long headline '.repeat(100);
  await writeFile(panelsPath, JSON.stringify(panels));
  failed(run('--target=iphone'), /overflows/);
  console.log(
    'Passed: four export sizes, opaque PNGs, check-only mode, invalid target, missing input, path bounds, crop bounds, text overflow, and validation failures preserving exports.',
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
