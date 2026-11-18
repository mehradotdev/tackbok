/**
 * Cloud sync v2, step P4 (#185): every local write is stamped in the same
 * transaction as the data, with sync off; a wipe takes a new device ID.
 * Real SQLite with every migration, as in the app.
 */
import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as schema from '../../src/db/schema';
import { AssetType } from '../../src/types';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const sqlite = new Database(':memory:');
const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(join(import.meta.dir, '../../src/drizzle/meta/_journal.json'), 'utf8'),
);
for (const { tag } of journal.entries)
  sqlite.exec(
    readFileSync(
      join(import.meta.dir, `../../src/drizzle/${tag}.sql`),
      'utf8',
    ).replaceAll('--> statement-breakpoint', ''),
  );
const db = drizzle(sqlite, { schema });
mock.module('../../src/db', () => ({
  ...schema,
  db,
  runExclusiveDbTransaction: async (operation: (tx: typeof db) => Promise<unknown>) => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await operation(db);
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
}));
mock.module('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
const csvFiles = new Map<string, string>();
const uriOf = (part: unknown) =>
  typeof part === 'object' && part && 'uri' in part ? String(part.uri) : String(part);
mock.module('expo-file-system', () => ({
  File: class {
    readonly uri: string;
    readonly exists = false;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    async text() {
      return csvFiles.get(this.uri) ?? '';
    }
    async copy() {}
    delete() {}
  },
  Directory: class {
    readonly uri: string;
    readonly exists = true;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    create() {}
  },
  Paths: { document: { uri: 'file:///documents' } },
}));
for (const [n, sample] of [
  'sample-photo-1.jpg',
  'sample-photo-2.jpg',
  'sample-voice-memo.m4a',
].entries())
  mock.module(`../../assets/samples/${sample}`, () => ({ default: n + 1 }));
mock.module('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      async downloadAsync() {},
      localUri: 'file:///bundle/sample',
      uri: 'file:///bundle/sample',
      width: 10,
      height: 10,
    }),
  },
}));
const settings = {
  journalFocusAreas: [],
  cloudRestore: null,
  sampleEntryIds: [] as string[],
  setSampleEntryIds(ids: string[]) {
    settings.sampleEntryIds = ids;
  },
  setSampleEntriesBannerDismissed() {},
};
// The same exports as the real module: Bun's module mocks are process-wide.
mock.module('../../src/lib/settings', () => ({
  useSettingsStore: { getState: () => settings },
  hydrateProfileCache() {},
}));
mock.module('../../src/lib/entryDeletion', () => ({ async deleteEntry() {} }));
mock.module('expo-document-picker', () => ({ getDocumentAsync: async () => null }));
mock.module('react-native', () => ({ Platform: { OS: 'ios' } }));
mock.module('../../src/lib/cloudSync/runtime/mutationSignal', () => ({
  notifyCloudSyncMutationCommitted() {},
}));
mock.module('../../src/lib/cloudSync/storage/retainedMedia', () => ({
  async reapRetainedMediaWithoutVault() {},
}));

const repositories = await import('../../src/lib/cloudSync/storage/repositories');
const { deleteAllData } = await import('../../src/db/queries');
const { importFromPresentlyCSV } =
  await import('../../src/lib/backupImport/import/presently');
const { seedSampleEntries } = await import('../../src/lib/sampleEntries');
const { runInCloudSyncTransaction } = repositories;
afterAll(() => sqlite.close());

type Stamp = [number, string];
interface DeviceRow {
  device_id: string;
  ctx_json: string;
  roster_json: string;
}
interface RecordRow {
  vv_json: string;
  stamps_json: string;
  del_json: string | null;
}
const device = () =>
  sqlite.query<DeviceRow, []>("SELECT * FROM sync_device WHERE id = 'self'").get()!;
const record = (type: string, id: string) =>
  sqlite
    .query<RecordRow, [string, string]>(
      'SELECT vv_json, stamps_json, del_json FROM sync_records WHERE entity_type = ? AND entity_id = ?',
    )
    .get(type, id);
const stamps = (type: string, id: string) =>
  JSON.parse(record(type, id)!.stamps_json) as Record<string, Stamp>;
const vv = (type: string, id: string) =>
  JSON.parse(record(type, id)!.vv_json) as Record<string, number>;
const ctx = () => JSON.parse(device().ctx_json) as Record<string, number>;
const highest = () => Math.max(...Object.values(ctx()));
const count = (sql: string) => (sqlite.query(sql).get() as { n: number }).n;

