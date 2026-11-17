/**
 * Cloud sync v2 (#185, P5) measurements on real SQLite: capture, join,
 * encode, decode and apply for a 10,000-entry journal. Desktop Bun numbers.
 * Opt-in, since it takes a while:
 *
 *   SYNC_MEASURE=1 bun test scripts/cloud-sync/v2-store-measure.test.ts
 *
 * Journal shape as in `v2-measure.ts`: 70% of entries titled, text around
 * 400 characters, 80% with a mood, 0-3 of 25 tags, 15% with one to three
 * photos, 5% deleted. Device A holds it; device B starts empty (a restore),
 * then both edit 1% of entries and sync once more.
 */
import { expect, test } from 'bun:test';

import { installSqliteDevices, type SqliteDevice } from './sim/sqliteDevices';
import { Random } from './sim/random';

const devices = installSqliteDevices();
const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const store = await import('../../src/lib/cloudSync/storage/v2State');
const { decodeEnvelope, encodeEnvelope } =
  await import('../../src/lib/cloudSync/v2/codec');
const { absorb, compact } = await import('../../src/lib/cloudSync/v2/compact');
const ops = await import('../../src/lib/cloudSync/v2/ops');
const { simMediaFiles } = await import('./sim/v2StoreAdapter');

interface EntryRow {
  note_id: string;
  text_title: string | null;
  text_content: string | null;
  mood: null;
  tags: string;
  assets: string | null;
  created_at: number;
  updated_at: number;
}

const COUNT = Number(process.env.SYNC_MEASURE_ENTRIES ?? 10_000);
const VAULT = 'vault-measure';
const T = 1_790_000_000_000;
const MOODS = ['AMAZING', 'HAPPY', 'OKAY', 'SAD', 'AWFUL'];
const WORDS =
  'today grateful morning coffee friend walk sun rain family dinner work quiet book music garden tea laugh call help kind small moment evening light home'.split(
    ' ',
  );

function sentence(rng: Random, chars: number): string {
  let text = '';
  while (text.length < chars)
    text += `${rng.pick(WORDS)}${rng.chance(0.08) ? '. ' : ' '}`;
  return text.slice(0, chars).trim();
}

async function time<T>(
  label: string,
  results: Record<string, number>,
  run: () => Promise<T> | T,
) {
  const start = performance.now();
  const value = await run();
  results[label] = Math.round(performance.now() - start);
  return value;
}

function fill(device: SqliteDevice, rng: Random) {
  const sqlite = device.sqlite;
  sqlite.exec('BEGIN');
  for (let i = 0; i < 25; i++)
    sqlite.run(
      'INSERT INTO tags (tag_id, title, created_at, updated_at) VALUES (?, ?, 1, 1)',
      [`t${i}`, `Tag ${i}`],
    );
  for (let index = 0; index < COUNT; index++) {
    const id = `entry-${String(index).padStart(5, '0')}`;
    const length = Math.min(
      4000,
      Math.max(40, Math.round(Math.exp(6 + rng.next() * 1.2 - 0.6))),
    );
    const tagIds = [
      ...new Set(Array.from({ length: rng.int(0, 3) }, () => `t${rng.int(0, 24)}`)),
    ].sort();
    const photos = rng.chance(0.15) ? rng.int(1, 3) : 0;
    const assets = Array.from({ length: photos }, (_, p) => ({
      type: 'image',
      uri: `photos/${id}-${p}.jpg`,
      assetId: `${id}-photo-${p}`,
    }));
    sqlite.run(
      'INSERT INTO entries (note_id, text_title, text_content, mood, tags, assets, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        rng.chance(0.7) ? sentence(rng, rng.int(10, 60)) : null,
        sentence(rng, length),
        rng.chance(0.8) ? rng.pick(MOODS) : null,
        tagIds.join(','),
        JSON.stringify(assets),
        T - index * 86_400_000,
        T,
      ],
    );
    for (const tagId of tagIds)
      sqlite.run(
        'INSERT INTO entry_tags (note_id, tag_id, created_at, updated_at) VALUES (?, ?, 1, 1)',
        [id, tagId],
      );
    for (const asset of assets)
      sqlite.run(
        `INSERT INTO media_assets (asset_id, owner_type, owner_id, kind, local_uri, download_state, mime_type, byte_size, width, height, blob_hash, created_at, updated_at)
         VALUES (?, 'entry', ?, 'photo', ?, 'verified', 'image/jpeg', 250000, 1200, 1600, ?, 1, 1)`,
        [
          asset.assetId,
          id,
          asset.uri,
          Bun.hash(asset.assetId).toString(16).padStart(64, '0').slice(0, 64),
        ],
      );
  }
  sqlite.run(
    "INSERT OR REPLACE INTO user_profile (profile_id, display_name, updated_at) VALUES ('self', 'Sam', 1)",
  );
  sqlite.exec('COMMIT');
}

