// Builds a Tackbok backup ZIP full of made-up entries for store and website
// screenshots. Restore it on a throwaway simulator or emulator through the
// welcome screen's "Already have a journal? Import it", never on a personal
// device.
//
// Usage (macOS only: it uses say, afconvert and afinfo):
//   bun marketing/screenshots/demo-journal/build.mjs \
//     [--selfie=<photo.jpg>] [--restaurant=<photo.jpg>] [--out=<file.zip>] [--today=YYYY-MM-DD]
//
// The photos default to the maintainer-supplied ones in photos/ (metadata
// stripped). Every photo is re-encoded, which drops EXIF and location data.
// Dates count back from --today (default: the current day) in this machine's
// timezone, so build on the day you capture, in the device's timezone.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { featured, filler, fillerMoods, memory, recent } from './entries.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const sharp = createRequire(resolve(root, 'apps/website/package.json'))('sharp');

const TOTAL_DAYS = 176; // The timeline shows "175 days of gratitude" below yesterday.

function usage(problem) {
  console.error(
    `${problem}\nUsage: build.mjs [--selfie=<photo>] [--restaurant=<photo>] [--out=<zip>] [--today=YYYY-MM-DD]`,
  );
  process.exit(1);
}

const args = {
  selfie: resolve(here, 'photos/selfie.jpg'),
  restaurant: resolve(here, 'photos/restaurant.jpg'),
  // Outside the repository, so the ZIP can't be committed by accident.
  out: resolve(tmpdir(), 'tackbok-demo-backup.zip'),
};
for (const arg of process.argv.slice(2)) {
  const match = /^--(selfie|restaurant|out|today)=(.+)$/.exec(arg);
  if (!match) usage(`Unknown or empty argument: ${arg}`);
  args[match[1]] = match[2];
}
const out = resolve(args.out);

let today = new Date();
if (args.today) {
  today = new Date(`${args.today}T12:00:00`);
  // Rejects malformed dates and ones that roll over, such as 2026-02-31.
  const roundTrip = Number.isNaN(today.getTime())
    ? ''
    : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (roundTrip !== args.today) usage(`Invalid --today: ${args.today}`);
}

function at(daysAgo, time, yearsAgo = 0) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(today);
  date.setFullYear(date.getFullYear() - yearsAgo);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

function run(command, commandArgs, options) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.error}`);
  }
  return result.stdout;
}

const staging = await mkdtemp(resolve(tmpdir(), 'tackbok-demo-backup-'));
try {
  for (const folder of ['data', 'media/photos', 'media/voice-memos', 'media/profile']) {
    await mkdir(resolve(staging, folder), { recursive: true });
  }

  // Photos: re-encode to drop EXIF and location data and keep the size reasonable.
  const photoAssets = {};
  for (const name of featured.photos) {
    const path = `media/photos/demo-${name}.jpg`;
    const info = await sharp(args[name])
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toFile(resolve(staging, path));
    photoAssets[name] = {
      type: 'IMAGE',
      path,
      mimeType: 'image/jpeg',
      width: info.width,
      height: info.height,
    };
  }

  // A short spoken voice note made with macOS text-to-speech.
  const voicePath = 'media/voice-memos/demo-voice-note.m4a';
  const aiff = resolve(staging, 'voice.aiff');
  run('say', [
    '-o',
    aiff,
    'Thank you, Dad. For every lift to the station, every late night call, and every time you told me: you can do this.',
  ]);
  run('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, resolve(staging, voicePath)]);
  await rm(aiff);
  const voiceSeconds = Number(
    run('afinfo', [resolve(staging, voicePath)]).match(
      /estimated duration: ([\d.]+)/,
    )?.[1],
  );
  if (!Number.isFinite(voiceSeconds) || voiceSeconds <= 0) {
    throw new Error('Could not read the voice note duration from afinfo');
  }

  const entries = [];
  const add = ({ createdAt, title = null, text, mood = null, assets = [] }) =>
    entries.push({
      noteId: randomUUID(),
      textTitle: title,
      textContent: text,
      mood,
      tagTitles: [],
      createdAt,
      updatedAt: createdAt,
      assets,
    });

  add({
    createdAt: at(featured.daysAgo, featured.time),
    title: featured.title,
    text: featured.text,
    mood: featured.mood,
    assets: [
      {
        type: 'AUDIO',
        path: voicePath,
        mimeType: 'audio/mp4',
        durationMs: Math.round(voiceSeconds * 1000),
      },
      ...featured.photos.map((name) => photoAssets[name]),
    ],
  });
  recent.forEach((entry, index) =>
    add({ ...entry, createdAt: at(featured.daysAgo + 1 + index, entry.time) }),
  );
  add({ ...memory, createdAt: at(0, memory.time, memory.yearsAgo) });

  // Older filler: a run of consecutive days, then roughly every ten days. Day 12
  // is left empty on purpose, so Insights shows a current streak (11) that
  // differs from the longest one (33), as in the approved captures. Skip
  // today's date in earlier years so the four-year memory stays the only
  // yearly On this day card.
  const sameDay = (date) =>
    date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  let daysAgo = featured.daysAgo + recent.length + 2;
  let index = 0;
  while (entries.length < TOTAL_DAYS) {
    const hour = String(7 + (index % 14)).padStart(2, '0');
    const minute = String((index * 17) % 60).padStart(2, '0');
    const createdAt = at(daysAgo, `${hour}:${minute}`);
    if (!sameDay(new Date(createdAt))) {
      add({
        createdAt,
        text: filler[index % filler.length],
        mood: fillerMoods[index % fillerMoods.length],
      });
      index++;
    }
    daysAgo += daysAgo < 45 ? 1 : 9 + (index % 3);
  }

  // Self-check: one entry per day, 176 days, and exactly one earlier entry on
  // today's month and day (the four-year memory).
  const dayKeys = entries.map((entry) => new Date(entry.createdAt).toDateString());
  const onThisDay = entries.filter(
    (entry) => sameDay(new Date(entry.createdAt)) && entry.createdAt < at(0, '00:00'),
  );
  if (
    entries.some((entry) => !Number.isFinite(entry.createdAt)) ||
    new Set(dayKeys).size !== TOTAL_DAYS ||
    onThisDay.length !== 1
  ) {
    throw new Error('Demo journal dates are inconsistent');
  }

  const profilePath = 'media/profile/demo-avatar.jpg';
  await sharp(resolve(root, 'apps/mobile/assets/samples/sample-photo-1.jpg'))
    .jpeg({ quality: 88 })
    .toFile(resolve(staging, profilePath));

  const json = (path, value) =>
    writeFile(resolve(staging, path), JSON.stringify(value, null, 2));
  await json('manifest.json', {
    format: 'tackbok-backup',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      entries: entries.length,
      tags: 0,
      customPrompts: 0,
      photos: featured.photos.length + 1,
      voiceMemos: 1,
    },
  });
  await json('data/entries.json', entries);
  await json('data/tags.json', []);
  await json('data/custom-prompts.json', []);
  await json('data/profile.json', { name: null, email: null, imagePath: profilePath });

  await mkdir(dirname(out), { recursive: true });
  await rm(out, { force: true });
  run('zip', ['-qrX', out, '.'], { cwd: staging });
  const { size } = await stat(out);
  const oldest = new Date(Math.min(...entries.map((entry) => entry.createdAt)));
  console.log(
    `Wrote ${out}: ${entries.length} entries (oldest ${oldest.toDateString()}), ` +
      `${(size / 1024).toFixed(0)} KB, voice note ${voiceSeconds.toFixed(1)} s.`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
