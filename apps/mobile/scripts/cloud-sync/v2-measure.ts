/**
 * Phase 0 (#185) measurements: snapshot size and merge/encode time, v1 versus
 * v2, for synthetic journals. Desktop Bun numbers only.
 *
 *   bun scripts/cloud-sync/v2-measure.ts [1000 5000 10000]
 *
 * Journal shape (assumed, typical of a gratitude journal): 70% of entries
 * have a title (10-60 characters), every entry has text (lognormal around
 * 400 characters, 40-4000), 80% a mood, 0-3 of 25 tags, 15% one to three
 * photos, 5% of entries deleted. History: three devices; each entry has 1-4
 * writes from 1-3 devices; 1% of entries have an open two-version conflict.
 * A sync merges two devices that each changed 1% of entries.
 */
import { encodeSnapshot } from '../../src/lib/cloudSync/snapshot/codec';
import { mergeSnapshotDomains } from '../../src/lib/cloudSync/snapshot/merge';
import type {
  JournalSnapshotPayload,
  SnapshotDomain,
  SnapshotEntry,
  SnapshotMedia,
} from '../../src/lib/cloudSync/snapshot/types';
import { sha256Text } from '../../src/lib/cloudSync/snapshot/sha256';
import {
  canonicalState,
  decodeEnvelope,
  encodeEnvelope,
} from '../../src/lib/cloudSync/v2/codec';
import { compact } from '../../src/lib/cloudSync/v2/compact';
import { namedId } from '../../src/lib/cloudSync/v2/ids';
import { join } from '../../src/lib/cloudSync/v2/join';
import type {
  EntryRecord,
  MediaDescriptor,
  Mood,
  NamedRecord,
  Stamp,
  SyncState,
} from '../../src/lib/cloudSync/v2/types';
import { Random } from './sim/random';

const VAULT = 'vault-measure';
const DEVICES = [
  '3f2a9c1e-0b7d-4c55-9a61-1d2e3f4a5b6c',
  '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  'b7e6d5c4-b3a2-4910-8f7e-6d5c4b3a2918',
];
const MOODS: Mood[] = ['AMAZING', 'HAPPY', 'OKAY', 'SAD', 'AWFUL'];
const WORDS =
  'today grateful morning coffee friend walk sun rain family dinner work quiet book music garden tea laugh call help kind small moment evening light home'.split(
    ' ',
  );
const T0 = 1_750_000_000_000;

function sentence(rng: Random, chars: number): string {
  let text = '';
  while (text.length < chars)
    text += `${rng.pick(WORDS)}${rng.chance(0.08) ? '. ' : ' '}`;
  return text.slice(0, chars).trim();
}

const uuid = (rng: Random) =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () =>
    rng.int(0, 15).toString(16),
  );

interface Journal {
  v1: SnapshotDomain;
  v2: SyncState;
}

