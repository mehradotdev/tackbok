import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import {
  canonicalizeJsonV1,
  type CanonicalJsonValue,
} from '../../src/lib/cloudSync/protocol/canonicalJsonV1';

const versionCount = Number(process.argv[2] ?? 50_000);
const versionsPerEntity = 10;
const pageSize = 1_000;
const payload = 'x'.repeat(768);

if (!Number.isSafeInteger(versionCount) || versionCount <= 0) {
  throw new Error('version count must be a positive safe integer');
}

type StoredVersion = {
  body: string;
  hash: string;
};

function sha256(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function heapMiB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

const startedAt = performance.now();
let peakHeapMiB = heapMiB();
const stored: StoredVersion[] = [];
const previousByEntity = new Map<string, string>();

for (let index = 0; index < versionCount; index += 1) {
  const entityNumber = Math.floor(index / versionsPerEntity);
  const entityId = `entry-${entityNumber.toString().padStart(5, '0')}`;
  const previous = previousByEntity.get(entityId);
  const value: CanonicalJsonValue = {
    authorDeviceId: 'phase0-host-probe',
    authorSequence: index + 1,
    entityId,
    entityType: 'entry',
    formatVersion: 1,
    kind: 'edit',
    parents: previous ? [previous] : [],
    state: {
      assets: [],
      content: `${payload}-${index}`,
      mood: null,
      tags: [],
      title: `Entry ${index}`,
    },
    timestampMs: 1_700_000_000_000 + index,
    vaultId: 'phase0-scale-vault',
  };
  const body = canonicalizeJsonV1(value);
  const hash = sha256(body);
  stored.push({ body, hash });
  previousByEntity.set(entityId, hash);
  if (index % pageSize === 0) peakHeapMiB = Math.max(peakHeapMiB, heapMiB());
}

const generatedAt = performance.now();

// Simulate an app kill halfway through a listing page. Only completed-page
// checkpoints survive, so resume replays the partial page and no more.
const crashPageStart = Math.floor(versionCount / pageSize / 2) * pageSize;
const deliveredBeforeCrash = Math.min(crashPageStart + pageSize / 2, versionCount);
const persistedCheckpoint = crashPageStart;
const replayedObjects = deliveredBeforeCrash - persistedCheckpoint;

const knownHashes = new Set<string>();
const referencedParents = new Set<string>();
let verifiedBytes = 0;
for (let start = 0; start < stored.length; start += pageSize) {
  const page = stored.slice(start, start + pageSize);
  for (const item of page) {
    if (sha256(item.body) !== item.hash) throw new Error(`hash mismatch at ${start}`);
    const parsed = JSON.parse(item.body) as { parents: string[] };
    knownHashes.add(item.hash);
    for (const parent of parsed.parents) referencedParents.add(parent);
    verifiedBytes += Buffer.byteLength(item.body, 'utf8');
  }
  peakHeapMiB = Math.max(peakHeapMiB, heapMiB());
}

for (const parent of referencedParents) {
  if (!knownHashes.has(parent)) throw new Error(`missing generated parent ${parent}`);
}

const heads = [...knownHashes].filter((hash) => !referencedParents.has(hash));
const finishedAt = performance.now();
const expectedHeads = Math.ceil(versionCount / versionsPerEntity);
if (heads.length !== expectedHeads) {
  throw new Error(`expected ${expectedHeads} heads, found ${heads.length}`);
}

console.log(
  JSON.stringify(
    {
      kind: 'host-sizing-only-not-a-phase0-device-result',
      versions: versionCount,
      entities: expectedHeads,
      pageSize,
      verifiedBytes,
      generationMs: Math.round(generatedAt - startedAt),
      verificationAndAncestryMs: Math.round(finishedAt - generatedAt),
      totalMs: Math.round(finishedAt - startedAt),
      observedHeapMiB: Number(peakHeapMiB.toFixed(1)),
      interruptedDiscovery: {
        persistedCheckpoint,
        deliveredBeforeCrash,
        replayedObjects,
        replayedPagesMaximum: replayedObjects <= pageSize ? 1 : 2,
      },
    },
    null,
    2,
  ),
);
