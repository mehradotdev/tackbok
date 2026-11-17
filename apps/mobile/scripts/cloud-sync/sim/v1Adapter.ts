/**
 * Runs the simulation against the shipped v1 engine: each device is a real
 * `SnapshotSyncEngine` with its own SQLite sync state and in-memory journal,
 * and all devices share one fake Drive. A sync is one engine pass, which
 * merges every published head with the base the engine finds, as on a phone.
 * Local edits change the journal the way the app's repositories do.
 *
 * Retention cleanup runs as in the app, but a case spans days, not the
 * 30-day window. Not modelled: kill points, Wi-Fi-only media, long offline
 * periods and the ancestor download budget, which only remove merge bases
 * (audit N1). A paused vault is resumed at once, where the app waits for
 * the user. So these numbers are a lower bound for v1.
 */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  canonicalHash,
  canonicalize,
} from '../../../src/lib/cloudSync/snapshot/canonical';
import { sha256Text } from '../../../src/lib/cloudSync/snapshot/sha256';
import { BaseShadowManager } from '../../../src/lib/cloudSync/snapshot/sync/baseShadow';
import { SnapshotSyncEngine } from '../../../src/lib/cloudSync/snapshot/sync/engine';
import {
  FakeSnapshotProvider,
  MemoryBaseShadowFileStore,
  MemorySnapshotJournalStore,
  MemorySnapshotMediaStore,
} from '../../../src/lib/cloudSync/snapshot/sync/fakes';
import {
  SQLiteSyncStateStore,
  type SyncDatabase,
} from '../../../src/lib/cloudSync/snapshot/sync/sqliteState';
import type {
  SnapshotDomain,
  SnapshotEntry,
  SnapshotMedia,
  SnapshotTombstone,
} from '../../../src/lib/cloudSync/snapshot/types';
import { openConflictGroups } from '../../../src/lib/otherVersionGroups';
import { sanitizePromptTitle, sanitizeTagName } from '../../../src/lib/utils';
import type {
  KeepEffect,
  KeepTarget,
  LocalEvent,
  SimAdapter,
  SyncOutcome,
  View,
} from './driver';

const SNAPSHOT_MIGRATION = readFileSync(
  join(import.meta.dir, '../../../src/drizzle/0004_colorful_xavin.sql'),
  'utf8',
)
  .split('DROP INDEX `custom_prompts_title_unique`')[0]
  .replaceAll('--> statement-breakpoint', '');

class BunSyncDatabase implements SyncDatabase {
  constructor(readonly database: Database) {}
  execSync(source: string): void {
    this.database.exec(source);
  }
  getFirstSync<T>(source: string, ...params: unknown[]): T | null {
    return this.database.query(source).get(...(params as SQLQueryBindings[])) as T | null;
  }
  getAllSync<T>(source: string, ...params: unknown[]): T[] {
    return this.database.query(source).all(...(params as SQLQueryBindings[])) as T[];
  }
  runSync(source: string, ...params: unknown[]): unknown {
    return this.database.query(source).run(...(params as SQLQueryBindings[]));
  }
}

const VAULT = 'vault-sim';

function blankDomain(): SnapshotDomain {
  return {
    entries: [],
    tags: [],
    entryTags: [],
    prompts: [],
    profile: {
      profileId: 'profile',
      displayName: null,
      photoAssetId: null,
      updatedAt: 1,
    },
    media: [],
    tombstones: [],
    conflicts: [],
  };
}

interface Device {
  deviceId: string;
  sqlite: Database;
  state: SQLiteSyncStateStore;
  journal: MemorySnapshotJournalStore;
  media: MemorySnapshotMediaStore;
  clock: { value: number };
  engine: SnapshotSyncEngine;
  lastWall: number;
  lastTime: number;
}

const byKey =
  <T>(key: (value: T) => string) =>
  (left: T, right: T) =>
    key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0;

function blobFor(seed: string): { hash: string; bytes: Uint8Array } {
  const bytes = new TextEncoder().encode(`blob:${seed}`);
  return { hash: sha256Text(`blob:${seed}`), bytes };
}

export class V1Adapter implements SimAdapter {
  readonly name = 'v1';
  readonly topology = 'drive' as const;
  readonly supportsKeepBoth = false;
  private readonly provider = new FakeSnapshotProvider();
  private readonly devices: Device[];
  private created = 0;

