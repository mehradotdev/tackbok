/**
 * Cloud sync v2, step P5 (#185): capture and apply against real SQLite with
 * every migration (`storage/v2State.ts`). Two databases stand for two
 * devices; the join between them is the model's.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { installSqliteDevices, type SqliteDevice } from './sim/sqliteDevices';

const devices = installSqliteDevices();
const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const store = await import('../../src/lib/cloudSync/storage/v2State');
const { canonicalState, decodeEnvelope, encodeEnvelope } =
  await import('../../src/lib/cloudSync/v2/codec');
const { absorb, compact, isCompacted } =
  await import('../../src/lib/cloudSync/v2/compact');
const ops = await import('../../src/lib/cloudSync/v2/ops');
const { NAMED_ID } = await import('../../src/lib/cloudSync/v2/ids');
const { isLive, shownItems } = await import('../../src/lib/cloudSync/v2/view');
const { simMediaFiles } = await import('./sim/v2StoreAdapter');
const { AssetType } = await import('../../src/types');
type SyncState = import('../../src/lib/cloudSync/v2/types').SyncState;
type CloudSyncTransaction =
  import('../../src/lib/cloudSync/storage/repositories').CloudSyncTransaction;

const VAULT = 'vault-test';
const T = 1_790_000_000_000;
let a: SqliteDevice;
let b: SqliteDevice;

const write = <T>(
  device: SqliteDevice,
  wall: number,
  operation: (tx: CloudSyncTransaction) => Promise<T>,
) => devices.on(device, wall, () => repositories.runInCloudSyncTransaction(operation));
const capture = (device: SqliteDevice) =>
  devices.on(device, T + 1_000_000, store.captureSyncState);
const rows = <R>(device: SqliteDevice, sql: string, ...params: (string | number)[]) =>
  device.sqlite.query(sql).all(...params) as R[];
const deviceId = (device: SqliteDevice) =>
  (
    device.sqlite.query("SELECT device_id FROM sync_device WHERE id = 'self'").get() as {
      device_id: string;
    }
  ).device_id;

async function bind(device: SqliteDevice, wall = T) {
  await write(device, wall, (tx) =>
    store.rebuildSyncMetadataInTransaction(tx, VAULT, wall),
  );
}

/** What the engine does with another device's state, then the apply. */
async function syncFrom(device: SqliteDevice, other: SyncState, wall: number) {
  const captured = await capture(device);
  const writer = { device: captured.deviceId, wallMs: wall };
  let next = absorb(captured.state, other, writer).state;
  if (ops.needsAck(next, writer.device)) next = ops.markSeen(next, writer);
  next = compact(next);
  const applied = await devices.on(device, wall, () =>
    store.applySyncState(captured, next, simMediaFiles),
  );
  expect(applied).not.toBeNull();
  // Exact: capturing again gives the joined state back.
  expect(canonicalState((await capture(device)).state)).toBe(canonicalState(next));
  return next;
}

const entry = (id: string, fields: Record<string, unknown> = {}) => ({
  note_id: id,
  text_title: null,
  text_content: 'Text',
  mood: null,
  created_at: T,
  updated_at: T,
  tags: '',
  assets: [],
  ...fields,
});
const photo = (n: number) => ({
  type: AssetType.IMAGE,
  uri: `photos/${n}.jpg`,
  assetId: `asset-${n}`,
});
const hashMedia = (device: SqliteDevice) =>
  device.sqlite.run(
    "UPDATE media_assets SET blob_hash = substr(lower(hex(asset_id)) || '0000000000000000000000000000000000000000000000000000000000000000', 1, 64), byte_size = 10 WHERE blob_hash IS NULL",
  );
async function publish(device: SqliteDevice, wall: number) {
  hashMedia(device);
  await write(device, wall, async (tx) => {
    const pending = await store.unpublishedAttachmentsInTransaction(tx);
    return store.stampPublishedAttachmentsInTransaction(
      tx,
      new Set(pending.map((asset) => asset.assetId)),
      wall,
    );
  });
}

