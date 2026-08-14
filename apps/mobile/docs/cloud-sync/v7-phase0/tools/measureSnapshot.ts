import { gzipSync, gunzipSync } from 'node:zlib';
import { canonicalizeV2, type CanonicalV2 } from './canonicalV2';

const WORDS = [
  'amber', 'breeze', 'cedar', 'dawn', 'echo', 'field', 'gentle', 'harbor',
  'island', 'jasmine', 'kind', 'lantern', 'meadow', 'north', 'open', 'paper',
  'quiet', 'river', 'stone', 'today', 'umber', 'violet', 'window', 'yellow',
  'zinnia', '雪', 'سلام', 'שקט', 'café', '🌿',
];

function id(prefix: string, index: number): string {
  return `${prefix}-${index.toString().padStart(6, '0')}`;
}

function hash(index: number): string {
  return index.toString(16).padStart(64, '0');
}

function syntheticBody(index: number): string {
  let seed = (index + 1) * 2654435761;
  const words: string[] = [];
  while (words.join(' ').length < 720) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    words.push(WORDS[seed % WORDS.length]);
  }
  return `${words.join(' ')}.\nSynthetic fixture entry ${index}; no user data.`;
}

export function buildRepresentativeSnapshot(entryCount: number): CanonicalV2 {
  const timestamp = 1_770_000_000_000;
  const tags = Array.from({ length: 32 }, (_, index) => ({
    tagId: id('tag', index),
    title: `Synthetic tag ${index}`,
    createdAt: timestamp + index,
    updatedAt: timestamp + index,
    conflictOriginId: null,
  }));
  const entries = Array.from({ length: entryCount }, (_, index) => ({
    entryId: id('entry', index),
    title: `Synthetic reflection ${index}`,
    content: syntheticBody(index),
    mood: ['AMAZING', 'HAPPY', 'OKAY', 'SAD', 'AWFUL'][index % 5],
    createdAt: timestamp + index * 86_400_000,
    updatedAt: timestamp + index * 86_400_000,
    conflictOriginId: null,
  }));
  const entryTags = entries.flatMap((entry, index) => [
    { entryId: entry.entryId, tagId: tags[index % tags.length].tagId, createdAt: timestamp + index },
    { entryId: entry.entryId, tagId: tags[(index * 7 + 3) % tags.length].tagId, createdAt: timestamp + index },
  ]).sort((left, right) =>
    left.entryId.localeCompare(right.entryId) || left.tagId.localeCompare(right.tagId));
  const media = Array.from({ length: Math.floor(entryCount / 10) }, (_, index) => ({
    assetId: id('asset', index),
    ownerType: 'entry',
    ownerId: id('entry', index * 10),
    kind: 'photo',
    blobHash: hash(index + 1),
    mimeType: 'image/jpeg',
    byteSize: 1_500_000 + index,
    width: 1600,
    height: 1200,
    durationMs: null,
    createdAt: timestamp + index,
    updatedAt: timestamp + index,
  }));
  return {
    format: 'tackbok-snapshot',
    formatVersion: 2,
    vaultId: 'vault-synthetic-measurement',
    parentSnapshotIds: [],
    observedDeviceHeads: [{
      deviceId: 'device-synthetic-a',
      deviceSequence: 1,
      snapshotId: 'a'.repeat(64),
    }],
    authorDeviceId: 'device-synthetic-a',
    deviceSequence: 2,
    createdAt: timestamp,
    entries,
    tags,
    entryTags,
    prompts: Array.from({ length: 16 }, (_, index) => ({
      promptId: id('prompt', index),
      title: `Synthetic prompt ${index}`,
      createdAt: timestamp + index,
      updatedAt: timestamp + index,
      conflictOriginId: null,
    })),
    profile: {
      profileId: 'profile',
      displayName: 'Synthetic Person',
      photoAssetId: null,
      updatedAt: timestamp,
    },
    media,
    tombstones: [],
    conflicts: [],
  } as CanonicalV2;
}

function heapUsed(): number {
  return process.memoryUsage().heapUsed;
}

function maybeGc(): void {
  const runtime = globalThis as typeof globalThis & { Bun?: { gc?: (force?: boolean) => void } };
  runtime.Bun?.gc?.(true);
}

const count = Number(process.argv[2] ?? 2_000);
if (!Number.isSafeInteger(count) || count <= 0) throw new Error('entry count must be positive');

maybeGc();
const payload = buildRepresentativeSnapshot(count);
maybeGc();
const encodeHeapBefore = heapUsed();
const encodeStarted = performance.now();
const canonical = canonicalizeV2(payload);
const encodeMs = performance.now() - encodeStarted;
const encodeHeapAfter = heapUsed();
const canonicalBytes = Buffer.from(canonical, 'utf8');

const compressStarted = performance.now();
const gzipBytes = gzipSync(canonicalBytes, { level: 6 });
// RFC 1952 OS is metadata only. Normalize it for repeatable evidence output.
gzipBytes[9] = 255;
const compressMs = performance.now() - compressStarted;

maybeGc();
const decodeHeapBefore = heapUsed();
const decodeStarted = performance.now();
const decodedBytes = gunzipSync(gzipBytes);
const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodedBytes));
const recanonical = canonicalizeV2(decoded);
const decodeValidateMs = performance.now() - decodeStarted;
const decodeHeapAfter = heapUsed();

if (recanonical !== canonical) throw new Error('measurement snapshot failed round trip');

const report = {
  format: 'tackbok-v7-snapshot-measurement',
  formatVersion: 1,
  measuredAt: new Date().toISOString(),
  environment: {
    scope: 'host-only',
    runtime: `Bun ${Bun.version}`,
    platform: `${process.platform}-${process.arch}`,
  },
  fixture: {
    synthetic: true,
    entries: count,
    tags: 32,
    entryTags: count * 2,
    prompts: 16,
    mediaDescriptors: Math.floor(count / 10),
    targetBodyCharacters: 720,
  },
  bytes: {
    uncompressed: canonicalBytes.byteLength,
    gzipLevel6: gzipBytes.byteLength,
    compressionRatio: Number((canonicalBytes.byteLength / gzipBytes.byteLength).toFixed(2)),
    compressedMiB: Number((gzipBytes.byteLength / 1_048_576).toFixed(3)),
  },
  timingMs: {
    encodeCanonical: Number(encodeMs.toFixed(2)),
    gzip: Number(compressMs.toFixed(2)),
    gunzipParseAndRecanonicalize: Number(decodeValidateMs.toFixed(2)),
  },
  memoryBytes: {
    encodeRetainedHeapDelta: Math.max(0, encodeHeapAfter - encodeHeapBefore),
    decodeValidateRetainedHeapDelta: Math.max(0, decodeHeapAfter - decodeHeapBefore),
    processPeakRss: process.resourceUsage().maxRSS,
    qualification: 'Host process measurements; retained deltas are not peak transient heap and do not satisfy the physical-device gate.',
  },
};

console.log(JSON.stringify(report, null, 2));