  constructor(count: number) {
    this.devices = Array.from({ length: count }, (_, index) => {
      const sqlite = new Database(':memory:', { strict: true });
      sqlite.exec(SNAPSHOT_MIGRATION);
      const clock = { value: 1_800_000_000_000 };
      const deviceId = `device-${index}`;
      const state = new SQLiteSyncStateStore(
        new BunSyncDatabase(sqlite),
        () => clock.value,
      );
      const files = new MemoryBaseShadowFileStore();
      const journal = new MemorySnapshotJournalStore(
        blankDomain(),
        state,
        VAULT,
        deviceId,
      );
      const media = new MemorySnapshotMediaStore();
      // A fresh install has never set a name or photo (see profileFieldMerge).
      journal.localProfilePristine = true;
      const engine = new SnapshotSyncEngine(
        VAULT,
        deviceId,
        state,
        new BaseShadowManager(files),
        journal,
        media,
        this.provider,
        {},
        () => clock.value,
      );
      return {
        deviceId,
        sqlite,
        state,
        journal,
        media,
        clock,
        engine,
        lastWall: -1,
        lastTime: -1,
      };
    });
  }

  dispose(): void {
    for (const device of this.devices) device.sqlite.close();
  }

  domain(device: number): SnapshotDomain {
    return this.devices[device].journal.current();
  }

  normalizeTitle(kind: 'tag' | 'prompt', title: string): string {
    return (
      kind === 'tag' ? sanitizeTagName(title) : sanitizePromptTitle(title)
    ).toLowerCase();
  }

  view(device: number): View {
    const domain = this.domain(device);
    const names = [
      domain.profile.displayName,
      ...domain.conflicts
        .filter((conflict) => conflict.field === 'displayName')
        .flatMap((conflict) => conflict.alternates.map((value) => value.value)),
    ];
    const photos = [
      domain.profile.photoAssetId,
      ...domain.conflicts
        .filter((conflict) => conflict.field === 'photoAssetId')
        .flatMap((conflict) => conflict.alternates.map((value) => value.value)),
    ];
    return {
      entries: domain.entries.map((entry) => ({
        id: entry.entryId,
        titles: [entry.title],
        contents: [entry.content],
        mood: entry.mood,
        date: entry.createdAt,
        tagIds: domain.entryTags
          .filter((relation) => relation.entryId === entry.entryId)
          .map((relation) => relation.tagId),
        attachmentIds: domain.media
          .filter(
            (asset) => asset.ownerType === 'entry' && asset.ownerId === entry.entryId,
          )
          .map((asset) => asset.assetId),
      })),
      tags: domain.tags.map((tag) => ({ id: tag.tagId, title: tag.title })),
      prompts: domain.prompts.map((prompt) => ({
        id: prompt.promptId,
        title: prompt.title,
      })),
      profileNames: names,
      profilePhotos: photos,
    };
  }

  private groups(device: number): string[][] {
    const domain = this.domain(device);
    return openConflictGroups(
      domain.entries.map((entry) => ({
        note_id: entry.entryId,
        conflict_origin_id: entry.conflictOriginId,
      })),
    ).map((group) => [...group].sort());
  }

  keepTargets(device: number): KeepTarget[] {
    return this.groups(device).map((group) => ({
      entryId: group[0],
      field: 'group' as const,
      options: group.length,
    }));
  }

  keep(
    device: number,
    event: Extract<LocalEvent, { kind: 'keep' | 'keepBoth' }>,
    rawWall: number,
  ): KeepEffect | null {
    if (event.kind !== 'keep') return null;
    const wall = this.now(device, rawWall);
    const group = this.groups(device).find((members) =>
      members.includes(event.target.entryId),
    );
    if (!group) return null;
    // After shrinking the group may be smaller: the target no longer applies.
    if (event.index >= group.length) return null;
    const keepId = group[event.index];
    const domain = this.domain(device);
    const entryOf = (id: string) => domain.entries.find((entry) => entry.entryId === id)!;
    const others = group.filter((id) => id !== keepId);
    // "Keep this one" deletes the other versions (screens/otherVersions).
    let next = domain;
    for (const id of others) next = this.deleteEntry(device, next, id, wall);
    this.commit(device, next, wall);
    const kept = entryOf(keepId);
    return {
      removed: others.flatMap((id) => [
        { value: entryOf(id).title, entryId: id },
        { value: entryOf(id).content, entryId: id },
      ]),
      affirmed: [
        { value: kept.title, entryId: keepId },
        { value: kept.content, entryId: keepId },
      ],
      // As in v2, choosing a version counts as an edit of it.
      writes: [keepId],
      deletes: others,
    };
  }