const T = 1_800_000_000_000;
type Tx = Parameters<Parameters<typeof runInCloudSyncTransaction>[0]>[0];
const write = <T>(operation: (tx: Tx) => Promise<T>) =>
  runInCloudSyncTransaction(operation);
const upsert = (entry: Omit<schema.NewEntry, 'updated_at'>, now: number) =>
  write((tx) =>
    repositories.upsertEntryInTransaction(tx, { ...entry, updated_at: now }, { now }),
  );

beforeEach(() => {
  sqlite.exec(`
    DELETE FROM entries; DELETE FROM tags; DELETE FROM entry_tags;
    DELETE FROM custom_prompts; DELETE FROM user_profile; DELETE FROM media_assets;
    DELETE FROM sync_records; DELETE FROM sync_deleted_records; DELETE FROM sync_field_values;
    DELETE FROM sync_retained_media; DELETE FROM sync_media_obligations;
    UPDATE sync_device SET ctx_json = '{}', roster_json = '{}';
  `);
});

describe('every local write is stamped', () => {
  test('a new entry stamps every field; an edit stamps only what changed', async () => {
    const id = device().device_id;
    await upsert({ note_id: 'n1', text_title: 'T', text_content: 'C', created_at: T }, T);
    const created = stamps('entry', 'n1');
    expect(Object.keys(created).sort()).toEqual(['date', 'mood', 'text', 'title']);
    expect(created.title[1]).toBe(id);
    expect(vv('entry', 'n1')).toEqual({ [id]: created.title[0] });
    expect(ctx()).toEqual({ [id]: created.title[0] });
    expect(JSON.parse(device().roster_json)).toEqual({ [id]: created.title[0] });

    await upsert(
      { note_id: 'n1', text_title: 'T', text_content: 'Edited', created_at: T },
      T + 5,
    );
    const edited = stamps('entry', 'n1');
    expect(edited.text[0]).toBeGreaterThan(created.text[0]);
    expect(edited.title).toEqual(created.title);
    expect(edited.mood).toEqual(created.mood);
    expect(vv('entry', 'n1')[id]).toBe(edited.text[0]);

    // Saving without a change stamps nothing.
    const before = device().ctx_json;
    await upsert(
      { note_id: 'n1', text_title: 'T', text_content: 'Edited', created_at: T },
      T + 9,
    );
    expect(device().ctx_json).toBe(before);

    await upsert(
      {
        note_id: 'n1',
        text_title: 'T',
        text_content: 'Edited',
        mood: 'SAD',
        created_at: T - 86_400_000,
      },
      T + 10,
    );
    const moved = stamps('entry', 'n1');
    expect(moved.mood[0]).toBe(moved.date[0]);
    expect(moved.mood[0]).toBeGreaterThan(edited.text[0]);
  });

  test('stamps keep rising when the wall clock goes backwards', async () => {
    // The clock reads the earlier of the write's time and Date.now(); pin the
    // latter past both, so each write's own time is what the clock sees.
    const clock = spyOn(Date, 'now').mockReturnValue(T + 60_000);
    try {
      await upsert({ note_id: 'n1', text_content: 'A', created_at: T }, T);
      const first = highest();
      expect(first).toBe(T);
      await upsert({ note_id: 'n1', text_content: 'B', created_at: T }, T - 3_600_000);
      expect(highest()).toBe(first + 1);
    } finally {
      clock.mockRestore();
    }
  });

  test('tags: memberships carry their add stamp; a tag delete stamps the tag, not its entries', async () => {
    const tagId = await write((tx) =>
      repositories.createTagInTransaction(tx, 'Work', { now: T }),
    );
    expect(Object.keys(stamps('tag', tagId))).toEqual(['title']);
    await upsert({ note_id: 'n1', text_content: 'A', tags: tagId, created_at: T }, T + 1);
    const added = stamps('entry', 'n1').tags;
    expect(
      sqlite
        .query('SELECT stamp_hlc, stamp_device FROM entry_tags WHERE note_id = ?')
        .get('n1'),
    ).toEqual({ stamp_hlc: added[0], stamp_device: added[1] });
    // Saving the entry again keeps the membership's stamp.
    await upsert({ note_id: 'n1', text_content: 'B', tags: tagId, created_at: T }, T + 2);
    expect(
      sqlite.query('SELECT stamp_hlc FROM entry_tags WHERE note_id = ?').get('n1'),
    ).toEqual({ stamp_hlc: added[0] });
    // Renaming stamps the title; renaming to the same title does not.
    await write((tx) =>
      repositories.updateTagInTransaction(tx, tagId, 'Job', { now: T + 3 }),
    );
    const renamed = stamps('tag', tagId).title;
    await write((tx) =>
      repositories.updateTagInTransaction(tx, tagId, 'Job', { now: T + 4 }),
    );
    expect(stamps('tag', tagId).title).toEqual(renamed);
    const entryBefore = record('entry', 'n1');
    await write((tx) => repositories.deleteTagInTransaction(tx, tagId, { now: T + 5 }));
    expect(record('entry', 'n1')).toEqual(entryBefore);
    const tomb = JSON.parse(record('tag', tagId)!.del_json!);
    expect(tomb.seen).toEqual(vv('tag', tagId));
    expect(tomb.at[0]).toBe(vv('tag', tagId)[device().device_id]);
    expect(
      JSON.parse(
        (
          sqlite
            .query('SELECT record_json FROM sync_deleted_records WHERE entity_id = ?')
            .get(tagId) as { record_json: string }
        ).record_json,
      ).title,
    ).toEqual({ s: renamed, v: 'Job' });
  });

  test('prompts and the profile', async () => {
    const promptId = await write((tx) =>
      repositories.createPromptInTransaction(tx, 'One good thing', { now: T }),
    );
    expect(Object.keys(stamps('prompt', promptId))).toEqual(['title']);
    await write((tx) =>
      repositories.deletePromptInTransaction(tx, promptId, { now: T + 1 }),
    );
    expect(record('prompt', promptId)!.del_json).not.toBeNull();

    await write((tx) =>
      repositories.updateProfileInTransaction(tx, { displayName: 'Sam' }, { now: T + 2 }),
    );
    expect(Object.keys(stamps('profile', 'profile'))).toEqual(['name']);
    // The email is not synced: no stamp.
    const before = device().ctx_json;
    await write((tx) =>
      repositories.updateProfileInTransaction(tx, { email: 'a@b.c' }, { now: T + 3 }),
    );
    expect(device().ctx_json).toBe(before);
    await write((tx) =>
      repositories.updateProfileInTransaction(
        tx,
        { photoUri: 'photos/p.jpg' },
        { now: T + 4 },
      ),
    );
    expect(Object.keys(stamps('profile', 'profile')).sort()).toEqual(['name', 'photo']);
  });

  test('attachments: attach, reorder and detach stamp the entry; a delete keeps the values', async () => {
    const photo = (n: number) => ({
      type: AssetType.IMAGE,
      uri: `photos/${n}.jpg`,
      assetId: `a${n}`,
    });
    await upsert({ note_id: 'n1', text_content: 'A', created_at: T }, T);
    await upsert(
      { note_id: 'n1', text_content: 'A', assets: [photo(1), photo(2)], created_at: T },
      T + 1,
    );
    const attached = stamps('entry', 'n1').attachments;
    expect(attached).toBeDefined();
    // Attachments themselves are stamped when first published (P6).
    expect(
      count('SELECT count(*) AS n FROM media_assets WHERE stamp_hlc IS NOT NULL'),
    ).toBe(0);
    await upsert(
      { note_id: 'n1', text_content: 'A', assets: [photo(2), photo(1)], created_at: T },
      T + 2,
    );
    expect(stamps('entry', 'n1').order[0]).toBeGreaterThan(attached[0]);
    await upsert(
      { note_id: 'n1', text_content: 'A', assets: [photo(2)], created_at: T },
      T + 3,
    );
    expect(stamps('entry', 'n1').attachments[0]).toBeGreaterThan(attached[0]);

    await write((tx) => repositories.deleteEntryInTransaction(tx, 'n1', { now: T + 4 }));
    const row = record('entry', 'n1')!;
    const tomb = JSON.parse(row.del_json!);
    expect(tomb.seen).toEqual(JSON.parse(row.vv_json));
    const retained = JSON.parse(
      (
        sqlite
          .query('SELECT record_json FROM sync_deleted_records WHERE entity_id = ?')
          .get('n1') as { record_json: string }
      ).record_json,
    );
    // The v2 form of the record (`DeletedEntryValues`). Only published
    // attachments are in the state; these never were.
    expect(retained.text.map((item: { v: string }) => item.v)).toEqual(['A']);
    expect(retained.title.map((item: { v: string | null }) => item.v)).toEqual([null]);
    expect(retained.date.v).toBe(T);
    expect(retained.attachments).toEqual([]);
    expect(retained.order.v).toEqual(['a2', 'a1']);
  });
});

