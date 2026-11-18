/**
 * Runs the simulation through the app's local storage (#185, P5). Each
 * device is a real SQLite database with every migration:
 * - edits go through the app's repositories, which stamp them
 *   (`storage/repositories.ts`, `storage/syncStamps.ts`);
 * - "keep", "Keep both", "Got it" and extension writes are model writes on
 *   the captured state, written back by the real apply;
 * - a sync publishes this device's new attachments (stamping them, as the
 *   engine does once their blobs are on Drive), captures both states from
 *   SQLite, joins them as the engine does (refuse a clock too far ahead,
 *   `absorb`, `markSeen`, `compact`) and writes the result with
 *   `applySyncState`. It fails the case if capturing again does not give
 *   back exactly the state it joined.
 *
 * Import this module only after `installSqliteDevices`.
 */
import {
  applySyncState,
  captureSyncState,
  rebuildSyncMetadataInTransaction,
  stampPublishedAttachmentsInTransaction,
  unpublishedAttachmentsInTransaction,
  type ApplyMediaFiles,
  type CapturedSyncState,
} from '../../../src/lib/cloudSync/storage/v2State';
import * as repositories from '../../../src/lib/cloudSync/storage/repositories';
import {
  MAX_CONTEXT_AHEAD_MS,
  assertNotAhead,
} from '../../../src/lib/cloudSync/v2/clock';
import { canonicalState } from '../../../src/lib/cloudSync/v2/codec';
import { absorb, compact } from '../../../src/lib/cloudSync/v2/compact';
import { normalizeTitle } from '../../../src/lib/cloudSync/v2/ids';
import * as ops from '../../../src/lib/cloudSync/v2/ops';
import type { SyncState } from '../../../src/lib/cloudSync/v2/types';
import { AssetType, type Asset, type Mood } from '../../../src/types';
import type {
  KeepEffect,
  KeepTarget,
  LocalEvent,
  SimAdapter,
  SyncOutcome,
  View,
} from './driver';
import {
  BunSyncDatabase,
  type SqliteDevice,
  type installSqliteDevices,
} from './sqliteDevices';
import {
  FakeSnapshotProvider,
  MemorySnapshotMediaStore,
} from '../../../src/lib/cloudSync/snapshot/sync/fakes';
import { SQLiteSyncStateStore } from '../../../src/lib/cloudSync/snapshot/sync/sqliteState';
import { V2SyncEngine } from '../../../src/lib/cloudSync/snapshot/sync/v2Engine';

import { V2Adapter, V2_VAULT, viewOfState } from './v2Adapter';

type Devices = ReturnType<typeof installSqliteDevices>;

/** No files in the simulation: every new attachment is a pending download. */
export const simMediaFiles: ApplyMediaFiles = {
  async materialize(media) {
    return new Map(
      media.map((descriptor) => [
        descriptor.assetId,
        { uri: `photos/${descriptor.assetId}.jpg`, verified: false },
      ]),
    );
  },
  async discard() {},
  serialize: (operation) => operation(),
};

const deviceName = (device: number) => `device-${device}`;

interface EntryRow {
  text_title: string | null;
  text_content: string | null;
  mood: Mood | null;
  created_at: number;
  tags: string;
  assets: string | null;
}

export class V2StoreAdapter implements SimAdapter {
  readonly name: string;
  readonly maxAheadMs = MAX_CONTEXT_AHEAD_MS;
  /** The model, for the app's writes that go through the apply. */
  private readonly model: V2Adapter;
  private readonly databases: SqliteDevice[];
  /** Drive topology: each device's last published state. */
  private readonly heads = new Map<number, SyncState>();
  refusedPulls = 0;

  /** `engine`: each device runs the real v2 engine against one fake Drive. */
  readonly topology: 'pairwise' | 'drive';
  private readonly engines: V2SyncEngine[] = [];
  readonly provider = new FakeSnapshotProvider();
  private readonly blobs = new MemorySnapshotMediaStore();

  private constructor(
    private readonly devices: Devices,
    count: number,
    readonly mode: 'pairwise' | 'drive' | 'engine',
  ) {
    this.topology = mode === 'pairwise' ? 'pairwise' : 'drive';
    this.name = `v2-store-${mode}`;
    this.model = new V2Adapter(count, 'pairwise');
    this.databases = Array.from({ length: count }, () => devices.create());
  }