beforeEach(async () => {
  a = devices.create();
  b = devices.create();
  await bind(a);
  await bind(b);
});
afterEach(() => {
  a.sqlite.close();
  b.sqlite.close();
});

describe('capture', () => {
  test('a whole journal round-trips through the envelope and an apply changes nothing', async () => {
    const tagId = await write(a, T, (tx) =>
      repositories.createTagInTransaction(tx, 'Work'),
    );
    const gone = await write(a, T, (tx) =>
      repositories.createTagInTransaction(tx, 'Old'),
    );
    await write(a, T + 1, (tx) =>
      repositories.upsertEntryInTransaction(
        tx,
        entry('e1', {
          text_title: 'One',
          mood: 'HAPPY',
          tags: tagId,
          assets: [photo(2), photo(1)],
        }),
        { now: T + 1 },
      ),
    );
    await write(a, T + 2, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e2', { assets: [photo(3)] }), {
        now: T + 2,
      }),
    );
    await write(a, T + 3, (tx) =>
      repositories.createPromptInTransaction(tx, 'Three good things'),
    );
    await write(a, T + 4, (tx) =>
      repositories.updateProfileInTransaction(
        tx,
        { displayName: 'Sam', photoUri: 'photos/me.jpg', photoAssetId: 'me' },
        { now: T + 4 },
      ),
    );
    await publish(a, T + 5);
    await write(a, T + 6, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e2', { now: T + 6 }),
    );
    await write(a, T + 7, (tx) =>
      repositories.deleteTagInTransaction(tx, gone, { now: T + 7 }),
    );

    const captured = await capture(a);
    const state = captured.state;
    expect([...state.entries.keys()].sort()).toEqual(['e1', 'e2']);
    expect(isLive(state.entries.get('e2')!)).toBe(false);
    // The deleted entry keeps its values and its published photo.
    expect(state.entries.get('e2')!.attachments.map((member) => member.id)).toEqual([
      'asset-3',
    ]);
    expect(state.media.has('asset-3')).toBe(true);
    expect(state.entries.get('e1')!.order?.v).toEqual(['asset-2', 'asset-1']);
    expect(state.tags.get(gone)!.del).not.toBeNull();
    expect(
      [...state.tags.keys(), ...state.prompts.keys()].every((id) => NAMED_ID.test(id)),
    ).toBe(true);
    expect(state.profile.photo.map((item) => item.v)).toEqual(['me']);

    const encoded = encodeEnvelope(state, {
      authorDeviceId: captured.deviceId,
      deviceSequence: 1,
      createdAt: T + 8,
    });
    const decoded = decodeEnvelope(encoded.bytes, encoded.snapshotId).state;
    expect(canonicalState(decoded)).toBe(canonicalState(state));
    const result = await devices.on(a, T + 9, () =>
      store.applySyncState(captured, decoded, simMediaFiles),
    );
    expect(result).toEqual({ entries: 0, tags: 0, prompts: 0, profile: false });
    expect(canonicalState((await capture(a)).state)).toBe(canonicalState(state));
  });

  test('an attachment is in the state only once it is published', async () => {
    await write(a, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { assets: [photo(1)] }), {
        now: T,
      }),
    );
    expect((await capture(a)).state.media.size).toBe(0);
    // No blob hash yet: not publishable.
    expect(
      await write(a, T + 1, (tx) =>
        store.stampPublishedAttachmentsInTransaction(tx, new Set(['asset-1']), T + 1),
      ),
    ).toBe(0);
    await publish(a, T + 2);
    const state = (await capture(a)).state;
    expect(state.entries.get('e1')!.attachments.map((member) => member.id)).toEqual([
      'asset-1',
    ]);
    // The publication is a write: the attach's stamp is in the entry's vector.
    const s = state.entries.get('e1')!.attachments[0].s;
    expect(state.entries.get('e1')!.vv[s[1]]).toBe(s[0]);
  });
});