describe('edge cases from review', () => {
  const photo = (n: number) => ({
    type: AssetType.IMAGE,
    uri: `photos/${n}.jpg`,
    assetId: `a${n}`,
  });

  test('attachments in the order their IDs sort into write no order register', async () => {
    await upsert(
      { note_id: 'n1', text_content: 'A', assets: [photo(1), photo(2)], created_at: T },
      T,
    );
    await upsert(
      {
        note_id: 'n1',
        text_content: 'A',
        assets: [photo(1), photo(2), photo(3)],
        created_at: T,
      },
      T + 1,
    );
    expect(stamps('entry', 'n1').order).toBeUndefined();
    // The same order with assets known only by their file: still no change.
    await upsert(
      {
        note_id: 'n1',
        text_content: 'A',
        assets: [1, 2, 3].map((n) => ({ type: AssetType.IMAGE, uri: `photos/${n}.jpg` })),
        created_at: T,
      },
      T + 2,
    );
    expect(stamps('entry', 'n1').order).toBeUndefined();
    await upsert(
      {
        note_id: 'n1',
        text_content: 'A',
        assets: [photo(3), photo(1), photo(2)],
        created_at: T,
      },
      T + 3,
    );
    expect(stamps('entry', 'n1').order).toBeDefined();
  });

  test('a field the caller leaves out is not a change', async () => {
    await upsert(
      { note_id: 'n1', text_title: 'T', text_content: 'A', mood: 'SAD', created_at: T },
      T,
    );
    const before = stamps('entry', 'n1');
    await upsert({ note_id: 'n1', text_content: 'B', created_at: T }, T + 1);
    expect(stamps('entry', 'n1').title).toEqual(before.title);
    expect(stamps('entry', 'n1').mood).toEqual(before.mood);
  });

  test('an archive timestamp in the future does not drag the clock', async () => {
    const future = Date.now() + 10 * 365 * 86_400_000;
    await upsert({ note_id: 'n1', text_content: 'A', created_at: T }, future);
    expect(highest()).toBeLessThan(Date.now() + 1_000);
  });

  test('writing a deleted ID again (an import) brings it back, acknowledged', async () => {
    await upsert({ note_id: 'n1', text_content: 'A', created_at: T }, T);
    await write((tx) => repositories.deleteEntryInTransaction(tx, 'n1', { now: T + 1 }));
    await upsert({ note_id: 'n1', text_content: 'A again', created_at: T }, T + 2);
    const del = JSON.parse(record('entry', 'n1')!.del_json!);
    expect(del.ackSeen).toEqual(del.seen);
    // Live again: the new write is outside what the delete saw.
    expect(vv('entry', 'n1')[device().device_id]).toBeGreaterThan(
      del.seen[device().device_id],
    );
    expect(count('SELECT count(*) AS n FROM sync_deleted_records')).toBe(0);
  });

  test('legacy tag memberships made by normalization are stamped', async () => {
    const tagId = await write((tx) =>
      repositories.createTagInTransaction(tx, 'Work', { now: T }),
    );
    sqlite
      .query(
        "INSERT INTO entries (note_id, text_content, tags, created_at, updated_at) VALUES ('legacy', 'L', ?, 1, 1)",
      )
      .run(tagId);
    const legacy = sqlite
      .query("SELECT * FROM entries WHERE note_id = 'legacy'")
      .get() as never;
    await write((tx) =>
      repositories.normalizeLegacyEntryInTransaction(tx, legacy, T + 1),
    );
    expect(count('SELECT count(*) AS n FROM entry_tags WHERE stamp_hlc IS NULL')).toBe(0);
    expect(stamps('entry', 'legacy').tags).toBeDefined();
  });
});