  static async create(
    devices: Devices,
    count: number,
    mode: 'pairwise' | 'drive' | 'engine' = 'pairwise',
  ): Promise<V2StoreAdapter> {
    const adapter = new V2StoreAdapter(devices, count, mode);
    for (const [index, database] of adapter.databases.entries()) {
      await devices.on(database, 1, async () => {
        await repositories.runInCloudSyncTransaction((tx) =>
          rebuildSyncMetadataInTransaction(tx, V2_VAULT, 1),
        );
        // A stable name, so the model's writer and this device agree.
        database.sqlite.run('UPDATE sync_device SET device_id = ?', [deviceName(index)]);
      });
      if (mode === 'engine')
        adapter.engines.push(
          new V2SyncEngine({
            vaultId: V2_VAULT,
            stateKey: `state-${index}`,
            stateStore: new SQLiteSyncStateStore(new BunSyncDatabase(database.sqlite)),
            provider: adapter.provider,
            mediaStore: adapter.blobs,
            files: simMediaFiles,
          }),
        );
    }
    return adapter;
  }

  normalizeTitle(kind: 'tag' | 'prompt', title: string): string {
    return normalizeTitle(kind, title);
  }

  dispose(): void {
    for (const database of this.databases) database.sqlite.close();
  }

  /** Each device's last wall clock, for work done on its behalf. */
  private readonly walls = new Map<number, number>();

  private on<T>(device: number, wall: number, operation: () => Promise<T>) {
    this.walls.set(device, wall);
    return this.devices.on(this.databases[device], wall, operation);
  }

  private capture(device: number): Promise<CapturedSyncState> {
    return this.devices.on(this.databases[device], Date.now(), captureSyncState);
  }

  private row(device: number, entryId: string): EntryRow | null {
    return this.databases[device].sqlite
      .query<EntryRow, [string]>(
        'SELECT text_title, text_content, mood, created_at, tags, assets FROM entries WHERE note_id = ?',
      )
      .get(entryId);
  }

  /** What the app shows: the state, plus attachments not published yet. */
  async view(device: number): Promise<View> {
    const view = viewOfState((await this.capture(device)).state);
    const unpublished = await this.devices.on(this.databases[device], Date.now(), () =>
      repositories.runInCloudSyncTransaction(unpublishedAttachmentsInTransaction),
    );
    for (const entry of view.entries) {
      const local = new Set(
        unpublished.filter((asset) => asset.entryId === entry.id).map((a) => a.assetId),
      );
      if (local.size === 0) continue;
      // The app's order: the entry row's attachment list.
      const listed = (
        JSON.parse(this.row(device, entry.id)?.assets ?? '[]') as Asset[]
      ).map((asset) => asset.assetId!);
      entry.attachmentIds = listed.filter(
        (id) => entry.attachmentIds.includes(id) || local.has(id),
      );
    }
    return view;
  }

  /** The full row for an upsert: a field left out would be cleared. */
  private entryInput(device: number, entryId: string) {
    const row = this.row(device, entryId);
    if (!row) return null;
    return {
      note_id: entryId,
      text_title: row.text_title,
      text_content: row.text_content,
      mood: row.mood,
      created_at: row.created_at,
      updated_at: row.created_at,
      tags: row.tags,
      assets: JSON.parse(row.assets ?? '[]') as Asset[],
    };
  }

  /** The hash pass the runtime runs before a sync; the files are readable. */
  private hashMedia(device: number, wall: number) {
    for (const row of this.databases[device].sqlite
      .query<{ asset_id: string }, []>(
        'SELECT asset_id FROM media_assets WHERE blob_hash IS NULL',
      )
      .all())
      void this.blobs.writeVerified(
        `${Buffer.from(row.asset_id).toString('hex')}${'0'.repeat(64)}`.slice(0, 64),
        new TextEncoder().encode(`blob:${row.asset_id}`),
      );
    this.databases[device].sqlite.run(
      `UPDATE media_assets SET blob_hash = substr(lower(hex(asset_id)) || '0000000000000000000000000000000000000000000000000000000000000000', 1, 64), byte_size = 1000,
         width = 10, height = 10, mime_type = 'image/jpeg', created_at = ?
       WHERE blob_hash IS NULL`,
      [wall],
    );
  }

  /** Whether the app allows the write: the model's refusals on the same state. */
  private accepts(state: SyncState, event: LocalEvent, wall: number): boolean {
    this.model.states[event.device] = state;
    return this.model.apply(event.device, event, wall);
  }