  private commit(device: number, next: SnapshotDomain, wall: number) {
    // As the production capture does, conflicts keep only live recoveries.
    const origins = new Map<string, string | null>();
    for (const entry of next.entries)
      origins.set(`entry\0${entry.entryId}`, entry.conflictOriginId);
    for (const tag of next.tags) origins.set(`tag\0${tag.tagId}`, tag.conflictOriginId);
    for (const prompt of next.prompts)
      origins.set(`prompt\0${prompt.promptId}`, prompt.conflictOriginId);
    const captured = {
      ...next,
      conflicts: next.conflicts.map((conflict) => ({
        ...conflict,
        recoveredEntityIds: conflict.recoveredEntityIds.filter(
          (id) => origins.get(`${conflict.entityType}\0${id}`) === conflict.entityId,
        ),
      })),
    };
    this.devices[device].clock.value = wall;
    this.devices[device].journal.mutate(captured);
  }

  private nextSequence(device: number): number {
    const { state, deviceId } = this.devices[device];
    return state.loadState(VAULT, deviceId).journalGeneration + 1;
  }

  private tombstone(
    device: number,
    entityType: SnapshotTombstone['entityType'],
    entityId: string,
    deleted: unknown,
  ): SnapshotTombstone {
    return {
      entityType,
      entityId,
      baseStateHash: null,
      deletedStateHash: deleted ? canonicalHash(deleted) : null,
      deletedByDeviceId: this.devices[device].deviceId,
      deletionSequence: this.nextSequence(device),
    };
  }

  private withTombstone(domain: SnapshotDomain, tomb: SnapshotTombstone): SnapshotDomain {
    return {
      ...domain,
      tombstones: [
        ...domain.tombstones.filter(
          (value) =>
            value.entityType !== tomb.entityType || value.entityId !== tomb.entityId,
        ),
        tomb,
      ].sort(byKey((value) => `${value.entityType}\0${value.entityId}`)),
    };
  }

  private deleteEntry(
    device: number,
    domain: SnapshotDomain,
    entryId: string,
    _wall: number,
  ): SnapshotDomain {
    const entry = domain.entries.find((value) => value.entryId === entryId);
    if (!entry) return domain;
    // repositories.ts hashes the entry without its attachment order.
    const { attachmentOrder: _order, ...deletedState } = entry;
    return this.withTombstone(
      {
        ...domain,
        entries: domain.entries.filter((value) => value.entryId !== entryId),
        entryTags: domain.entryTags.filter((value) => value.entryId !== entryId),
        media: domain.media.filter(
          (asset) => asset.ownerType !== 'entry' || asset.ownerId !== entryId,
        ),
      },
      this.tombstone(device, 'entry', entryId, deletedState),
    );
  }

  private editEntry(
    domain: SnapshotDomain,
    entryId: string,
    wall: number,
    change: (entry: SnapshotEntry) => SnapshotEntry,
  ): SnapshotDomain {
    return {
      ...domain,
      entries: domain.entries.map((entry) =>
        entry.entryId === entryId ? { ...change(entry), updatedAt: wall } : entry,
      ),
    };
  }

  /**
   * The app stamps edits with Date.now() in milliseconds. The simulation's
   * coarse clocks (one-day ticks, used to force v2 HLC ties) would repeat a
   * time across edits, so a repeated tick advances by 1 ms instead.
   */
  private now(device: number, wall: number): number {
    const target = this.devices[device];
    const time = wall === target.lastWall ? target.lastTime + 1 : wall;
    target.lastWall = wall;
    target.lastTime = time;
    return time;
  }

  apply(device: number, event: LocalEvent, rawWall: number): boolean {
    const wall = this.now(device, rawWall);
    const domain = this.domain(device);
    const next = this.next(device, domain, event, wall);
    if (!next) return false;
    if (event.kind === 'setProfileName' || event.kind === 'setProfilePhoto')
      this.devices[device].journal.localProfilePristine = false;
    this.commit(device, next, wall);
    return true;
  }

  private titleTaken(
    domain: SnapshotDomain,
    kind: 'tag' | 'prompt',
    title: string,
    except?: string,
  ): boolean {
    const wanted = this.normalizeTitle(kind, title);
    const items =
      kind === 'tag'
        ? domain.tags.map((tag) => ({ id: tag.tagId, title: tag.title }))
        : domain.prompts.map((prompt) => ({ id: prompt.promptId, title: prompt.title }));
    return items.some(
      (item) => item.id !== except && this.normalizeTitle(kind, item.title) === wanted,
    );
  }