describe('transactions', () => {
  test('a write that fails leaves no stamp, no record and no clock change', async () => {
    await upsert({ note_id: 'n1', text_content: 'A', created_at: T }, T);
    const before = {
      device: device(),
      records: count('SELECT count(*) AS n FROM sync_records'),
    };
    await expect(
      write(async (tx) => {
        await repositories.upsertEntryInTransaction(
          tx,
          { note_id: 'n2', text_content: 'B', created_at: T, updated_at: T },
          { now: T + 1 },
        );
        await repositories.upsertEntryInTransaction(
          tx,
          { note_id: 'n1', text_content: 'Changed', created_at: T, updated_at: T },
          { now: T + 1 },
        );
        throw new Error('crash after the writes');
      }),
    ).rejects.toThrow('crash after the writes');
    expect(device()).toEqual(before.device);
    expect(count('SELECT count(*) AS n FROM sync_records')).toBe(before.records);
    expect(record('entry', 'n2')).toBeNull();
    // A duplicate tag title fails inside the repository: nothing is stamped either.
    await write((tx) => repositories.createTagInTransaction(tx, 'Work', { now: T + 2 }));
    const afterTag = device().ctx_json;
    await expect(
      write((tx) => repositories.createTagInTransaction(tx, 'work', { now: T + 3 })),
    ).rejects.toThrow();
    expect(device().ctx_json).toBe(afterTag);
  });
});