  async apply(device: number, event: LocalEvent, wall: number): Promise<boolean> {
    const captured = await this.capture(device);
    if (event.kind === 'acknowledge' || event.kind === 'setExt') {
      if (!this.accepts(captured.state, event, wall)) return false;
      await this.writeThroughApply(device, wall, captured, this.model.states[device]);
      return true;
    }
    // Attachments not published yet are not in the state: checked below.
    const local =
      event.kind === 'attach' || event.kind === 'detach' || event.kind === 'reorder';
    if (!local && !this.accepts(captured.state, event, wall)) return false;
    const now = { now: wall };
    const run = <T>(write: (tx: repositories.CloudSyncTransaction) => Promise<T>) =>
      this.on(device, wall, () => repositories.runInCloudSyncTransaction(write));
    const entry = 'entryId' in event ? this.entryInput(device, event.entryId) : null;
    try {
      switch (event.kind) {
        case 'createEntry':
          await run((tx) =>
            repositories.upsertEntryInTransaction(
              tx,
              {
                note_id: event.entryId,
                text_title: event.title,
                text_content: event.content,
                mood: event.mood,
                created_at: wall,
                updated_at: wall,
                tags: '',
                assets: [],
              },
              now,
            ),
          );
          return true;
        case 'setTitle':
        case 'setContent':
        case 'setMood':
        case 'setDate':
        case 'addTag':
        case 'removeTag': {
          if (!entry) return false;
          const tags = entry.tags.split(',').filter(Boolean);
          const next = { ...entry };
          if (event.kind === 'setTitle') next.text_title = event.value;
          if (event.kind === 'setContent') next.text_content = event.value;
          if (event.kind === 'setMood') next.mood = event.mood;
          if (event.kind === 'setDate')
            next.created_at = Math.max(0, entry.created_at - event.offset);
          if (event.kind === 'addTag')
            next.tags = [...new Set([...tags, event.tagId])].sort().join(',');
          if (event.kind === 'removeTag')
            next.tags = tags.filter((id) => id !== event.tagId).join(',');
          await run((tx) => repositories.upsertEntryInTransaction(tx, next, now));
          return true;
        }
        case 'deleteEntry':
          await run((tx) =>
            repositories.deleteEntryInTransaction(tx, event.entryId, now),
          );
          return true;
        case 'attach':
        case 'detach':
        case 'reorder': {
          if (!entry) return false;
          const shown = (await this.view(device)).entries.find(
            (item) => item.id === event.entryId,
          );
          if (!shown) return false;
          const byId = new Map(entry.assets.map((asset) => [asset.assetId!, asset]));
          let ids = shown.attachmentIds;
          if (event.kind === 'attach') {
            const used = this.databases[device].sqlite
              .query('SELECT 1 FROM media_assets WHERE asset_id = ?')
              .get(event.assetId);
            if (used || (await this.capture(device)).state.media.has(event.assetId))
              return false;
            ids = [...ids, event.assetId];
          } else if (event.kind === 'detach') {
            if (!ids.includes(event.assetId)) return false;
            ids = ids.filter((id) => id !== event.assetId);
          } else {
            if (ids.length < 2) return false;
            ids = [...ids].reverse();
          }
          const assets = ids.map(
            (id): Asset =>
              byId.get(id) ?? {
                type: AssetType.IMAGE,
                uri: `photos/${id}.jpg`,
                assetId: id,
              },
          );
          await run((tx) =>
            repositories.upsertEntryInTransaction(tx, { ...entry, assets }, now),
          );
          return true;
        }
        case 'createTag':
          await run((tx) => repositories.createTagInTransaction(tx, event.title, now));
          return true;
        case 'createPrompt':
          await run((tx) => repositories.createPromptInTransaction(tx, event.title, now));
          return true;
        case 'renameTag':
          await run((tx) =>
            repositories.updateTagInTransaction(tx, event.id, event.title, now),
          );
          return true;
        case 'renamePrompt':
          await run((tx) =>
            repositories.updatePromptInTransaction(tx, event.id, event.title, now),
          );
          return true;
        case 'deleteTag':
          await run((tx) => repositories.deleteTagInTransaction(tx, event.id, now));
          return true;
        case 'deletePrompt':
          await run((tx) => repositories.deletePromptInTransaction(tx, event.id, now));
          return true;
        case 'setProfileName':
          await run((tx) =>
            repositories.updateProfileInTransaction(
              tx,
              { displayName: event.value },
              now,
            ),
          );
          return true;
        case 'setProfilePhoto':
          await run((tx) =>
            repositories.updateProfileInTransaction(
              tx,
              event.assetId === null
                ? { photoUri: null }
                : {
                    photoUri: `photos/${event.assetId}.jpg`,
                    photoAssetId: event.assetId,
                  },
              now,
            ),
          );
          this.hashMedia(device, wall);
          return true;
        case 'keep':
        case 'keepBoth':
          return false;
      }
    } catch (error) {
      // What the app refuses: a duplicate title, an invalid one.
      if (error instanceof Error && /already exists|Invalid/.test(error.message))
        return false;
      throw error;
    }
  }