  private next(
    device: number,
    domain: SnapshotDomain,
    event: LocalEvent,
    wall: number,
  ): SnapshotDomain | null {
    const profileTime = Math.max(1, wall, domain.profile.updatedAt + 1);
    const hasEntry = (id: string) => domain.entries.some((entry) => entry.entryId === id);
    switch (event.kind) {
      case 'createEntry':
        if (hasEntry(event.entryId)) return null;
        return {
          ...domain,
          entries: [
            ...domain.entries,
            {
              entryId: event.entryId,
              title: event.title,
              content: event.content,
              mood: event.mood,
              createdAt: wall,
              updatedAt: wall,
              conflictOriginId: null,
            },
          ].sort(byKey((entry) => entry.entryId)),
        };
      case 'setTitle':
        return this.editEntry(domain, event.entryId, wall, (entry) => ({
          ...entry,
          title: event.value,
        }));
      case 'setContent':
        return this.editEntry(domain, event.entryId, wall, (entry) => ({
          ...entry,
          content: event.value,
        }));
      case 'setMood':
        return this.editEntry(domain, event.entryId, wall, (entry) => ({
          ...entry,
          mood: event.mood,
        }));
      case 'setDate':
        return this.editEntry(domain, event.entryId, wall, (entry) => ({
          ...entry,
          createdAt: Math.max(0, entry.createdAt - event.offset),
        }));
      case 'deleteEntry':
        return this.deleteEntry(device, domain, event.entryId, wall);
      case 'addTag': {
        if (!domain.tags.some((tag) => tag.tagId === event.tagId)) return null;
        if (
          domain.entryTags.some(
            (value) => value.entryId === event.entryId && value.tagId === event.tagId,
          )
        )
          return null;
        const edited = this.editEntry(domain, event.entryId, wall, (entry) => entry);
        return {
          ...edited,
          entryTags: [
            ...edited.entryTags,
            { entryId: event.entryId, tagId: event.tagId, createdAt: wall },
          ].sort(byKey((value) => `${value.entryId}\0${value.tagId}`)),
        };
      }
      case 'removeTag': {
        const edited = this.editEntry(domain, event.entryId, wall, (entry) => entry);
        return {
          ...edited,
          entryTags: edited.entryTags.filter(
            (value) => value.entryId !== event.entryId || value.tagId !== event.tagId,
          ),
        };
      }
      case 'attach': {
        if (domain.media.some((asset) => asset.assetId === event.assetId)) return null;
        const blob = blobFor(event.assetId);
        void this.devices[device].media.writeVerified(blob.hash, blob.bytes);
        const asset: SnapshotMedia = {
          assetId: event.assetId,
          ownerType: 'entry',
          ownerId: event.entryId,
          kind: 'photo',
          blobHash: blob.hash,
          mimeType: 'image/jpeg',
          byteSize: blob.bytes.length,
          width: 10,
          height: 10,
          durationMs: null,
          createdAt: wall,
          updatedAt: wall,
        };
        const edited = this.editEntry(domain, event.entryId, wall, (entry) => ({
          ...entry,
          attachmentOrder: [
            ...(entry.attachmentOrder ??
              domain.media
                .filter((value) => value.ownerId === entry.entryId)
                .map((value) => value.assetId)
                .sort()),
            event.assetId,
          ],
        }));
        return {
          ...edited,
          media: [...edited.media, asset].sort(byKey((value) => value.assetId)),
        };
      }
      case 'detach': {
        const edited = this.editEntry(domain, event.entryId, wall, (entry) => {
          const order = entry.attachmentOrder?.filter((id) => id !== event.assetId);
          const { attachmentOrder: _order, ...rest } = entry;
          return order && order.length > 0 ? { ...rest, attachmentOrder: order } : rest;
        });
        return {
          ...edited,
          media: edited.media.filter((asset) => asset.assetId !== event.assetId),
        };
      }
      case 'createTag':
      case 'createPrompt': {
        const kind = event.kind === 'createTag' ? 'tag' : 'prompt';
        const title =
          kind === 'tag'
            ? sanitizeTagName(event.title)
            : sanitizePromptTitle(event.title);
        if (this.titleTaken(domain, kind, title)) return null;
        // The app uses a random UUID; any ID unique to this device behaves the same.
        const id = `${kind}-${this.devices[device].deviceId}-${++this.created}`;
        if (kind === 'tag')
          return {
            ...domain,
            tags: [
              ...domain.tags,
              {
                tagId: id,
                title,
                createdAt: wall,
                updatedAt: wall,
                conflictOriginId: null,
              },
            ].sort(byKey((tag) => tag.tagId)),
          };
        return {
          ...domain,
          prompts: [
            ...domain.prompts,
            {
              promptId: id,
              title,
              createdAt: wall,
              updatedAt: wall,
              conflictOriginId: null,
            },
          ].sort(byKey((prompt) => prompt.promptId)),
        };
      }
      case 'renameTag':
      case 'renamePrompt': {
        const kind = event.kind === 'renameTag' ? 'tag' : 'prompt';
        const title =
          kind === 'tag'
            ? sanitizeTagName(event.title)
            : sanitizePromptTitle(event.title);
        if (this.titleTaken(domain, kind, title, event.id)) return null;
        if (kind === 'tag')
          return {
            ...domain,
            tags: domain.tags.map((tag) =>
              tag.tagId === event.id ? { ...tag, title, updatedAt: wall } : tag,
            ),
          };
        return {
          ...domain,
          prompts: domain.prompts.map((prompt) =>
            prompt.promptId === event.id ? { ...prompt, title, updatedAt: wall } : prompt,
          ),
        };
      }
      case 'deleteTag': {
        const tag = domain.tags.find((value) => value.tagId === event.id);
        if (!tag) return null;
        // deleteTagInTransaction also re-saves every entry that had the tag.
        const tagged = new Set(
          domain.entryTags
            .filter((value) => value.tagId === event.id)
            .map((value) => value.entryId),
        );
        return this.withTombstone(
          {
            ...domain,
            entries: domain.entries.map((entry) =>
              tagged.has(entry.entryId) ? { ...entry, updatedAt: wall } : entry,
            ),
            tags: domain.tags.filter((value) => value.tagId !== event.id),
            entryTags: domain.entryTags.filter((value) => value.tagId !== event.id),
          },
          this.tombstone(device, 'tag', event.id, tag),
        );
      }
      case 'deletePrompt': {
        const prompt = domain.prompts.find((value) => value.promptId === event.id);
        if (!prompt) return null;
        return this.withTombstone(
          {
            ...domain,
            prompts: domain.prompts.filter((value) => value.promptId !== event.id),
          },
          this.tombstone(device, 'prompt', event.id, prompt),
        );
      }
      case 'setProfileName':
        // repositories.ts: a profile stamp never moves backwards.
        return {
          ...domain,
          profile: {
            ...domain.profile,
            displayName: event.value,
            updatedAt: profileTime,
          },
        };
      case 'setProfilePhoto': {
        const media = domain.media.filter((asset) => asset.ownerType !== 'profile');
        if (event.assetId === null)
          return {
            ...domain,
            media,
            profile: { ...domain.profile, photoAssetId: null, updatedAt: profileTime },
          };
        const blob = blobFor(event.assetId);
        void this.devices[device].media.writeVerified(blob.hash, blob.bytes);
        return {
          ...domain,
          media: [
            ...media,
            {
              assetId: event.assetId,
              ownerType: 'profile' as const,
              ownerId: 'profile',
              kind: 'profile-photo' as const,
              blobHash: blob.hash,
              mimeType: 'image/jpeg',
              byteSize: blob.bytes.length,
              width: 10,
              height: 10,
              durationMs: null,
              createdAt: wall,
              updatedAt: wall,
            },
          ].sort(byKey((value) => value.assetId)),
          profile: {
            ...domain.profile,
            photoAssetId: event.assetId,
            updatedAt: profileTime,
          },
        };
      }
      case 'reorder': {
        const ids = domain.media
          .filter(
            (asset) => asset.ownerType === 'entry' && asset.ownerId === event.entryId,
          )
          .map((asset) => asset.assetId)
          .sort();
        if (ids.length < 2) return null;
        return this.editEntry(domain, event.entryId, wall, (entry) => ({
          ...entry,
          attachmentOrder: [...(entry.attachmentOrder ?? ids)].reverse(),
        }));
      }
      // v1 keeps acknowledgements on the device; nothing syncs.
      case 'acknowledge':
      case 'keep':
      case 'keepBoth':
        return null;
    }
  }

  async sync(device: number, _peer: number | null, wall: number): Promise<SyncOutcome> {
    const target = this.devices[device];
    target.clock.value = wall;
    const before = canonicalize(target.journal.current());
    try {
      const result = await target.engine.sync();
      if (result.status === 'attention' || result.status === 'retry') {
        const detail = target.state.loadState(VAULT, target.deviceId).lastErrorClass;
        // Paused vaults stay paused; clear so later passes can be observed.
        target.state.clearPause(VAULT, target.deviceId);
        return { ok: false, reason: `${result.status}:${result.reason}:${detail}` };
      }
      const changed =
        result.status === 'published' ||
        before !== canonicalize(target.journal.current());
      return { ok: true, changed };
    } catch (error) {
      return {
        ok: false,
        reason: `throw:${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  fingerprint(device: number): string {
    return canonicalize(this.domain(device));
  }
}