function buildJournal(count: number, seed: number): Journal {
  const rng = new Random(seed);
  const tags = Array.from({ length: 25 }, (_, i) => `Tag ${i}`);
  let hlc = T0;
  const stamp = (): Stamp => [(hlc += rng.int(1, 600_000)), rng.pick(DEVICES)];
  const v1Entries: SnapshotEntry[] = [];
  const v1Media: SnapshotMedia[] = [];
  const v1Relations: SnapshotDomain['entryTags'] = [];
  const v1Tombstones: SnapshotDomain['tombstones'] = [];
  const v2Entries = new Map<string, EntryRecord>();
  const v2Media = new Map<string, MediaDescriptor>();
  const ctx: Record<string, number> = {};
  const bump = (vv: Record<string, number>, s: Stamp) => {
    vv[s[1]] = Math.max(vv[s[1]] ?? 0, s[0]);
    ctx[s[1]] = Math.max(ctx[s[1]] ?? 0, s[0]);
  };
  const v2Tags = new Map<string, NamedRecord>();
  for (const title of tags) {
    const s = stamp();
    const id = namedId('tag', VAULT, title);
    const vv = {};
    bump(vv, s);
    v2Tags.set(id, { id, vv, del: null, title: { s, v: title }, ext: {} });
  }
  const v1Tags = tags.map((title, i) => ({
    tagId: uuid(rng),
    title,
    createdAt: T0 + i,
    updatedAt: T0 + i,
    conflictOriginId: null,
  }));
  for (let index = 0; index < count; index++) {
    const entryId = uuid(rng);
    const title = rng.chance(0.7) ? sentence(rng, rng.int(10, 60)) : null;
    const length = Math.min(
      4000,
      Math.max(40, Math.round(Math.exp(6 + rng.next() * 1.2 - 0.6))),
    );
    const text = sentence(rng, length);
    const mood = rng.chance(0.8) ? rng.pick(MOODS) : null;
    const date = T0 + index * 86_400_000;
    const deleted = rng.chance(0.05);
    const tagIndexes = [
      ...new Set(Array.from({ length: rng.int(0, 3) }, () => rng.int(0, 24))),
    ];
    const photos = rng.chance(0.15) ? rng.int(1, 3) : 0;
    // v2 record: 1-4 writes from 1-3 devices.
    const vv: Record<string, number> = {};
    const born = stamp();
    bump(vv, born);
    const titleItems = [{ s: born, v: title }];
    const textItems = [{ s: born, v: text }];
    let moodItem = { s: born, v: mood };
    for (let edit = rng.int(0, 3); edit > 0; edit--) {
      const s = stamp();
      bump(vv, s);
      if (rng.chance(0.6)) textItems.splice(0, 1, { s, v: text });
      else moodItem = { s, v: mood };
    }
    if (rng.chance(0.01)) {
      const s = stamp();
      bump(vv, s);
      textItems.push({ s, v: `${text} (edited elsewhere)` });
    }
    textItems.sort((a, b) => a.s[0] - b.s[0]);
    const attachments = [];
    const assetIds: string[] = [];
    for (let p = 0; p < photos; p++) {
      const assetId = uuid(rng);
      const s = stamp();
      bump(vv, s);
      attachments.push({ id: assetId, s });
      assetIds.push(assetId);
      const descriptor: MediaDescriptor = {
        assetId,
        ownerType: 'entry',
        ownerId: entryId,
        kind: 'photo',
        blobHash: sha256Text(assetId),
        mimeType: 'image/jpeg',
        byteSize: rng.int(200_000, 3_000_000),
        width: 3024,
        height: 4032,
        durationMs: null,
        createdAt: date,
        ext: {},
      };
      v2Media.set(assetId, descriptor);
      if (!deleted) {
        const { ext: _ext, ...v1Descriptor } = descriptor;
        v1Media.push({ ...v1Descriptor, updatedAt: date });
      }
    }
    attachments.sort((a, b) => (a.id < b.id ? -1 : 1));
    const tagMembers = tagIndexes
      .map((i) => ({ id: namedId('tag', VAULT, tags[i]), s: born }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    let del = null;
    if (deleted) {
      const s = stamp();
      bump(vv, s);
      del = { at: s, seen: { ...vv }, ackSeen: null, ext: {} };
    }
    v2Entries.set(entryId, {
      id: entryId,
      vv,
      known: null,
      del,
      title: titleItems,
      text: textItems,
      mood: moodItem,
      date: { s: born, v: date },
      tags: tagMembers,
      attachments,
      order: null,
      split: null,
      ext: {},
    });
    if (deleted) {
      v1Tombstones.push({
        entityType: 'entry',
        entityId: entryId,
        baseStateHash: null,
        deletedStateHash: sha256Text(entryId),
        deletedByDeviceId: rng.pick(DEVICES),
        deletionSequence: index + 1,
      });
      continue;
    }
    v1Entries.push({
      entryId,
      title,
      content: text,
      mood,
      createdAt: date,
      updatedAt: date + 1000,
      conflictOriginId: null,
      ...(assetIds.length > 0 ? { attachmentOrder: [...assetIds].sort() } : {}),
    });
    for (const i of tagIndexes)
      v1Relations.push({ entryId, tagId: v1Tags[i].tagId, createdAt: date });
  }
  const roster = Object.fromEntries(DEVICES.map((d) => [d, ctx[d] ?? T0]));
  return {
    v1: {
      entries: v1Entries,
      tags: v1Tags,
      entryTags: v1Relations,
      prompts: [],
      profile: {
        profileId: 'profile',
        displayName: 'Mehra',
        photoAssetId: null,
        updatedAt: T0,
      },
      media: v1Media,
      tombstones: v1Tombstones,
      conflicts: [],
    },
    v2: {
      vaultId: VAULT,
      ctx,
      roster,
      // Every device has published everything, so compaction can run.
      acks: Object.fromEntries(DEVICES.map((d) => [d, ctx])),
      floor: null,
      entries: v2Entries,
      tags: v2Tags,
      prompts: new Map(),
      profile: {
        vv: { [DEVICES[0]]: T0 },
        name: [{ s: [T0, DEVICES[0]], v: 'Mehra' }],
        photo: [],
        ext: {},
      },
      media: v2Media,
    },
  };
}

/** Two devices' copies that each changed 1% of entries since they last synced. */
function diverge(journal: Journal, seed: number) {
  const rng = new Random(seed);
  const ids = [...journal.v2.entries.keys()];
  const change = (device: string, offset: number) => {
    const entries = new Map(journal.v2.entries);
    const ctx = { ...journal.v2.ctx };
    let hlc = Math.max(...Object.values(ctx)) + offset;
    for (let i = 0; i < Math.ceil(ids.length / 100); i++) {
      const id = rng.pick(ids);
      const entry = entries.get(id)!;
      const s: Stamp = [++hlc, device];
      ctx[device] = hlc;
      entries.set(id, {
        ...entry,
        vv: { ...entry.vv, [device]: hlc },
        mood: { s, v: 'HAPPY' },
      });
    }
    return {
      ...journal.v2,
      ctx,
      entries,
      roster: { ...journal.v2.roster, [device]: hlc },
    };
  };
  const v1Change = () => {
    const entries = journal.v1.entries.map((entry) =>
      rng.chance(0.01)
        ? { ...entry, mood: 'HAPPY' as const, updatedAt: entry.updatedAt + 5 }
        : entry,
    );
    return { ...journal.v1, entries };
  };
  return {
    v2: [change(DEVICES[1], 10), change(DEVICES[2], 20)] as const,
    v1: [v1Change(), v1Change()] as const,
  };
}

function time<T>(run: () => T, repeat = 5): { ms: number; value: T } {
  run(); // warm up
  const start = performance.now();
  let value!: T;
  for (let i = 0; i < repeat; i++) value = run();
  return { ms: (performance.now() - start) / repeat, value };
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(0)} KiB`;
const ms = (value: number) => `${value.toFixed(0)} ms`;

function v1Payload(domain: SnapshotDomain): JournalSnapshotPayload {
  return {
    format: 'tackbok-snapshot',
    vaultId: VAULT,
    parentSnapshotIds: [],
    observedDeviceHeads: [],
    authorDeviceId: DEVICES[0],
    deviceSequence: 1,
    createdAt: T0,
    ...domain,
  };
}

const sizes = process.argv.slice(2).map(Number);
const rows: string[] = [];
for (const count of sizes.length > 0 ? sizes : [1_000, 5_000, 10_000]) {
  const journal = buildJournal(count, count);
  const v1Encoded = time(() => encodeSnapshot(v1Payload(journal.v1)), 3);
  const v2Encoded = time(
    () =>
      encodeEnvelope(journal.v2, {
        authorDeviceId: DEVICES[0],
        deviceSequence: 1,
        createdAt: T0,
      }),
    3,
  );
  const v2Decoded = time(() => decodeEnvelope(v2Encoded.value.bytes), 3);
  const { v1, v2 } = diverge(journal, count + 1);
  // Each device's copy comes from its own download: no shared objects.
  const [left, right] = v2.map((state) => structuredClone(state));
  const [base1, left1, right1] = [journal.v1, ...v1].map((domain) =>
    structuredClone(domain),
  );
  const v1Merge = time(() => mergeSnapshotDomains(base1, left1, right1), 3);
  const v2Join = time(() => join(left, right), 3);
  const v2Canonical = time(() => canonicalState(v2Join.value), 3);
  const v1Bytes = v1Encoded.value.canonicalBytes.length;
  const v2Body = v2Encoded.value.bodyCanonical.length;
  const v2Header = v2Encoded.value.bytes.indexOf(0x0a);
  // After compaction: deleted entries keep only their vector and tombstone.
  const compacted = encodeEnvelope(compact(journal.v2), {
    authorDeviceId: DEVICES[0],
    deviceSequence: 1,
    createdAt: T0,
  });
  const textBytes = journal.v1.entries.reduce(
    (sum, e) => sum + (e.title?.length ?? 0) + (e.content?.length ?? 0),
    0,
  );
  rows.push(
    `| ${count.toLocaleString('en')} | ${kib(textBytes)} | ${kib(v1Bytes)} | ${kib(v1Encoded.value.compressedBytes.length)} | ${kib(v2Body + v2Header)} | ${kib(v2Encoded.value.bytes.length)} | ${kib(compacted.bytes.length)} | ${ms(v1Encoded.ms)} | ${ms(v2Encoded.ms)} | ${ms(v2Decoded.ms)} | ${ms(v1Merge.ms)} | ${ms(v2Join.ms)} | ${ms(v2Canonical.ms)} |`,
  );
}
console.log(
  '| Entries | Authored text | v1 raw | v1 gzip | v2 raw | v2 gzip | v2 gzip, deleted records compacted | v1 encode | v2 encode | v2 decode | v1 merge | v2 join | v2 canonical |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) console.log(row);