describe('apply', () => {
  test('concurrent edits become versions beside the shown value, and an edit replaces only the shown one', async () => {
    await write(a, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { text_content: 'Base' }), {
        now: T,
      }),
    );
    await syncFrom(b, (await capture(a)).state, T + 1);
    await write(a, T + 2, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { text_content: 'From A' }), {
        now: T + 2,
      }),
    );
    await write(b, T + 3, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { text_content: 'From B' }), {
        now: T + 3,
      }),
    );
    const joined = await syncFrom(a, (await capture(b)).state, T + 4);
    expect(shownItems(joined.entries.get('e1')!.text).map((item) => item.v)).toEqual([
      'From B',
      'From A',
    ]);
    expect(rows(a, 'SELECT text_content FROM entries')).toEqual([
      { text_content: 'From B' },
    ]);
    expect(
      rows(a, "SELECT value_json FROM sync_field_values WHERE field = 'text'"),
    ).toEqual([{ value_json: '"From A"' }]);

    // Editing the shown text leaves the other version open.
    await write(a, T + 5, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { text_content: 'Edited' }), {
        now: T + 5,
      }),
    );
    const edited = (await capture(a)).state.entries.get('e1')!;
    expect(shownItems(edited.text).map((item) => item.v)).toEqual(['Edited', 'From A']);

    // "Keep this one": a model write through the apply replaces both.
    const captured = await capture(a);
    const chosen = shownItems(edited.text)[1];
    const kept = ops.keepValue(
      captured.state,
      { device: captured.deviceId, wallMs: T + 6 },
      'e1',
      'text',
      chosen.s,
    );
    await devices.on(a, T + 6, () => store.applySyncState(captured, kept, simMediaFiles));
    expect(rows(a, 'SELECT text_content FROM entries')).toEqual([
      { text_content: 'From A' },
    ]);
    expect(rows(a, 'SELECT * FROM sync_field_values')).toEqual([]);
  });

  test('a remote delete keeps the values; an unseen edit brings the entry back with its photo', async () => {
    await write(a, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { assets: [photo(1)] }), {
        now: T,
      }),
    );
    await publish(a, T + 1);
    await syncFrom(b, (await capture(a)).state, T + 2);
    expect(rows(b, 'SELECT asset_id, download_state FROM media_assets')).toEqual([
      { asset_id: 'asset-1', download_state: 'pending' },
    ]);
    await write(b, T + 3, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: T + 3 }),
    );
    await write(a, T + 4, (tx) =>
      repositories.upsertEntryInTransaction(
        tx,
        entry('e1', { text_content: 'Edited', assets: [photo(1)] }),
        { now: T + 4 },
      ),
    );
    // A sees B's delete, but its edit was unseen: the entry stays.
    await syncFrom(a, (await capture(b)).state, T + 5);
    expect(rows(a, 'SELECT text_content FROM entries')).toEqual([
      { text_content: 'Edited' },
    ]);
    // B had it deleted: the rows go, the values stay behind the tombstone.
    expect(rows(b, 'SELECT note_id FROM entries')).toEqual([]);
    expect(rows(b, 'SELECT entity_id FROM sync_deleted_records')).toEqual([
      { entity_id: 'e1' },
    ]);
    const back = await syncFrom(b, (await capture(a)).state, T + 6);
    expect(isLive(back.entries.get('e1')!)).toBe(true);
    expect(rows(b, 'SELECT text_content FROM entries')).toEqual([
      { text_content: 'Edited' },
    ]);
    expect(rows(b, 'SELECT asset_id, download_state FROM media_assets')).toEqual([
      { asset_id: 'asset-1', download_state: 'pending' },
    ]);
    expect(rows(b, 'SELECT * FROM sync_deleted_records')).toEqual([]);
  });

  test('an attachment not published yet stays when another device edits its entry', async () => {
    await write(a, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { assets: [photo(1)] }), {
        now: T,
      }),
    );
    await publish(a, T + 1);
    await syncFrom(b, (await capture(a)).state, T + 2);
    await write(a, T + 3, (tx) =>
      repositories.upsertEntryInTransaction(
        tx,
        entry('e1', { assets: [photo(1), photo(2)] }),
        {
          now: T + 3,
        },
      ),
    );
    await write(b, T + 4, (tx) =>
      repositories.upsertEntryInTransaction(
        tx,
        entry('e1', {
          text_content: 'B',
          assets: [{ ...photo(1), uri: 'photos/asset-1.jpg' }],
        }),
        { now: T + 4 },
      ),
    );
    await syncFrom(a, (await capture(b)).state, T + 5);
    const [row] = rows<{ text_content: string; assets: string }>(
      a,
      'SELECT text_content, assets FROM entries',
    );
    expect(row.text_content).toBe('B');
    expect(
      JSON.parse(row.assets).map((asset: { assetId: string }) => asset.assetId),
    ).toEqual(['asset-1', 'asset-2']);
    expect(rows(a, 'SELECT asset_id FROM media_assets ORDER BY asset_id')).toEqual([
      { asset_id: 'asset-1' },
      { asset_id: 'asset-2' },
    ]);
  });

  test('nothing is written when the journal changed after the capture', async () => {
    await write(a, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1'), { now: T }),
    );
    await write(b, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e2'), { now: T }),
    );
    const captured = await capture(a);
    const joined = absorb(captured.state, (await capture(b)).state, {
      device: captured.deviceId,
      wallMs: T + 1,
    }).state;
    await write(a, T + 2, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e3'), { now: T + 2 }),
    );
    const result = await devices.on(a, T + 3, () =>
      store.applySyncState(captured, joined, simMediaFiles),
    );
    expect(result).toBeNull();
    expect(rows(a, 'SELECT note_id FROM entries ORDER BY note_id')).toEqual([
      { note_id: 'e1' },
      { note_id: 'e3' },
    ]);
  });

  test('a refused apply discards the files it copied, all under the media lock', async () => {
    await write(b, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { assets: [photo(1)] }), {
        now: T,
      }),
    );
    await publish(b, T + 1);
    const captured = await capture(a);
    const joined = absorb(captured.state, (await capture(b)).state, {
      device: captured.deviceId,
      wallMs: T + 2,
    }).state;
    await write(a, T + 3, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e2'), { now: T + 3 }),
    );
    const calls: string[] = [];
    let locked = false;
    const files = {
      async materialize(media: readonly { assetId: string }[], created: string[]) {
        calls.push(`materialize:${locked}`);
        created.push(...media.map((asset) => `photos/${asset.assetId}.jpg`));
        return new Map(
          media.map((asset) => [
            asset.assetId,
            { uri: `photos/${asset.assetId}.jpg`, verified: true },
          ]),
        );
      },
      async discard(created: readonly string[]) {
        calls.push(`discard:${locked}:${created.join(',')}`);
      },
      async serialize<R>(operation: () => Promise<R>) {
        locked = true;
        try {
          return await operation();
        } finally {
          locked = false;
        }
      },
    };
    const result = await devices.on(a, T + 4, () =>
      store.applySyncState(captured, joined, files),
    );
    expect(result).toBeNull();
    expect(calls).toEqual(['materialize:true', 'discard:true:photos/asset-1.jpg']);
    expect(rows(a, 'SELECT asset_id FROM media_assets')).toEqual([]);
  });

  test('a compacted entry keeps only its vector and tombstone', async () => {
    await write(a, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1'), { now: T }),
    );
    await syncFrom(b, (await capture(a)).state, T + 1);
    await syncFrom(a, (await capture(b)).state, T + 2);
    await write(a, T + 3, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: T + 3 }),
    );
    await syncFrom(b, (await capture(a)).state, T + 4);
    // Both have now acknowledged the delete: compaction drops the values.
    const state = await syncFrom(a, (await capture(b)).state, T + 5);
    expect(isCompacted(state.entries.get('e1')!)).toBe(true);
    expect(rows(a, 'SELECT * FROM sync_deleted_records')).toEqual([]);
    expect(rows(a, "SELECT known_json FROM sync_records WHERE entity_id = 'e1'")).toEqual(
      [{ known_json: '{"vv":{},"extra":[]}' }],
    );
  });
});