describe('wipes', () => {
  test('"Delete all" forgets every record and takes a new device ID with an empty context', async () => {
    await upsert({ note_id: 'n1', text_content: 'A', created_at: T }, T);
    await write((tx) => repositories.createTagInTransaction(tx, 'Work', { now: T }));
    const old = device().device_id;
    await deleteAllData();
    const fresh = device();
    expect(fresh.device_id).not.toBe(old);
    expect(fresh.device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fresh.ctx_json).toBe('{}');
    expect(fresh.roster_json).toBe('{}');
    expect(count('SELECT count(*) AS n FROM sync_records')).toBe(0);
    expect(count('SELECT count(*) AS n FROM sync_deleted_records')).toBe(0);
    // New writes use the new ID only.
    await upsert({ note_id: 'n2', text_content: 'B', created_at: T }, T + 1);
    expect(Object.keys(ctx())).toEqual([fresh.device_id]);
  });

  // The local wipe ("Delete journal everywhere") is checked in
  // production-journal.test.ts, which runs it with the snapshot storage.
});

describe('import and sample entries', () => {
  test('the onboarding sample entries are stamped, tags and memberships included', async () => {
    const ids = await seedSampleEntries(((key: string) => key) as never);
    expect(ids).toHaveLength(4);
    for (const id of ids) expect(stamps('entry', id).title).toBeDefined();
    expect(
      count("SELECT count(*) AS n FROM sync_records WHERE entity_type = 'tag'"),
    ).toBe(2);
    expect(count('SELECT count(*) AS n FROM entry_tags WHERE stamp_hlc IS NULL')).toBe(0);
    expect(count('SELECT count(*) AS n FROM entry_tags')).toBe(2);
  });

  test('a Presently import stamps every imported entry', async () => {
    csvFiles.set(
      'file:///in.csv',
      'entryDate,entryContent\n2026-01-02,"First"\n2026-01-03,"Second, with a comma"\n',
    );
    const summary = await importFromPresentlyCSV('file:///in.csv');
    expect(summary.importedEntries).toBe(2);
    const ids = sqlite
      .query<{ note_id: string }, []>('SELECT note_id FROM entries')
      .all();
    for (const { note_id } of ids)
      expect(Object.keys(stamps('entry', note_id)).sort()).toEqual([
        'date',
        'mood',
        'text',
        'title',
      ]);
  });
});

test('timing: stamping adds little to a save on a large journal', async () => {
  // 5,000 entries, then 300 saves of one entry that change its text (stamped)
  // and 300 that change nothing (the same work without a stamp).
  sqlite.transaction(() => {
    const insert = sqlite.prepare(
      "INSERT INTO entries (note_id, text_content, tags, created_at, updated_at) VALUES (?, ?, '', ?, ?)",
    );
    for (let i = 0; i < 5_000; i++) insert.run(`bulk${i}`, `Text ${i}`, T, T);
  })();
  const time = async (text: (i: number) => string) => {
    const started = performance.now();
    for (let i = 0; i < 300; i++)
      await upsert({ note_id: 'bulk1', text_content: text(i), created_at: T }, T + i);
    return (performance.now() - started) / 300;
  };
  const stamped = await time((i) => `Typed ${i}`);
  const unchanged = await time(() => 'Typed 299');
  // The difference is the tick and record write only; the change detection
  // reads run in both.
  console.log(
    `save: ${stamped.toFixed(2)} ms with a stamp, ${unchanged.toFixed(2)} ms without (desktop, Bun SQLite)`,
  );
  expect(stamped - unchanged).toBeLessThan(2);
});