  private async writeThroughApply(
    device: number,
    wall: number,
    captured: CapturedSyncState,
    next: SyncState,
  ): Promise<void> {
    const applied = await this.on(device, wall, () =>
      applySyncState(captured, next, simMediaFiles),
    );
    if (!applied) throw new Error('A local write raced the apply in the simulation');
  }

  async keepTargets(device: number): Promise<KeepTarget[]> {
    this.model.states[device] = (await this.capture(device)).state;
    return this.model.keepTargets(device);
  }

  async keep(
    device: number,
    event: Extract<LocalEvent, { kind: 'keep' | 'keepBoth' }>,
    wall: number,
  ): Promise<KeepEffect | null> {
    const captured = await this.capture(device);
    this.model.states[device] = captured.state;
    const effect = this.model.keep(device, event, wall);
    if (!effect) return null;
    await this.writeThroughApply(device, wall, captured, this.model.states[device]);
    return effect;
  }

  /** Publication: new attachments are stamped once "uploaded". */
  private async publishMedia(device: number, wall: number) {
    this.hashMedia(device, wall);
    await this.on(device, wall, () =>
      repositories.runInCloudSyncTransaction(async (tx) => {
        const pending = await unpublishedAttachmentsInTransaction(tx);
        await stampPublishedAttachmentsInTransaction(
          tx,
          new Set(pending.map((asset) => asset.assetId)),
          wall,
        );
      }),
    );
  }

  async sync(device: number, peer: number | null, wall: number): Promise<SyncOutcome> {
    if (this.mode === 'engine') return this.engineSync(device, wall);
    await this.publishMedia(device, wall);
    // What a device reads is a published state, and publishing stamps new
    // attachments first: never an attach write without its attachment.
    if (this.topology === 'pairwise')
      await this.publishMedia(peer!, this.walls.get(peer!) ?? wall);
    const captured = await this.capture(device);
    const sources =
      this.topology === 'pairwise'
        ? [(await this.capture(peer!)).state]
        : [...this.heads.entries()]
            .filter(([index]) => index !== device)
            .map(([, state]) => state);
    let pulled = true;
    try {
      for (const source of sources) assertNotAhead(source, wall);
    } catch {
      pulled = false;
      this.refusedPulls++;
    }
    const writer = { device: deviceName(device), wallMs: wall };
    let next = captured.state;
    const revived: string[] = [];
    if (pulled)
      for (const source of sources) {
        const absorbed = absorb(next, source, writer);
        next = absorbed.state;
        revived.push(...absorbed.revived);
      }
    if (ops.needsAck(next, writer.device)) next = ops.markSeen(next, writer);
    const shown = JSON.stringify(viewOfState(next));
    const compacted = compact(next);
    if (JSON.stringify(viewOfState(compacted)) !== shown)
      return { ok: false, reason: 'compaction changed what the device shows' };
    next = compacted;
    const changed = canonicalState(next) !== canonicalState(captured.state);
    if (changed) await this.writeThroughApply(device, wall, captured, next);
    const after = canonicalState((await this.capture(device)).state);
    if (after !== canonicalState(next))
      return { ok: false, reason: 'capture after apply differs from the joined state' };
    if (this.topology === 'drive') {
      const head = this.heads.get(device);
      const published = !head || canonicalState(head) !== after;
      this.heads.set(device, next);
      return { ok: true, changed: changed || published, pulled, revived };
    }
    return { ok: true, changed, pulled, revived };
  }

  /** One real engine pass. A pause fails the case: nothing here should pause. */
  private async engineSync(device: number, wall: number): Promise<SyncOutcome> {
    this.hashMedia(device, wall);
    const before = canonicalState((await this.capture(device)).state);
    const result = await this.on(device, wall, () => this.engines[device].sync());
    if (result.status === 'attention')
      return { ok: false, reason: `attention: ${result.reason}` };
    if (result.status === 'retry')
      return { ok: false, reason: `retry: ${result.reason}` };
    // A head refused for its clock: this device has not seen what it holds.
    const pulled = !result.refusedHeads;
    if (!pulled) this.refusedPulls++;
    const after = canonicalState((await this.capture(device)).state);
    return {
      ok: true,
      changed: result.status !== 'up-to-date' || before !== after,
      pulled,
      revived: result.revivedEntries ?? [],
    };
  }

  async fingerprint(device: number): Promise<string> {
    return canonicalState((await this.capture(device)).state);
  }
}