describe('review cases', () => {
  test('an entry v1 wrote without v2 metadata can be edited and deleted before binding', async () => {
    const fresh = devices.create();
    try {
      fresh.sqlite.run(
        "INSERT INTO entries (note_id, text_content, tags, created_at, updated_at) VALUES ('e1', 'From v1', '', 5, 5)",
      );
      await write(fresh, T, (tx) =>
        repositories.upsertEntryInTransaction(
          tx,
          entry('e1', { text_content: 'Edited' }),
          { now: T },
        ),
      );
      await write(fresh, T + 1, (tx) =>
        repositories.deleteEntryInTransaction(tx, 'e1', { now: T + 1 }),
      );
      expect(rows(fresh, 'SELECT note_id FROM entries')).toEqual([]);
    } finally {
      fresh.sqlite.close();
    }
  });

  test('after the cutover, an attachment both devices hold is published once and kept', async () => {
    for (const device of [a, b]) {
      device.sqlite.run(
        `INSERT INTO entries (note_id, text_content, tags, assets, created_at, updated_at)
         VALUES ('e1', 'Shared', '', '[{"type":"image","uri":"photos/x.jpg","assetId":"x"}]', 5, 5)`,
      );
      device.sqlite.run(
        `INSERT INTO media_assets (asset_id, owner_type, owner_id, kind, local_uri, blob_hash, byte_size, created_at, updated_at)
         VALUES ('x', 'entry', 'e1', 'photo', 'photos/x.jpg', ?, 10, 5, 5)`,
        ['a'.repeat(64)],
      );
      await bind(device, T + 10);
    }
    await publish(a, T + 11);
    await syncFrom(b, (await capture(a)).state, T + 12);
    expect(rows(b, 'SELECT stamp_hlc FROM media_assets')).toEqual([
      { stamp_hlc: T + 11 },
    ]);
    const joined = await syncFrom(a, (await capture(b)).state, T + 13);
    expect(joined.entries.get('e1')!.attachments.map((member) => member.id)).toEqual([
      'x',
    ]);
    expect(rows(a, 'SELECT asset_id FROM media_assets')).toEqual([{ asset_id: 'x' }]);
  });

  test('a remote delete never gives up the only copy of an attachment not published yet', async () => {
    await write(a, T, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1'), { now: T }),
    );
    await syncFrom(b, (await capture(a)).state, T + 1);
    // A attaches a photo; its upload waits (Wi-Fi only), but the entry's
    // write is published, and B deletes the entry having seen it.
    await write(a, T + 2, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { assets: [photo(1)] }), {
        now: T + 2,
      }),
    );
    await syncFrom(b, (await capture(a)).state, T + 3);
    await write(b, T + 4, (tx) =>
      repositories.deleteEntryInTransaction(tx, 'e1', { now: T + 4 }),
    );
    await syncFrom(a, (await capture(b)).state, T + 5);
    expect(rows(a, 'SELECT note_id FROM entries')).toEqual([]);
    // The row, and so the file, stay; nothing hands it to the reaper.
    expect(rows(a, 'SELECT asset_id, stamp_hlc FROM media_assets')).toEqual([
      { asset_id: 'asset-1', stamp_hlc: null },
    ]);
    expect(rows(a, 'SELECT asset_id FROM sync_retained_media')).toEqual([]);
  });

  test('a deleted tag shown only for an entry goes once no entry uses it', async () => {
    const tagId = await write(a, T, (tx) =>
      repositories.createTagInTransaction(tx, 'Work'),
    );
    await write(a, T + 1, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e1', { tags: tagId }), {
        now: T + 1,
      }),
    );
    await syncFrom(b, (await capture(a)).state, T + 2);
    // B deletes the tag while A adds it to another entry: the add keeps it shown.
    await write(b, T + 3, (tx) =>
      repositories.deleteTagInTransaction(tx, tagId, { now: T + 3 }),
    );
    await write(a, T + 4, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e2', { tags: tagId }), {
        now: T + 4,
      }),
    );
    await syncFrom(a, (await capture(b)).state, T + 5);
    expect(rows(a, 'SELECT tag_id FROM tags')).toEqual([{ tag_id: tagId }]);
    // A takes it off e2 and B's next change arrives: the tag row goes.
    await write(a, T + 6, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e2'), { now: T + 6 }),
    );
    await write(b, T + 7, (tx) =>
      repositories.upsertEntryInTransaction(tx, entry('e3'), { now: T + 7 }),
    );
    await syncFrom(a, (await capture(b)).state, T + 8);
    expect(rows(a, 'SELECT tag_id FROM tags')).toEqual([]);
  });
});