test.skipIf(!process.env.SYNC_MEASURE)(
  `capture, join, encode and apply of a ${COUNT}-entry journal`,
  async () => {
    const rng = new Random(7);
    const a = devices.create();
    const b = devices.create();
    const results: Record<string, number> = {};
    const on = <T>(device: SqliteDevice, wall: number, run: () => Promise<T>) =>
      devices.on(device, wall, run);
    const txOn = <T>(
      device: SqliteDevice,
      wall: number,
      run: (
        tx: import('../../src/lib/cloudSync/storage/repositories').CloudSyncTransaction,
      ) => Promise<T>,
    ) => on(device, wall, () => repositories.runInCloudSyncTransaction(run));

    fill(a, rng);
    await time('rebuild (cutover) ms', results, () =>
      txOn(a, T, (tx) => store.rebuildSyncMetadataInTransaction(tx, VAULT, T)),
    );
    await time('publish attachments ms', results, () =>
      txOn(a, T + 1, async (tx) => {
        const pending = await store.unpublishedAttachmentsInTransaction(tx);
        return store.stampPublishedAttachmentsInTransaction(
          tx,
          new Set(pending.map((asset) => asset.assetId)),
          T + 1,
        );
      }),
    );
    // 5% deleted through the app's delete.
    for (let index = 0; index < COUNT; index += 20)
      await txOn(a, T + 2, (tx) =>
        repositories.deleteEntryInTransaction(
          tx,
          `entry-${String(index).padStart(5, '0')}`,
          {
            now: T + 2,
          },
        ),
      );
    await txOn(b, T, (tx) => store.rebuildSyncMetadataInTransaction(tx, VAULT, T));

    const capturedA = await time('capture A ms', results, () =>
      on(a, T + 3, store.captureSyncState),
    );
    const encodedA = await time('encode ms', results, () =>
      encodeEnvelope(capturedA.state, {
        authorDeviceId: capturedA.deviceId,
        deviceSequence: 1,
        createdAt: T + 3,
      }),
    );
    results['snapshot bytes'] = encodedA.bytes.length;
    results['body bytes (uncompressed)'] = encodedA.header.bodyBytes;
    const remote = await time(
      'decode ms',
      results,
      () => decodeEnvelope(encodedA.bytes, encodedA.snapshotId).state,
    );

    // B restores: everything is new to it.
    const capturedB = await time('capture B (empty) ms', results, () =>
      on(b, T + 4, store.captureSyncState),
    );
    const writerB = { device: capturedB.deviceId, wallMs: T + 4 };
    const joined = await time('join (restore) ms', results, () => {
      let next = absorb(capturedB.state, remote, writerB).state;
      if (ops.needsAck(next, writerB.device)) next = ops.markSeen(next, writerB);
      return compact(next);
    });
    const applied = await time('apply (restore, all entries) ms', results, () =>
      on(b, T + 4, () => store.applySyncState(capturedB, joined, simMediaFiles)),
    );
    expect(applied?.entries).toBe(COUNT);
    await time('capture B (full) ms', results, () =>
      on(b, T + 5, store.captureSyncState),
    );

    // Both edit 1%, then B takes in A's state again.
    for (let index = 1; index < COUNT; index += 100) {
      const id = `entry-${String(index).padStart(5, '0')}`;
      const row = a.sqlite
        .query('SELECT * FROM entries WHERE note_id = ?')
        .get(id) as EntryRow | null;
      if (row)
        await txOn(a, T + 6, (tx) =>
          repositories.upsertEntryInTransaction(
            tx,
            {
              ...row,
              assets: JSON.parse(row.assets ?? '[]'),
              text_content: `${row.text_content} (A)`,
            },
            { now: T + 6 },
          ),
        );
      const other = `entry-${String(index + 1).padStart(5, '0')}`;
      const rowB = b.sqlite
        .query('SELECT * FROM entries WHERE note_id = ?')
        .get(other) as EntryRow | null;
      if (rowB)
        await txOn(b, T + 6, (tx) =>
          repositories.upsertEntryInTransaction(
            tx,
            {
              ...rowB,
              assets: JSON.parse(rowB.assets ?? '[]'),
              text_content: `${rowB.text_content} (B)`,
            },
            { now: T + 6 },
          ),
        );
    }
    const capturedA2 = await on(a, T + 7, store.captureSyncState);
    const encodedA2 = encodeEnvelope(capturedA2.state, {
      authorDeviceId: capturedA2.deviceId,
      deviceSequence: 2,
      createdAt: T + 7,
    });
    const remote2 = decodeEnvelope(encodedA2.bytes, encodedA2.snapshotId).state;
    const capturedB2 = await time('capture B (incremental) ms', results, () =>
      on(b, T + 8, store.captureSyncState),
    );
    const joined2 = await time('join (1% each side) ms', results, () => {
      let next = absorb(capturedB2.state, remote2, writerB).state;
      if (ops.needsAck(next, writerB.device)) next = ops.markSeen(next, writerB);
      return compact(next);
    });
    const applied2 = await time('apply (1% each side) ms', results, () =>
      on(b, T + 8, () => store.applySyncState(capturedB2, joined2, simMediaFiles)),
    );
    expect(applied2!.entries).toBeGreaterThan(0);
    console.log(
      `v2 SQLite measurements, ${COUNT} entries (desktop, Bun ${Bun.version})`,
      JSON.stringify(results, null, 2),
    );
    a.sqlite.close();
    b.sqlite.close();
  },
  900_000,
);