describe('rebuild', () => {
  test('binding to a vault gives a new device ID, title-derived IDs and one initial stamp', async () => {
    const before = deviceId(a);
    // Rows as v1 or an import left them: random IDs, no v2 metadata.
    a.sqlite.run(
      "INSERT INTO tags (tag_id, title, created_at, updated_at) VALUES ('legacy-tag', 'Family', 1, 1)",
    );
    a.sqlite.run(
      "INSERT INTO custom_prompts (prompt_id, title, created_at, updated_at) VALUES ('legacy-prompt', 'Why?', 1, 1)",
    );
    a.sqlite.run(
      `INSERT INTO entries (note_id, text_content, tags, assets, created_at, updated_at)
       VALUES ('e1', 'Hi', 'legacy-tag', '[{"type":"image","uri":"photos/b.jpg","assetId":"b"},{"type":"image","uri":"photos/a.jpg","assetId":"a"}]', 5, 5)`,
    );
    a.sqlite.run(
      "INSERT INTO entry_tags (note_id, tag_id, created_at, updated_at) VALUES ('e1', 'legacy-tag', 5, 5)",
    );
    for (const id of ['a', 'b'])
      a.sqlite.run(
        `INSERT INTO media_assets (asset_id, owner_type, owner_id, kind, local_uri, blob_hash, byte_size, created_at, updated_at, stamp_hlc, stamp_device)
         VALUES (?, 'entry', 'e1', 'photo', ?, ?, 10, 5, 5, 3, 'old-device')`,
        [id, `photos/${id}.jpg`, id.repeat(64)],
      );
    await bind(a, T + 10);
    expect(deviceId(a)).not.toBe(before);
    const [tag] = rows<{ tag_id: string }>(a, 'SELECT tag_id FROM tags');
    expect(tag.tag_id).toMatch(NAMED_ID);
    expect(rows(a, 'SELECT tags FROM entries')).toEqual([{ tags: tag.tag_id }]);
    expect(rows(a, 'SELECT tag_id FROM entry_tags')).toEqual([{ tag_id: tag.tag_id }]);
    expect(
      rows<{ prompt_id: string }>(a, 'SELECT prompt_id FROM custom_prompts')[0].prompt_id,
    ).toMatch(NAMED_ID);
    // Attachments are published again under this vault's stamps.
    expect(
      rows(a, 'SELECT stamp_hlc FROM media_assets WHERE stamp_hlc IS NOT NULL'),
    ).toEqual([]);
    const state = (await capture(a)).state;
    expect(state.vaultId).toBe(VAULT);
    expect(state.ctx).toEqual({ [deviceId(a)]: T + 10 });
    // The order other devices would not show by default is written.
    expect(state.entries.get('e1')!.order?.v).toEqual(['b', 'a']);
    expect(() => canonicalState(state)).not.toThrow();
  });

  test('a capture before binding refuses rather than guess', async () => {
    const fresh = devices.create();
    try {
      await expect(capture(fresh)).rejects.toThrow('sync-metadata-unbound');
    } finally {
      fresh.sqlite.close();
    }
  });
});
