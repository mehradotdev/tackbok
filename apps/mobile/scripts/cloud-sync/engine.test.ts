import { afterEach, describe, expect, test } from 'bun:test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  encodeCanonicalBytes,
  canonicalize,
} from '../../src/lib/cloudSync/snapshot/canonical';
import { decodeSnapshot, encodeSnapshot } from '../../src/lib/cloudSync/snapshot/codec';
import { sha256Bytes } from '../../src/lib/cloudSync/snapshot/sha256';
import { BaseShadowManager } from '../../src/lib/cloudSync/snapshot/sync/baseShadow';
import { SnapshotSyncEngine } from '../../src/lib/cloudSync/snapshot/sync/engine';
import { SnapshotCleanup } from '../../src/lib/cloudSync/snapshot/sync/cleanup';
import {
  commonAncestorDomain,
  type SnapshotLineage,
} from '../../src/lib/cloudSync/snapshot/sync/frontier';
import {
  FakeSnapshotProvider,
  MemoryBaseShadowFileStore,
  MemorySnapshotJournalStore,
  MemorySnapshotMediaStore,
} from '../../src/lib/cloudSync/snapshot/sync/fakes';
import {
  SQLiteSyncStateStore,
  type SyncDatabase,
} from '../../src/lib/cloudSync/snapshot/sync/sqliteState';
import {
  ATTENTION_RECOVERY_ACTION,
  SnapshotProviderError,
  type SyncAttentionReason,
  type SnapshotKillPoint,
  type SnapshotSyncHooks,
} from '../../src/lib/cloudSync/snapshot/sync/types';
import type {
  SnapshotDomain,
  SnapshotEntry,
} from '../../src/lib/cloudSync/snapshot/types';
import { PHASE_FOR_ENGINE_ACTIVITY } from '../../src/lib/cloudSync/runtime/activity';
import type { SyncPassPhase } from '../../src/lib/cloudSync/runtime/SyncRuntime';
import { clearAuthorizationPause } from '../../src/lib/cloudSync/ui/connectionRecovery';
import { encodeGzip } from '../../src/lib/zip/core/gzip-codec';

const databases: Database[] = [];
const SNAPSHOT_MIGRATION = readFileSync(
  join(import.meta.dir, '../../src/drizzle/0004_colorful_xavin.sql'),
  'utf8',
)
  .split('DROP INDEX `custom_prompts_title_unique`')[0]
  .replaceAll('--> statement-breakpoint', '');

class BunSyncDatabase implements SyncDatabase {
  constructor(private readonly database: Database) {}
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

function database(): BunSyncDatabase {
  const sqlite = new Database(':memory:', { strict: true });
  sqlite.exec(SNAPSHOT_MIGRATION);
  databases.push(sqlite);
  return new BunSyncDatabase(sqlite);
}

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

function entry(entryId: string, content: string, updatedAt = 1): SnapshotEntry {
  return {
    entryId,
    title: null,
    content,
    mood: null,
    createdAt: 1,
    updatedAt,
    conflictOriginId: null,
  };
}

function withEntry(domain: SnapshotDomain, value: SnapshotEntry): SnapshotDomain {
  const next = structuredClone(domain);
  next.entries = [
    ...next.entries.filter((item) => item.entryId !== value.entryId),
    value,
  ].sort((left, right) => left.entryId.localeCompare(right.entryId));
  return next;
}

interface Clock {
  value: number;
}

interface Harness {
  vaultId: string;
  deviceId: string;
  provider: FakeSnapshotProvider;
  database: BunSyncDatabase;
  state: SQLiteSyncStateStore;
  files: MemoryBaseShadowFileStore;
  shadows: BaseShadowManager;
  journal: MemorySnapshotJournalStore;
  media: MemorySnapshotMediaStore;
  clock: Clock;
  engine(hooks?: SnapshotSyncHooks): SnapshotSyncEngine;
}

function harness(
  deviceId: string,
  initial = blankDomain(),
  provider = new FakeSnapshotProvider(),
  clock: Clock = { value: 1_800_000_000_000 },
  vaultId = 'vault-sync-test',
): Harness {
  const syncDatabase = database();
  const state = new SQLiteSyncStateStore(syncDatabase, () => clock.value);
  const files = new MemoryBaseShadowFileStore();
  const shadows = new BaseShadowManager(files);
  const journal = new MemorySnapshotJournalStore(initial, state, vaultId, deviceId);
  const media = new MemorySnapshotMediaStore();
  return {
    vaultId,
    deviceId,
    provider,
    database: syncDatabase,
    state,
    files,
    shadows,
    journal,
    media,
    clock,
    engine: (hooks = {}) =>
      new SnapshotSyncEngine(
        vaultId,
        deviceId,
        state,
        shadows,
        journal,
        media,
        provider,
        hooks,
        () => clock.value,
      ),
  };
}

class SimulatedProcessDeath extends Error {}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('durable snapshot publisher', () => {
  test.each([1, 2, 3])(
    '%s fresh devices stop publishing once journal data converges',
    async (count) => {
      const provider = new FakeSnapshotProvider();
      const devices = Array.from({ length: count }, (_, i) =>
        harness(`idle-${i}`, blankDomain(), provider),
      );
      devices[0].journal.mutate(withEntry(blankDomain(), entry('shared', 'Initial')));
      expect((await devices[0].engine().sync()).status).toBe('published');
      for (const device of devices.slice(1))
        expect((await device.engine().sync()).status).toBe('pulled');
      expect(provider.snapshotIds(devices[0].vaultId)).toHaveLength(1);
      const quiet = async () => {
        provider.requests.length = 0;
        for (let round = 0; round < 4; round++) {
          for (const device of devices)
            expect((await device.engine().sync()).status).toBe('up-to-date');
        }
        expect(provider.requests).not.toContain('upload-snapshot');
        expect(provider.requests).not.toContain('update-head');
      };
      await quiet();
      // The newest device may have never published a head before this edit.
      const writer = devices.at(-1)!;
      writer.journal.mutate(
        withEntry(writer.journal.current(), entry('shared', 'Edited', 2)),
      );
      expect((await writer.engine().sync()).status).toBe('published');
      provider.requests.length = 0;
      for (const device of devices.filter((d) => d !== writer)) {
        expect((await device.engine().sync()).status).toBe('pulled');
        expect(device.journal.current().entries[0].content).toBe('Edited');
      }
      expect(provider.requests).not.toContain('upload-snapshot');
      expect(provider.requests).not.toContain('update-head');
      await quiet();
      expect(provider.snapshotIds(writer.vaultId)).toHaveLength(2);
    },
  );

  test('a dirty generation with identical journal data settles locally', async () => {
    const app = harness('no-op');
    app.journal.mutate(withEntry(blankDomain(), entry('same', 'Same')));
    await app.engine().sync();
    app.journal.mutate(app.journal.current());
    app.provider.requests.length = 0;
    expect(await app.engine().sync()).toMatchObject({
      status: 'pulled',
      actionableChanges: 0,
    });
    expect(app.provider.requests).not.toContain('upload-snapshot');
    expect(app.provider.requests).not.toContain('update-head');
    expect((await app.engine().sync()).status).toBe('up-to-date');
  });

  test('failed pull checkpoint storage pauses safely and retries without publishing', async () => {
    const source = harness('pull-storage-source');
    source.journal.mutate(withEntry(blankDomain(), entry('shared', 'Cloud')));
    await source.engine().sync();
    const target = harness('pull-storage-target', blankDomain(), source.provider);
    const write = target.files.writeTempAndFsync.bind(target.files);
    target.files.writeTempAndFsync = async () => {
      throw new Error('ENOSPC');
    };
    source.provider.requests.length = 0;
    expect(await target.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'local-storage-full',
    });
    expect(target.state.loadBaseCheckpoint(target.vaultId, target.deviceId)).toBeNull();
    target.files.writeTempAndFsync = write;
    target.state.clearPause(target.vaultId, target.deviceId);
    expect((await target.engine().sync()).status).toBe('pulled');
    expect(source.provider.requests).not.toContain('upload-snapshot');
    expect(source.provider.requests).not.toContain('update-head');
  });

  test('new observations cannot overwrite the file referenced by the prior checkpoint', async () => {
    const app = harness('pull-checkpoint-reader');
    await app.engine().sync();
    const old = app.state.loadBaseCheckpoint(app.vaultId, app.deviceId)!;
    const shadow = (await app.shadows.load(old)).shadow!;
    const next = await app.shadows.prepareAndReplace(app.deviceId, 0, {
      ...shadow,
      acceptedDeviceHeads: [
        ...shadow.acceptedDeviceHeads,
        {
          deviceId: 'z-other',
          deviceSequence: 1,
          snapshotId: 'a'.repeat(64),
        },
      ],
    });
    expect(next.fileName).not.toBe(old.fileName);
    // Simulate death after replacing the file, but before committing SQLite.
    expect((await app.shadows.load(old)).shadow).toEqual(shadow);
    app.state.settlePulledBase(next, 0);
    expect(app.state.listShadowReaperFiles()).toContain(old.fileName);
    app.state.settlePulledBase(old, 0);
    expect(app.state.listShadowReaperFiles()).not.toContain(old.fileName);
  });

  test('existing identical heads settle without another acknowledgment upload', async () => {
    const app = harness('old-loop-reader');
    const domain = withEntry(blankDomain(), entry('same', 'Same'));
    for (const author of ['old-a', 'old-b', 'old-c']) {
      const encoded = encodeSnapshot({
        ...domain,
        format: 'tackbok-snapshot',
        vaultId: app.vaultId,
        authorDeviceId: author,
        deviceSequence: 5,
        createdAt: 1,
        parentSnapshotIds: [],
        observedDeviceHeads: [],
      });
      app.provider.injectSnapshot(
        app.vaultId,
        encoded.snapshotId,
        encoded.compressedBytes,
        1,
      );
      app.provider.injectPhysicalHead({
        format: 'tackbok-device-head',
        vaultId: app.vaultId,
        deviceId: author,
        deviceSequence: 5,
        snapshotId: encoded.snapshotId,
        updatedAt: 1,
      });
    }
    expect((await app.engine().sync()).status).toBe('pulled');
    expect((await app.engine().sync()).status).toBe('up-to-date');
    expect(app.provider.requests).not.toContain('upload-snapshot');
    expect(app.provider.requests).not.toContain('update-head');
  });

  test('deletions and date edits propagate by pulling, then stay quiet', async () => {
    const source = harness('domain-source');
    source.journal.mutate(withEntry(blankDomain(), entry('same', 'Same')));
    await source.engine().sync();
    const target = harness('domain-target', blankDomain(), source.provider);
    await target.engine().sync();
    source.journal.mutate(
      withEntry(source.journal.current(), {
        ...entry('same', 'Same', 2),
        createdAt: 500,
      }),
    );
    expect((await source.engine().sync()).status).toBe('published');
    expect((await target.engine().sync()).status).toBe('pulled');
    expect(target.journal.current().entries[0].createdAt).toBe(500);
    const deleted = source.journal.current();
    const hash = canonicalize(deleted.entries[0]);
    deleted.entries = [];
    deleted.tombstones = [
      {
        entityType: 'entry',
        entityId: 'same',
        baseStateHash: sha256Bytes(new TextEncoder().encode(hash)),
        deletedStateHash: sha256Bytes(new TextEncoder().encode(hash)),
        deletedByDeviceId: source.deviceId,
        deletionSequence: 3,
      },
    ];
    source.journal.mutate(deleted);
    expect((await source.engine().sync()).status).toBe('published');
    source.provider.requests.length = 0;
    expect((await target.engine().sync()).status).toBe('pulled');
    expect(target.journal.current()).toEqual(deleted);
    expect((await source.engine().sync()).status).toBe('up-to-date');
    expect(source.provider.requests).not.toContain('upload-snapshot');
    expect(source.provider.requests).not.toContain('update-head');
  });

  test('an edit before remote apply retries without overwriting or settling that edit', async () => {
    const source = harness('pull-source');
    source.journal.mutate(withEntry(blankDomain(), entry('shared', 'Cloud')));
    await source.engine().sync();
    const target = harness('pull-target', blankDomain(), source.provider);
    let edited = false;
    expect(
      await target
        .engine({
          beforeHeadRecheck() {
            if (edited) return;
            edited = true;
            target.journal.mutate(
              withEntry(target.journal.current(), entry('local', 'Local edit')),
            );
          },
        })
        .sync(),
    ).toMatchObject({ status: 'retry', actionableChanges: 1 });
    expect(target.state.loadBaseCheckpoint(target.vaultId, target.deviceId)).toBeNull();
    expect(target.journal.current().entries[0].content).toBe('Local edit');
    expect((await target.engine().sync()).status).toBe('published');
    expect(target.journal.current().entries.map((e) => e.entryId)).toEqual([
      'local',
      'shared',
    ]);
  });

  test('an edit after remote apply remains queued while the remote base is committed', async () => {
    const source = harness('pull-late-source');
    source.journal.mutate(withEntry(blankDomain(), entry('shared', 'Cloud')));
    await source.engine().sync();
    const target = harness('pull-late-target', blankDomain(), source.provider);
    expect(
      await target
        .engine({
          at(point) {
            if (point === 'during-merge-application') {
              target.journal.mutate(
                withEntry(target.journal.current(), entry('shared', 'Local edit', 2)),
              );
            }
          },
        })
        .sync(),
    ).toMatchObject({ status: 'pulled', actionableChanges: 1 });
    expect((await target.engine().sync()).status).toBe('published');
    expect(target.journal.current().entries).toEqual([entry('shared', 'Local edit', 2)]);
    expect(target.journal.current().conflicts).toEqual([]);
  });

  test.each<SnapshotKillPoint>([
    'during-merge-application',
    'after-base-shadow-temp-fsynced',
    'after-base-shadow-readback',
    'after-base-shadow-renamed',
    'after-base-checkpoint-settled',
  ])('remote adoption survives interruption at %s without uploading', async (point) => {
    const source = harness('pull-crash-source');
    source.journal.mutate(withEntry(blankDomain(), entry('shared', 'Cloud')));
    await source.engine().sync();
    const target = harness('pull-crash-target', blankDomain(), source.provider);
    source.provider.requests.length = 0;
    await expect(
      target
        .engine({
          at(current) {
            if (current === point) throw new SimulatedProcessDeath(current);
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    expect(['pulled', 'up-to-date']).toContain((await target.engine().sync()).status);
    expect(target.journal.current().entries).toEqual([entry('shared', 'Cloud')]);
    expect((await target.engine().sync()).status).toBe('up-to-date');
    expect(source.provider.requests).not.toContain('upload-snapshot');
    expect(source.provider.requests).not.toContain('update-head');
  });
  test('multi-device cleanup retains current heads, divergent branches, and unpublished candidates', async () => {
    const first = harness('retention-a');
    for (let index = 0; index < 6; index++) {
      first.clock.value++;
      first.journal.mutate(
        withEntry(first.journal.current(), entry(`entry-${index}`, 'Keep')),
      );
      await first.engine().sync();
    }
    const second = harness('retention-b', blankDomain(), first.provider, first.clock);
    await second.engine().sync();
    const secondDomain = second.journal.current();
    secondDomain.entries[0].content = 'Second device';
    second.journal.mutate(secondDomain);
    await second.engine().sync();
    const cleaner = new SnapshotCleanup({
      vaultId: first.vaultId,
      stateStore: first.state,
      shadowManager: first.shadows,
      provider: first.provider,
      hooks: {},
      now: () => first.clock.value,
    });
    const cleanup = () => cleaner.run();
    first.clock.value += 31 * 24 * 60 * 60 * 1000;
    // A separate, unobserved device is a divergent branch, even when old.
    const divergent = encodeSnapshot({
      ...blankDomain(),
      format: 'tackbok-snapshot',
      vaultId: first.vaultId,
      authorDeviceId: 'offline',
      deviceSequence: 1,
      createdAt: 1,
      parentSnapshotIds: [],
      observedDeviceHeads: [],
    });
    first.provider.injectSnapshot(
      first.vaultId,
      divergent.snapshotId,
      divergent.compressedBytes,
      1,
    );
    first.provider.injectPhysicalHead({
      format: 'tackbok-device-head',
      vaultId: first.vaultId,
      deviceId: 'offline',
      deviceSequence: 1,
      snapshotId: divergent.snapshotId,
      updatedAt: 1,
    });
    // More retained objects than one cleanup batch must not starve covered history.
    for (let i = 0; i < 11; i++) {
      const orphan = encodeSnapshot({
        ...divergent.payload,
        authorDeviceId: `unobserved-${i}`,
      });
      first.provider.injectSnapshot(
        first.vaultId,
        orphan.snapshotId,
        orphan.compressedBytes,
        1,
      );
    }
    const before = first.provider.snapshotIds(first.vaultId);
    await cleanup();
    expect(first.provider.snapshotIds(first.vaultId)).toEqual(before);
    first.provider.removeDeviceHeadForTest(first.vaultId, 'offline');
    // Uploaded but not head-advanced: its sequence is not yet covered.
    const pending = encodeSnapshot({
      ...blankDomain(),
      format: 'tackbok-snapshot',
      vaultId: first.vaultId,
      authorDeviceId: first.deviceId,
      deviceSequence: 100,
      createdAt: 2,
      parentSnapshotIds: [],
      observedDeviceHeads: [],
    });
    first.provider.injectSnapshot(
      first.vaultId,
      pending.snapshotId,
      pending.compressedBytes,
      2,
    );
    await cleanup();
    await cleanup();
    await cleanup();
    const remaining = first.provider.snapshotIds(first.vaultId);
    expect(remaining.length).toBeLessThan(before.length);
    expect(remaining).toContain(pending.snapshotId);
    expect(remaining).toContain(divergent.snapshotId);
    for (const { head } of first.provider.physicalHeads(first.vaultId)) {
      expect(remaining).toContain(head.snapshotId);
    }
    const restored = harness(
      'retention-restore',
      blankDomain(),
      first.provider,
      first.clock,
    );
    expect((await restored.engine().sync()).status).toBe('pulled');
    expect(restored.journal.current().entries).toHaveLength(6);
  });

  test('cleanup aborts when a head changes immediately before deletion', async () => {
    const app = harness('retention-race');
    for (let i = 0; i < 5; i++) {
      app.clock.value++;
      app.journal.mutate(withEntry(app.journal.current(), entry(`entry-${i}`, 'Keep')));
      await app.engine().sync();
    }
    app.clock.value += 31 * 24 * 60 * 60 * 1000;
    const before = app.provider.snapshotIds(app.vaultId);
    await new SnapshotCleanup({
      vaultId: app.vaultId,
      stateStore: app.state,
      shadowManager: app.shadows,
      provider: app.provider,
      now: () => app.clock.value,
      hooks: {
        at() {
          app.provider.injectPhysicalHead({
            ...app.provider.physicalHeads(app.vaultId)[0].head,
            deviceId: 'arriving-device',
          });
        },
      },
    }).run();
    expect(app.provider.snapshotIds(app.vaultId)).toEqual(before);
    expect(app.provider.requests).not.toContain('delete-snapshot');
    // The new device's envelope wrongly claims the first device's snapshot.
    // Even identical snapshot IDs must be checked against each head envelope.
    await new SnapshotCleanup({
      vaultId: app.vaultId,
      stateStore: app.state,
      shadowManager: app.shadows,
      provider: app.provider,
      now: () => app.clock.value,
      hooks: {},
    }).run();
    expect(app.provider.requests).not.toContain('delete-snapshot');
  });
  test('date edits recover from the old pause and converge across two devices', async () => {
    const first = harness('date-ios', withEntry(blankDomain(), entry('dated', 'Body')));
    first.state.markDirty(first.vaultId, first.deviceId);
    await first.engine().sync();
    const second = harness('date-android', blankDomain(), first.provider);
    await second.engine().sync();
    await first.engine().sync();
    first.journal.mutate(
      withEntry(first.journal.current(), {
        ...entry('dated', 'Body', 2),
        createdAt: 864000001,
      }),
    );
    first.state.setPause(
      first.vaultId,
      first.deviceId,
      'invalid-remote-snapshot',
      'merge-invalid-immutable-mutation',
    );
    first.state.clearPause(first.vaultId, first.deviceId);
    expect((await first.engine().sync()).status).toBe('published');
    expect((await second.engine().sync()).status).toBe('pulled');
    expect(second.journal.current().entries[0].createdAt).toBe(864000001);
    expect(second.journal.current().conflicts).toEqual([]);
  });

  test('reuses validated snapshots for head rechecks but verifies again next pass', async () => {
    const first = harness('cache-a', withEntry(blankDomain(), entry('cached', 'Body')));
    first.state.markDirty(first.vaultId, first.deviceId);
    await first.engine().sync();
    const second = harness('cache-b', blankDomain(), first.provider);
    first.provider.requests.length = 0;
    expect((await second.engine().sync()).status).toBe('pulled');
    expect(
      first.provider.requests.filter((op) => op === 'download-snapshot'),
    ).toHaveLength(1);
    first.provider.requests.length = 0;
    expect((await second.engine().sync()).status).toBe('up-to-date');
    expect(
      first.provider.requests.filter((op) => op === 'download-snapshot').length,
    ).toBeGreaterThan(0);
  });
  test('reconnect clears durable auth failures and the existing backup syncs again', async () => {
    const app = harness(
      'device-reconnect',
      withEntry(blankDomain(), entry('local-entry', 'Local')),
    );
    app.state.markDirty(app.vaultId, app.deviceId);
    for (const reason of [
      'authorization-required',
      'provider-permission-denied',
    ] as const) {
      app.state.setPause(app.vaultId, app.deviceId, reason, 'provider-auth');
      expect((await app.engine().sync()).status).toBe('attention');
      clearAuthorizationPause(app.state, app.vaultId, app.deviceId);
      expect((await app.engine().sync()).status).not.toBe('attention');
      expect(app.state.loadState(app.vaultId, app.deviceId).pauseReason).toBeNull();
    }
    app.state.setPause(app.vaultId, app.deviceId, 'missing-media', 'missing');
    clearAuthorizationPause(app.state, app.vaultId, app.deviceId);
    expect(app.state.loadState(app.vaultId, app.deviceId).pauseReason).toBe(
      'missing-media',
    );
  });

  test('Merge attaches a local journal to an existing backup and preserves both on both devices', async () => {
    const cloud = harness(
      'old-device',
      withEntry(blankDomain(), entry('cloud-entry', 'Cloud')),
    );
    cloud.state.markDirty(cloud.vaultId, cloud.deviceId);
    await cloud.engine().sync();
    const local = harness(
      'new-device',
      withEntry(blankDomain(), entry('local-entry', 'Local')),
      cloud.provider,
    );
    local.state.markDirty(local.vaultId, local.deviceId);
    expect((await local.engine().sync()).status).toBe('published');
    await cloud.engine().sync();
    for (const app of [local, cloud]) {
      expect(
        (await app.journal.capture()).domain.entries.map((value) => value.entryId).sort(),
      ).toEqual(['cloud-entry', 'local-entry']);
    }
  });

  test('a 2,000-entry import coalesces into one immutable snapshot and one head write', async () => {
    const imported = blankDomain();
    imported.entries = Array.from({ length: 2_000 }, (_, index) =>
      entry(`entry-${String(index).padStart(4, '0')}`, `Synthetic import row ${index}`),
    );
    const app = harness('device-import', imported);
    app.state.markDirty(app.vaultId, app.deviceId, 2_000);

    const result = await app.engine().sync();
    expect(result.status).toBe('published');
    expect(
      app.provider.requests.filter((value) => value === 'upload-snapshot'),
    ).toHaveLength(1);
    expect(app.provider.requests.filter((value) => value === 'update-head')).toHaveLength(
      1,
    );
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(1);
    expect(app.state.loadPending(app.vaultId, app.deviceId)).toBeNull();
    const checkpoint = app.state.loadBaseCheckpoint(app.vaultId, app.deviceId)!;
    expect(app.files.fsynced.has(checkpoint.fileName)).toBe(true);
    expect(app.state.loadState(app.vaultId, app.deviceId)).toMatchObject({
      journalGeneration: 2_000,
      settledGeneration: 2_000,
      nextDeviceSequence: 2,
    });
  });

  test.each([
    'after-local-mutation',
    'after-candidate-persisted',
    'after-snapshot-uploaded',
    'after-snapshot-verified',
    'after-head-advanced',
    'during-merge-application',
    'after-base-shadow-temp-fsynced',
    'after-base-shadow-readback',
    'after-base-shadow-renamed',
    'after-base-checkpoint-settled',
  ] satisfies SnapshotKillPoint[])(
    'restart at %s preserves intent and the previous backup',
    async (point) => {
      const app = harness('device-kill');
      app.journal.mutate(withEntry(blankDomain(), entry('entry-base', 'Verified base')));
      await app.engine().sync();
      const previousId = app.provider.physicalHeads(app.vaultId)[0].head.snapshotId;
      app.clock.value += 1;
      app.journal.mutate(
        withEntry(app.journal.current(), entry('entry-next', 'Queued after base', 2)),
      );
      let injected = false;
      const hooks: SnapshotSyncHooks = {
        at(candidate) {
          if (!injected && candidate === point) {
            injected = true;
            throw new SimulatedProcessDeath(point);
          }
        },
      };

      await expect(app.engine(hooks).sync()).rejects.toBeInstanceOf(
        SimulatedProcessDeath,
      );
      const resumed = await app.engine().sync();
      expect(['published', 'up-to-date']).toContain(resumed.status);
      expect(app.provider.snapshotIds(app.vaultId)).toContain(previousId);
      expect(app.journal.current().entries.map((value) => value.content)).toEqual([
        'Verified base',
        'Queued after base',
      ]);
      expect(app.state.loadPending(app.vaultId, app.deviceId)).toBeNull();
      expect(app.state.loadState(app.vaultId, app.deviceId).settledGeneration).toBe(
        app.state.loadState(app.vaultId, app.deviceId).journalGeneration,
      );
    },
  );

  test('media survives a transfer death and is uploaded before its referencing snapshot', async () => {
    const bytes = new TextEncoder().encode('synthetic-media-bytes');
    const blobHash = sha256Bytes(bytes);
    const domain = withEntry(blankDomain(), entry('entry-media', 'Has media'));
    domain.media = [
      {
        assetId: 'asset-media',
        ownerType: 'entry',
        ownerId: 'entry-media',
        kind: 'photo',
        blobHash,
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        width: 10,
        height: 10,
        durationMs: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const app = harness('device-media', domain);
    await app.media.writeVerified(blobHash, bytes);
    app.state.markDirty(app.vaultId, app.deviceId);
    let killed = false;
    await expect(
      app
        .engine({
          at(point) {
            if (!killed && point === 'during-media-transfer') {
              killed = true;
              throw new SimulatedProcessDeath(point);
            }
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    expect(app.provider.snapshotIds(app.vaultId)).toEqual([]);

    await app.engine().sync();
    const mediaUpload = app.provider.requests.indexOf('upload-media');
    const snapshotUpload = app.provider.requests.indexOf('upload-snapshot');
    expect(mediaUpload).toBeGreaterThanOrEqual(0);
    expect(snapshotUpload).toBeGreaterThan(mediaUpload);
  });

  test('a resumed candidate re-establishes vanished media before snapshot upload', async () => {
    const bytes = new TextEncoder().encode('synthetic-resume-media');
    const blobHash = sha256Bytes(bytes);
    const domain = withEntry(blankDomain(), entry('entry-resume-media', 'Resume media'));
    domain.media = [
      {
        assetId: 'asset-resume-media',
        ownerType: 'entry',
        ownerId: 'entry-resume-media',
        kind: 'photo',
        blobHash,
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        width: 1,
        height: 1,
        durationMs: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const app = harness('device-resume-media', domain);
    await app.media.writeVerified(blobHash, bytes);
    app.state.markDirty(app.vaultId, app.deviceId);
    await expect(
      app
        .engine({
          at(point) {
            if (point === 'after-candidate-persisted')
              throw new SimulatedProcessDeath(point);
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    app.provider.removeMediaForTest(app.vaultId, blobHash);

    expect((await app.engine().sync()).status).toBe('published');
    expect(
      app.provider.requests.filter((value) => value === 'upload-media'),
    ).toHaveLength(2);
    expect(app.provider.requests.lastIndexOf('upload-media')).toBeLessThan(
      app.provider.requests.indexOf('upload-snapshot'),
    );
  });

  test('a candidate made stale by another device before upload is re-planned', async () => {
    const first = harness('stale-candidate-a');
    first.journal.mutate(
      withEntry(
        withEntry(blankDomain(), entry('entry-a', 'Original A')),
        entry('entry-b', 'Original B'),
      ),
    );
    expect((await first.engine().sync()).status).toBe('published');
    const second = harness('stale-candidate-b', blankDomain(), first.provider);
    expect((await second.engine().sync()).status).toBe('pulled');

    first.journal.mutate(
      withEntry(first.journal.current(), entry('entry-b', 'Edited by first', 2)),
    );
    await expect(
      first
        .engine({
          at(point) {
            if (point === 'after-candidate-persisted')
              throw new SimulatedProcessDeath(point);
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    const stale = first.state.loadPending(first.vaultId, first.deviceId)!;

    second.journal.mutate(
      withEntry(second.journal.current(), entry('entry-a', 'Edited by second', 3)),
    );
    expect((await second.engine().sync()).status).toBe('published');

    expect((await first.engine().sync()).status).toBe('published');
    expect(first.provider.snapshotIds(first.vaultId)).not.toContain(stale.snapshotId);
    expect(first.state.loadPending(first.vaultId, first.deviceId)).toBeNull();
    expect((await second.engine().sync()).status).toBe('pulled');
    const expected = [
      entry('entry-a', 'Edited by second', 3),
      entry('entry-b', 'Edited by first', 2),
    ];
    for (const device of [first, second]) {
      expect(device.journal.current().entries).toEqual(expected);
      expect(device.journal.current().conflicts).toEqual([]);
      expect((await device.engine().sync()).status).toBe('up-to-date');
    }
  });

  test('a same-sequence duplicate head does not make every candidate stale', async () => {
    const first = harness('duplicate-head-a');
    first.journal.mutate(withEntry(blankDomain(), entry('entry-a', 'Original A')));
    expect((await first.engine().sync()).status).toBe('published');
    const second = harness('duplicate-head-b', blankDomain(), first.provider);
    await second.engine().sync();
    // A retry artifact: same device and sequence, pointing at a missing snapshot.
    const [{ head }] = first.provider.physicalHeads(first.vaultId);
    first.provider.injectPhysicalHead({ ...head, snapshotId: 'f'.repeat(64) });

    second.journal.mutate(
      withEntry(second.journal.current(), entry('entry-b', 'Added by second', 2)),
    );
    expect((await second.engine().sync()).status).toBe('published');
    expect((await second.engine().sync()).status).toBe('up-to-date');
  });

  test('a valid same-sequence head that appears before upload still stops as ambiguous', async () => {
    const app = harness('late-ambiguous-head');
    app.journal.mutate(withEntry(blankDomain(), entry('entry-a', 'Original A')));
    expect((await app.engine().sync()).status).toBe('published');
    const [{ head }] = app.provider.physicalHeads(app.vaultId);

    app.journal.mutate(withEntry(app.journal.current(), entry('entry-b', 'Added', 2)));
    await expect(
      app
        .engine({
          at(point) {
            if (point === 'after-candidate-persisted')
              throw new SimulatedProcessDeath(point);
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    const pending = app.state.loadPending(app.vaultId, app.deviceId)!;

    const rival = encodeSnapshot({
      format: 'tackbok-snapshot',
      vaultId: app.vaultId,
      parentSnapshotIds: [],
      observedDeviceHeads: [],
      authorDeviceId: head.deviceId,
      deviceSequence: head.deviceSequence,
      createdAt: 9,
      ...withEntry(blankDomain(), entry('entry-rival', 'Rival')),
    });
    app.provider.injectSnapshot(app.vaultId, rival.snapshotId, rival.compressedBytes, 9);
    app.provider.injectPhysicalHead({ ...head, snapshotId: rival.snapshotId });

    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
    expect(app.provider.snapshotIds(app.vaultId)).not.toContain(pending.snapshotId);
  });

  test('an uploaded candidate keeps its durable recovery after heads change', async () => {
    const first = harness('uploaded-candidate-a');
    first.journal.mutate(withEntry(blankDomain(), entry('entry-a', 'Original A')));
    expect((await first.engine().sync()).status).toBe('published');
    const second = harness('uploaded-candidate-b', blankDomain(), first.provider);
    expect((await second.engine().sync()).status).toBe('pulled');

    first.journal.mutate(
      withEntry(first.journal.current(), entry('entry-b', 'Added by first', 2)),
    );
    await expect(
      first
        .engine({
          at(point) {
            if (point === 'after-snapshot-uploaded')
              throw new SimulatedProcessDeath(point);
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    const uploaded = first.state.loadPending(first.vaultId, first.deviceId)!;
    expect(uploaded.stage).toBe('snapshot-uploaded');

    second.journal.mutate(
      withEntry(second.journal.current(), entry('entry-c', 'Added by second', 3)),
    );
    expect((await second.engine().sync()).status).toBe('published');

    expect(await first.engine().sync()).toMatchObject({
      status: 'published',
      snapshotId: uploaded.snapshotId,
    });
    for (let round = 0; round < 3; round++) {
      await second.engine().sync();
      await first.engine().sync();
    }
    for (const device of [first, second]) {
      expect(device.journal.current().entries.map((value) => value.entryId)).toEqual([
        'entry-a',
        'entry-b',
        'entry-c',
      ]);
    }
  });

  test('lost upload and head responses resume idempotently without double materialization', async () => {
    const app = harness('device-lost-response');
    app.journal.mutate(withEntry(blankDomain(), entry('entry-one', 'One logical edit')));
    app.provider.failNext(
      'upload-snapshot',
      new SnapshotProviderError('transient', 'lost upload response'),
      true,
    );
    expect((await app.engine().sync()).status).toBe('retry');
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(1);

    app.provider.failNext(
      'update-head',
      new SnapshotProviderError('transient', 'lost head response'),
      true,
    );
    expect((await app.engine().sync()).status).toBe('retry');
    expect(app.provider.physicalHeads(app.vaultId)).toHaveLength(1);

    expect((await app.engine().sync()).status).toBe('published');
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(1);
    expect(app.provider.physicalHeads(app.vaultId)).toHaveLength(1);
    expect(app.journal.applyCount).toBe(1);
  });

  test('a local edit after head advance survives generation-CAS settlement', async () => {
    const app = harness('device-cas');
    app.journal.mutate(withEntry(blankDomain(), entry('entry-base', 'Base')));
    await app.engine().sync();
    app.journal.mutate(
      withEntry(app.journal.current(), entry('entry-candidate', 'Candidate')),
    );
    let killed = false;
    await expect(
      app
        .engine({
          at(point) {
            if (!killed && point === 'after-head-advanced') {
              killed = true;
              app.journal.mutate(
                withEntry(app.journal.current(), entry('entry-late', 'Late edit')),
              );
              throw new SimulatedProcessDeath(point);
            }
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);

    const settledCandidate = await app.engine().sync();
    expect(settledCandidate).toMatchObject({ status: 'published', actionableChanges: 1 });
    expect(
      app.journal.current().entries.some((value) => value.entryId === 'entry-late'),
    ).toBe(true);
    const final = await app.engine().sync();
    expect(final).toMatchObject({ status: 'published', actionableChanges: 0 });
    expect(app.journal.current().entries.map((value) => value.entryId)).toEqual([
      'entry-base',
      'entry-candidate',
      'entry-late',
    ]);
  });

  test('a live CAS miss re-merges remote-derived content before base settlement', async () => {
    const provider = new FakeSnapshotProvider();
    const clock = { value: 1_800_000_000_000 };
    const source = harness('device-x1-source', blankDomain(), provider, clock);
    source.journal.mutate(
      withEntry(
        source.journal.current(),
        entry('entry-remote-x1', 'Remote branch survives'),
      ),
    );
    await source.engine().sync();

    const target = harness('device-x1-target', blankDomain(), provider, clock);
    const local = target.journal.current();
    local.profile.displayName = 'Local profile to publish';
    target.journal.mutate(local);
    let edited = false;
    const first = await target
      .engine({
        at(point) {
          if (!edited && point === 'after-head-advanced') {
            edited = true;
            target.journal.mutate(
              withEntry(
                target.journal.current(),
                entry('entry-late-x1', 'Late local edit'),
              ),
            );
          }
        },
      })
      .sync();
    expect(first).toMatchObject({ status: 'published', actionableChanges: 1 });
    expect(target.journal.current().entries.map((value) => value.entryId)).toEqual([
      'entry-late-x1',
      'entry-remote-x1',
    ]);

    expect(await target.engine().sync()).toMatchObject({
      status: 'published',
      actionableChanges: 0,
    });
    const targetHead = provider
      .physicalHeads(target.vaultId)
      .find((value) => value.head.deviceId === target.deviceId)!.head;
    const targetBytes = await provider.downloadSnapshot(
      target.vaultId,
      targetHead.snapshotId,
    );
    expect(targetBytes).not.toBeNull();
    const targetPayload = decodeSnapshot(targetBytes!, targetHead.snapshotId).payload;
    expect(targetPayload.entries.map((value) => value.entryId)).toEqual([
      'entry-late-x1',
      'entry-remote-x1',
    ]);
    expect(
      targetPayload.tombstones.some((value) => value.entityId === 'entry-remote-x1'),
    ).toBe(false);

    provider.removeDeviceHeadForTest(target.vaultId, source.deviceId);
    const restored = harness('device-x1-restored', blankDomain(), provider, clock);
    expect((await restored.engine().sync()).status).toBe('pulled');
    expect(restored.journal.current().entries.map((value) => value.entryId)).toEqual([
      'entry-late-x1',
      'entry-remote-x1',
    ]);
  });

  test('a head-advanced crash then local edit re-merges remote-derived content on resume', async () => {
    const provider = new FakeSnapshotProvider();
    const clock = { value: 1_800_000_000_000 };
    const source = harness('device-x1-crash-source', blankDomain(), provider, clock);
    source.journal.mutate(
      withEntry(
        source.journal.current(),
        entry('entry-remote-crash', 'Remote branch survives restart'),
      ),
    );
    await source.engine().sync();

    const target = harness('device-x1-crash-target', blankDomain(), provider, clock);
    const local = target.journal.current();
    local.profile.displayName = 'Local profile to publish';
    target.journal.mutate(local);
    let killed = false;
    await expect(
      target
        .engine({
          at(point) {
            if (!killed && point === 'after-head-advanced') {
              killed = true;
              throw new SimulatedProcessDeath(point);
            }
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    expect(target.state.loadPending(target.vaultId, target.deviceId)?.stage).toBe(
      'head-advanced',
    );
    target.journal.mutate(
      withEntry(
        target.journal.current(),
        entry('entry-late-crash', 'Late edit after process death'),
      ),
    );

    expect(await target.engine().sync()).toMatchObject({
      status: 'published',
      actionableChanges: 1,
    });
    expect(target.journal.current().entries.map((value) => value.entryId)).toEqual([
      'entry-late-crash',
      'entry-remote-crash',
    ]);
    expect(await target.engine().sync()).toMatchObject({
      status: 'published',
      actionableChanges: 0,
    });
    const targetHead = provider
      .physicalHeads(target.vaultId)
      .find((value) => value.head.deviceId === target.deviceId)!.head;
    const targetBytes = await provider.downloadSnapshot(
      target.vaultId,
      targetHead.snapshotId,
    );
    expect(targetBytes).not.toBeNull();
    const targetPayload = decodeSnapshot(targetBytes!, targetHead.snapshotId).payload;
    expect(targetPayload.entries.map((value) => value.entryId)).toEqual([
      'entry-late-crash',
      'entry-remote-crash',
    ]);
    expect(
      targetPayload.tombstones.some((value) => value.entityId === 'entry-remote-crash'),
    ).toBe(false);

    provider.removeDeviceHeadForTest(target.vaultId, source.deviceId);
    const restored = harness('device-x1-crash-restored', blankDomain(), provider, clock);
    expect((await restored.engine().sync()).status).toBe('pulled');
    expect(restored.journal.current().entries.map((value) => value.entryId)).toEqual([
      'entry-late-crash',
      'entry-remote-crash',
    ]);
  });

  test('a corrupted pending candidate pauses durably instead of escaping the engine', async () => {
    const app = harness('device-corrupt-pending');
    app.journal.mutate(
      withEntry(blankDomain(), entry('entry-pending', 'Pending candidate')),
    );
    await expect(
      app
        .engine({
          at(point) {
            if (point === 'after-candidate-persisted') {
              throw new SimulatedProcessDeath(point);
            }
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    app.database.runSync(
      `UPDATE cloud_pending_publication
       SET compressed_bytes = ?
       WHERE vault_id = ? AND device_id = ?`,
      new Uint8Array([1, 2, 3]),
      app.vaultId,
      app.deviceId,
    );

    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'normalized-model-not-ready',
    });
    expect(app.state.loadState(app.vaultId, app.deviceId)).toMatchObject({
      pauseReason: 'normalized-model-not-ready',
      lastErrorClass: 'local-candidate-validation-invalid-gzip',
    });
    expect(app.state.loadPending(app.vaultId, app.deviceId)?.stage).toBe(
      'candidate-persisted',
    );
  });

  test('repeated journal CAS misses stay bounded and retain the head-advanced intent', async () => {
    const app = harness('device-cas-contention');
    app.journal.mutate(
      withEntry(blankDomain(), entry('entry-contention', 'Queued intent')),
    );
    const apply = app.journal.applyMergedIfGeneration.bind(app.journal);
    app.journal.applyMergedIfGeneration = async () => false;

    expect(await app.engine().sync()).toMatchObject({
      status: 'retry',
      reason: 'transient',
      actionableChanges: 1,
    });
    expect(app.state.loadPending(app.vaultId, app.deviceId)?.stage).toBe('head-advanced');
    expect(app.state.loadBaseCheckpoint(app.vaultId, app.deviceId)).toBeNull();
    expect(app.state.loadState(app.vaultId, app.deviceId).lastErrorClass).toBe(
      'journal-changed-during-publication-reconciliation',
    );

    app.journal.applyMergedIfGeneration = apply;
    expect(await app.engine().sync()).toMatchObject({
      status: 'published',
      actionableChanges: 0,
    });
  });

  test('remote snapshot download death restarts without hiding the remote head', async () => {
    const provider = new FakeSnapshotProvider();
    const source = harness(
      'device-source',
      withEntry(blankDomain(), entry('entry-remote', 'Remote authored')),
      provider,
    );
    source.state.markDirty(source.vaultId, source.deviceId);
    await source.engine().sync();
    const target = harness('device-target', blankDomain(), provider, source.clock);
    let killed = false;
    await expect(
      target
        .engine({
          at(point) {
            if (!killed && point === 'during-remote-snapshot-download') {
              killed = true;
              throw new SimulatedProcessDeath(point);
            }
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    expect(
      provider
        .physicalHeads(target.vaultId)
        .some((value) => value.head.deviceId === 'device-source'),
    ).toBe(true);

    expect((await target.engine().sync()).status).toBe('pulled');
    expect(target.journal.current().entries.map((value) => value.content)).toEqual([
      'Remote authored',
    ]);
  });

  test('provider failures map to durable attention outcomes', async () => {
    const cases = [
      ['authorization-required', 'attention', 'authorization-required'],
      ['quota-full', 'attention', 'provider-quota-full'],
      ['permission-denied', 'attention', 'provider-permission-denied'],
      ['rate-limited', 'retry', 'rate-limited'],
      ['transient', 'retry', 'transient'],
      ['invalid-request', 'attention', 'provider-request-rejected'],
    ] as const;
    for (const [providerCode, status, reason] of cases) {
      const app = harness(`device-${providerCode}`);
      app.journal.mutate(
        withEntry(blankDomain(), entry('entry', `Synthetic ${providerCode}`)),
      );
      app.provider.failNext(
        'list-heads',
        new SnapshotProviderError(providerCode, providerCode),
      );
      const result = await app.engine().sync();
      expect(result).toMatchObject({ status, reason });
      const durable = app.state.loadState(app.vaultId, app.deviceId);
      expect(durable.pauseReason).toBe(status === 'attention' ? reason : null);
      expect(durable.lastErrorClass).toBe(`provider-${providerCode}`);
    }
  });

  test('remote invariant failures map to their durable Attention reasons', async () => {
    const cases: {
      suffix: string;
      reason: SyncAttentionReason;
      snapshotId: string;
      bytes: Uint8Array | null;
    }[] = [
      {
        suffix: 'missing',
        reason: 'head-snapshot-missing',
        snapshotId: 'a'.repeat(64),
        bytes: null,
      },
      {
        suffix: 'invalid',
        reason: 'invalid-remote-snapshot',
        snapshotId: 'b'.repeat(64),
        bytes: new Uint8Array([1, 2, 3]),
      },
      (() => {
        const encoded = encodeSnapshot({
          format: 'tackbok-snapshot',
          vaultId: 'different-vault',
          parentSnapshotIds: [],
          observedDeviceHeads: [],
          authorDeviceId: 'remote-wrong',
          deviceSequence: 1,
          createdAt: 1,
          ...blankDomain(),
        });
        return {
          suffix: 'wrong',
          reason: 'wrong-vault',
          snapshotId: encoded.snapshotId,
          bytes: encoded.compressedBytes,
        };
      })(),
      (() => {
        const payload = {
          format: 'tackbok-snapshot-future',
          vaultId: 'vault-sync-test',
          parentSnapshotIds: [],
          observedDeviceHeads: [],
          authorDeviceId: 'remote-unsupported',
          deviceSequence: 1,
          createdAt: 1,
          ...blankDomain(),
        };
        const canonicalBytes = encodeCanonicalBytes(payload);
        return {
          suffix: 'unsupported',
          reason: 'unsupported-format',
          snapshotId: sha256Bytes(canonicalBytes),
          bytes: encodeGzip(canonicalBytes, { level: 6 }),
        };
      })(),
    ];

    for (const value of cases) {
      const app = harness(`reader-${value.suffix}`);
      const remoteDeviceId = `remote-${value.suffix}`;
      if (value.bytes) {
        app.provider.injectSnapshot(app.vaultId, value.snapshotId, value.bytes, 1);
      }
      app.provider.injectPhysicalHead({
        format: 'tackbok-device-head',
        vaultId: app.vaultId,
        deviceId: remoteDeviceId,
        deviceSequence: 1,
        snapshotId: value.snapshotId,
        updatedAt: 1,
      });
      expect(await app.engine().sync()).toMatchObject({
        status: 'attention',
        reason: value.reason,
      });
      expect(app.state.loadState(app.vaultId, app.deviceId).pauseReason).toBe(
        value.reason,
      );
    }
  });

  test('every durable Attention-needed reason has a recovery action', () => {
    expect(Object.keys(ATTENTION_RECOVERY_ACTION).sort()).toEqual([
      'account-mismatch',
      'ambiguous-device-head',
      'authorization-required',
      'backup-deleted',
      'cleanup-inconsistent',
      'consent-incomplete',
      'derived-id-collision',
      'frontier-too-wide',
      'head-snapshot-missing',
      'invalid-remote-snapshot',
      'journal-deleted',
      'local-media-unreadable',
      'local-storage-full',
      'missing-media',
      'normalized-model-not-ready',
      'provider-permission-denied',
      'provider-quota-full',
      'provider-request-rejected',
      'purge-incomplete',
      'unsupported-format',
      'wrong-vault',
    ]);
    expect(ATTENTION_RECOVERY_ACTION['ambiguous-device-head']).toBe(
      'inspect-repair-backup',
    );
  });

  test.each([false, true])(
    'simultaneous publications converge, including date edits: %s',
    async (editDates) => {
      const provider = new FakeSnapshotProvider();
      const clock = { value: 1_800_000_000_000 };
      const initial = withEntry(blankDomain(), entry('entry-shared', 'Base'));
      const first = harness('device-a', initial, provider, clock);
      first.journal.mutate(initial);
      await first.engine().sync();
      const second = harness('device-b', initial, provider, clock);
      await second.engine().sync();

      first.journal.mutate(
        withEntry(first.journal.current(), {
          ...entry('entry-shared', 'Device A', 2),
          createdAt: editDates ? 86400001 : 1,
        }),
      );
      second.journal.mutate(
        withEntry(second.journal.current(), {
          ...entry('entry-shared', 'Device B', 2),
          createdAt: editDates ? 172800001 : 1,
        }),
      );
      let waiting = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const hooks: SnapshotSyncHooks = {
        async beforeHeadRecheck() {
          waiting += 1;
          if (waiting === 2) release();
          await barrier;
        },
      };
      await Promise.all([first.engine(hooks).sync(), second.engine(hooks).sync()]);
      expect(
        new Set(
          provider.physicalHeads(first.vaultId).map((value) => value.head.deviceId),
        ),
      ).toEqual(new Set(['device-a', 'device-b']));

      await first.engine().sync();
      await second.engine().sync();
      expect(canonicalize(first.journal.current())).toBe(
        canonicalize(second.journal.current()),
      );
      expect(
        new Set(first.journal.current().entries.map((value) => value.content)),
      ).toEqual(new Set(['Device A', 'Device B']));
      provider.requests.length = 0;
      for (let i = 0; i < 4; i++) {
        await first.engine().sync();
        await second.engine().sync();
      }
      expect(provider.requests).not.toContain('upload-snapshot');
      expect(provider.requests).not.toContain('update-head');
      if (editDates) {
        expect(
          new Set(first.journal.current().entries.map((value) => value.createdAt)),
        ).toEqual(new Set([86400001, 172800001]));
      }
    },
  );

  test('three simultaneous disjoint writers converge without dropping a branch', async () => {
    const provider = new FakeSnapshotProvider();
    const clock = { value: 1_800_000_000_000 };
    const devices = [
      harness('device-a', blankDomain(), provider, clock),
      harness('device-b', blankDomain(), provider, clock),
      harness('device-c', blankDomain(), provider, clock),
    ];
    await devices[0].engine().sync();
    await devices[1].engine().sync();
    await devices[2].engine().sync();
    devices.forEach((device, index) => {
      device.journal.mutate(
        withEntry(device.journal.current(), entry(`entry-${index}`, `Device ${index}`)),
      );
    });
    let waiting = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hooks: SnapshotSyncHooks = {
      async beforeHeadRecheck() {
        waiting += 1;
        if (waiting === devices.length) release();
        await barrier;
      },
    };
    await Promise.all(devices.map((device) => device.engine(hooks).sync()));
    expect(
      new Set(
        provider.physicalHeads(devices[0].vaultId).map((value) => value.head.deviceId),
      ),
    ).toEqual(new Set(['device-a', 'device-b', 'device-c']));

    for (let round = 0; round < 3; round += 1) {
      for (const device of devices) await device.engine().sync();
    }
    const canonical = devices.map((device) => canonicalize(device.journal.current()));
    expect(new Set(canonical).size).toBe(1);
    expect(
      new Set(devices[0].journal.current().entries.map((value) => value.content)),
    ).toEqual(new Set(['Device 0', 'Device 1', 'Device 2']));
  });

  test('equal-sequence different valid heads pause durably as ambiguous', async () => {
    const app = harness('device-reader');
    for (const [suffix, content] of [
      ['a', 'Branch A'],
      ['b', 'Branch B'],
    ] as const) {
      const encoded = encodeSnapshot({
        format: 'tackbok-snapshot',
        vaultId: app.vaultId,
        parentSnapshotIds: [],
        observedDeviceHeads: [],
        authorDeviceId: 'device-ambiguous',
        deviceSequence: 7,
        createdAt: 7,
        ...withEntry(blankDomain(), entry(`entry-${suffix}`, content)),
      });
      app.provider.injectSnapshot(
        app.vaultId,
        encoded.snapshotId,
        encoded.compressedBytes,
        7,
      );
      app.provider.injectPhysicalHead({
        format: 'tackbok-device-head',
        vaultId: app.vaultId,
        deviceId: 'device-ambiguous',
        deviceSequence: 7,
        snapshotId: encoded.snapshotId,
        updatedAt: 7,
      });
    }
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
    expect(app.state.loadState(app.vaultId, app.deviceId).pauseReason).toBe(
      'ambiguous-device-head',
    );
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'ambiguous-device-head',
    });
  });

  test('nine independent frontier heads pause instead of truncating parents', async () => {
    const app = harness('device-wide-frontier');
    for (let index = 0; index < 9; index += 1) {
      const deviceId = `frontier-device-${index}`;
      const encoded = encodeSnapshot({
        format: 'tackbok-snapshot',
        vaultId: app.vaultId,
        parentSnapshotIds: [],
        observedDeviceHeads: [],
        authorDeviceId: deviceId,
        deviceSequence: 1,
        createdAt: 1,
        ...withEntry(blankDomain(), entry(`entry-${index}`, `Branch ${index}`)),
      });
      app.provider.injectSnapshot(
        app.vaultId,
        encoded.snapshotId,
        encoded.compressedBytes,
        1,
      );
      app.provider.injectPhysicalHead({
        format: 'tackbok-device-head',
        vaultId: app.vaultId,
        deviceId,
        deviceSequence: 1,
        snapshotId: encoded.snapshotId,
        updatedAt: 1,
      });
    }
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'frontier-too-wide',
    });
  });

  test('base-shadow write failure pauses with a visible recovery and resumes safely', async () => {
    const app = harness('device-storage');
    app.journal.mutate(withEntry(blankDomain(), entry('entry', 'Durable candidate')));
    const originalWrite = app.files.writeTempAndFsync.bind(app.files);
    app.files.writeTempAndFsync = async () => {
      throw new Error('simulated storage full');
    };
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'local-storage-full',
    });
    expect(app.state.loadPending(app.vaultId, app.deviceId)?.stage).toBe(
      'domain-applied',
    );
    expect(app.provider.physicalHeads(app.vaultId)).toHaveLength(1);

    app.files.writeTempAndFsync = originalWrite;
    app.state.clearPause(app.vaultId, app.deviceId, 'local-storage-full');
    expect(await app.engine().sync()).toMatchObject({
      status: 'published',
      actionableChanges: 0,
    });
    expect(app.state.loadPending(app.vaultId, app.deviceId)).toBeNull();
  });

  test('required missing media pauses without publishing a dangling snapshot', async () => {
    const domain = withEntry(
      blankDomain(),
      entry('entry-media-missing', 'Missing attachment'),
    );
    domain.media = [
      {
        assetId: 'asset-missing',
        ownerType: 'entry',
        ownerId: 'entry-media-missing',
        kind: 'photo',
        blobHash: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        byteSize: 10,
        width: null,
        height: null,
        durationMs: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const app = harness('device-missing-local', domain);
    app.state.markDirty(app.vaultId, app.deviceId);
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'local-media-unreadable',
    });
    expect(app.provider.snapshotIds(app.vaultId)).toEqual([]);
  });

  test('remote text restores without publishing when Wi-Fi-only policy defers its verified blob', async () => {
    const provider = new FakeSnapshotProvider();
    const bytes = new TextEncoder().encode('synthetic-remote-photo');
    const blobHash = sha256Bytes(bytes);
    const sourceDomain = withEntry(
      blankDomain(),
      entry('entry-remote-media', 'Restored text'),
    );
    sourceDomain.media = [
      {
        assetId: 'asset-remote-media',
        ownerType: 'entry',
        ownerId: 'entry-remote-media',
        kind: 'photo',
        blobHash,
        mimeType: 'image/jpeg',
        byteSize: bytes.byteLength,
        width: null,
        height: null,
        durationMs: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const source = harness('device-media-source', sourceDomain, provider);
    await source.media.writeVerified(blobHash, bytes);
    source.state.markDirty(source.vaultId, source.deviceId);
    expect(await source.engine().sync()).toMatchObject({ status: 'published' });

    const restoring = harness(
      'device-media-restore',
      blankDomain(),
      provider,
      source.clock,
      source.vaultId,
    );
    provider.failNext(
      'download-media',
      new SnapshotProviderError('wifi-only-media', 'waiting-for-wifi'),
    );
    expect(await restoring.engine().sync()).toMatchObject({
      status: 'pulled',
      actionableChanges: 0,
    });
    expect(restoring.journal.current().entries).toContainEqual(
      expect.objectContaining({
        entryId: 'entry-remote-media',
        content: 'Restored text',
      }),
    );
    expect(await restoring.media.hasVerified(blobHash)).toBe(false);
    expect(restoring.provider.requests).toContain('download-media');
  });

  test('an actually absent remote blob still restores text before durable Attention', async () => {
    const app = harness('device-remote-missing');
    const domain = withEntry(
      blankDomain(),
      entry('entry-remote-missing', 'Readable text'),
    );
    domain.media = [
      {
        assetId: 'asset-remote-missing',
        ownerType: 'entry',
        ownerId: 'entry-remote-missing',
        kind: 'photo',
        blobHash: 'b'.repeat(64),
        mimeType: 'image/jpeg',
        byteSize: 10,
        width: null,
        height: null,
        durationMs: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const encoded = encodeSnapshot({
      format: 'tackbok-snapshot',
      vaultId: app.vaultId,
      parentSnapshotIds: [],
      observedDeviceHeads: [],
      authorDeviceId: 'remote-missing',
      deviceSequence: 1,
      createdAt: 1,
      ...domain,
    });
    app.provider.injectSnapshot(
      app.vaultId,
      encoded.snapshotId,
      encoded.compressedBytes,
      1,
    );
    app.provider.injectPhysicalHead({
      format: 'tackbok-device-head',
      vaultId: app.vaultId,
      deviceId: 'remote-missing',
      deviceSequence: 1,
      snapshotId: encoded.snapshotId,
      updatedAt: 1,
    });

    expect(await app.engine().sync()).toMatchObject({
      status: 'attention',
      reason: 'missing-media',
    });
    expect(app.journal.current().entries).toContainEqual(
      expect.objectContaining({
        entryId: 'entry-remote-missing',
        content: 'Readable text',
      }),
    );
    expect(app.provider.snapshotIds(app.vaultId)).toEqual([encoded.snapshotId]);
  });

  test('revocation markers dominate dirty publication intent', async () => {
    for (const [marker, reason] of [
      ['backup-deleted', 'backup-deleted'],
      ['journal-deleted', 'journal-deleted'],
    ] as const) {
      const app = harness(`device-${marker}`);
      app.journal.mutate(withEntry(blankDomain(), entry('entry', 'Must not republish')));
      app.provider.setRevocations(app.vaultId, [marker]);
      expect(await app.engine().sync()).toMatchObject({ status: 'attention', reason });
      expect(app.provider.snapshotIds(app.vaultId)).toEqual([]);
    }
  });

  test('an unreadable base is quarantined and falls back to conservative two-way merge', async () => {
    const provider = new FakeSnapshotProvider();
    const clock = { value: 1_800_000_000_000 };
    const initial = withEntry(blankDomain(), entry('entry-shared', 'Base'));
    const first = harness('device-a', initial, provider, clock);
    first.journal.mutate(initial);
    await first.engine().sync();
    const second = harness('device-b', initial, provider, clock);
    await second.engine().sync();

    first.journal.mutate(
      withEntry(first.journal.current(), entry('entry-shared', 'Local authored', 2)),
    );
    second.journal.mutate(
      withEntry(second.journal.current(), entry('entry-shared', 'Remote authored', 2)),
    );
    await second.engine().sync();
    const checkpoint = first.state.loadBaseCheckpoint(first.vaultId, first.deviceId)!;
    first.files.files.set(checkpoint.fileName, new Uint8Array([1, 2, 3]));

    const result = await first.engine().sync();
    expect(result.status).toBe('published');
    expect(first.files.quarantined).toHaveLength(1);
    expect(
      new Set(first.journal.current().entries.map((value) => value.content)),
    ).toEqual(new Set(['Local authored', 'Remote authored']));
  });

  test('an unsupported base-shadow format degrades instead of blocking sync', async () => {
    const app = harness('device-future-shadow');
    const encoded = encodeSnapshot({
      format: 'tackbok-snapshot',
      vaultId: app.vaultId,
      parentSnapshotIds: [],
      observedDeviceHeads: [],
      authorDeviceId: app.deviceId,
      deviceSequence: 1,
      createdAt: 1,
      ...blankDomain(),
    });
    const futureShadow = {
      format: 'tackbok-base-shadow-future',
      vaultId: app.vaultId,
      snapshotId: encoded.snapshotId,
      acceptedDeviceHeads: [],
      payload: encoded.payload,
    };
    const canonicalBytes = encodeCanonicalBytes(futureShadow);
    const compressedBytes = encodeGzip(canonicalBytes, { level: 6 });
    const fileName = 'base-future.json.gz';
    app.files.files.set(fileName, compressedBytes);

    const loaded = await app.shadows.load({
      vaultId: app.vaultId,
      deviceId: app.deviceId,
      snapshotId: encoded.snapshotId,
      fileName,
      canonicalSha256: sha256Bytes(canonicalBytes),
      byteCount: compressedBytes.length,
      committedGeneration: 0,
    });
    expect(loaded).toEqual({ shadow: null, degraded: true });
    expect(app.files.quarantined).toHaveLength(1);
  });

  test('cleanup retains three verified snapshots and resumes after a process death', async () => {
    const app = harness('device-retention');
    for (let index = 0; index < 5; index += 1) {
      app.clock.value += 1;
      app.journal.mutate(
        withEntry(app.journal.current(), entry(`entry-${index}`, `Value ${index}`)),
      );
      await app.engine().sync();
    }
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(5);
    app.clock.value += 31 * 24 * 60 * 60 * 1000;
    app.journal.mutate(withEntry(app.journal.current(), entry('entry-new', 'Newest')));
    let killed = false;
    await expect(
      app
        .engine({
          at(point) {
            if (!killed && point === 'during-snapshot-cleanup') {
              killed = true;
              throw new SimulatedProcessDeath(point);
            }
          },
        })
        .sync(),
    ).rejects.toBeInstanceOf(SimulatedProcessDeath);
    const currentHead = app.provider.physicalHeads(app.vaultId)[0].head.snapshotId;
    expect(app.provider.snapshotIds(app.vaultId)).toContain(currentHead);

    expect((await app.engine().sync()).status).toBe('up-to-date');
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(3);
    expect(app.provider.snapshotIds(app.vaultId)).toContain(currentHead);
    expect(app.provider.requests).not.toContain('delete-media' as never);
  });
});

function withoutEntry(
  domain: SnapshotDomain,
  entryId: string,
  deletedByDeviceId: string,
): SnapshotDomain {
  const next = structuredClone(domain);
  next.entries = next.entries.filter((item) => item.entryId !== entryId);
  next.tombstones = [
    ...next.tombstones,
    {
      entityType: 'entry' as const,
      entityId: entryId,
      baseStateHash: null,
      deletedStateHash: null,
      deletedByDeviceId,
      deletionSequence: next.tombstones.length + 1,
    },
  ].sort((left, right) => left.entityId.localeCompare(right.entityId));
  return next;
}

/**
 * Runs one pass per device so that every publisher uploads before any of them
 * advances its head. Each branch is planned against the same heads, so the
 * resulting heads are truly concurrent.
 */
async function syncConcurrently(devices: Harness[]) {
  let remaining = devices.length;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  return Promise.all(
    devices.map((device) => {
      let arrived = false;
      const arrive = () => {
        if (arrived) return;
        arrived = true;
        remaining -= 1;
        if (remaining === 0) release();
      };
      return device
        .engine({
          async at(point) {
            if (point !== 'after-snapshot-uploaded' || arrived) return;
            arrive();
            await barrier;
          },
        })
        .sync()
        .finally(arrive);
    }),
  );
}

async function settle(devices: Harness[]): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    for (const device of devices) {
      expect((await device.engine().sync()).status).not.toBe('attention');
    }
  }
}

function contents(domain: SnapshotDomain): Record<string, string | null> {
  return Object.fromEntries(
    domain.entries.map((value) => [value.entryId, value.content]),
  );
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe('merging concurrent branches against their common ancestor', () => {
  async function converged(count = 2, initial = blankDomain()) {
    const provider = new FakeSnapshotProvider();
    const clock = { value: 1_800_000_000_000 };
    const devices = Array.from({ length: count }, (_, index) =>
      harness(`device-${String.fromCharCode(97 + index)}`, initial, provider, clock),
    );
    devices[0].journal.mutate(initial);
    await devices[0].engine().sync();
    await settle(devices);
    return { provider, clock, devices };
  }

  function edit(device: Harness, entryId: string, content: string): void {
    device.clock.value += 1000;
    const current = device.journal.current();
    const existing = current.entries.find((value) => value.entryId === entryId);
    device.journal.mutate(
      withEntry(current, {
        ...(existing ?? entry(entryId, content)),
        content,
        updatedAt: device.clock.value,
      }),
    );
  }

  test('disjoint concurrent entry edits both survive without conflicts', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'one'));
    initial = withEntry(initial, entry('e2', 'two'));
    const { devices } = await converged(2, initial);
    const [a, b] = devices;
    edit(a, 'e1', 'one edited by A');
    edit(b, 'e2', 'two edited by B');
    const results = await syncConcurrently([a, b]);
    expect(results.map((value) => value.status)).toEqual(['published', 'published']);
    expect(
      new Set(a.provider.physicalHeads(a.vaultId).map((value) => value.head.snapshotId))
        .size,
    ).toBe(2);
    await settle(devices);

    for (const device of devices) {
      const domain = device.journal.current();
      expect(domain.conflicts).toEqual([]);
      expect(contents(domain)).toEqual({
        e1: 'one edited by A',
        e2: 'two edited by B',
      });
    }
  });

  test('a deletion concurrent with an unrelated edit stays deleted', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'secret'));
    initial = withEntry(initial, entry('e2', 'x'));
    const { devices } = await converged(2, initial);
    const [a, b] = devices;
    a.journal.mutate(withoutEntry(a.journal.current(), 'e1', a.deviceId));
    edit(b, 'e2', 'x2');
    await syncConcurrently([a, b]);
    await settle(devices);

    for (const device of devices) {
      const domain = device.journal.current();
      expect(domain.conflicts).toEqual([]);
      expect(contents(domain)).toEqual({ e2: 'x2' });
      expect(domain.tombstones.map((value) => value.entityId)).toEqual(['e1']);
    }
  });

  test('a rename concurrent with entry edits survives every round', async () => {
    const { devices } = await converged(2, {
      ...blankDomain(),
      profile: { ...blankDomain().profile, displayName: 'Mehra', updatedAt: 2 },
    });
    const [a, b] = devices;
    for (let round = 0; round < 4; round += 1) {
      const renamed = a.journal.current();
      renamed.profile = {
        ...renamed.profile,
        displayName: `A${round}`,
        updatedAt: a.clock.value,
      };
      a.journal.mutate(renamed);
      edit(b, 'e', `b-${round}`);
      await syncConcurrently([a, b]);
      await settle(devices);
      for (const device of devices) {
        const domain = device.journal.current();
        expect(domain.profile.displayName).toBe(`A${round}`);
        expect(domain.conflicts).toEqual([]);
        expect(contents(domain)).toEqual({ e: `b-${round}` });
      }
    }
  });

  test('genuinely conflicting concurrent edits still produce a conflict', async () => {
    const { devices } = await converged(2, withEntry(blankDomain(), entry('e1', 'base')));
    const [a, b] = devices;
    edit(a, 'e1', 'from A');
    edit(b, 'e1', 'from B');
    await syncConcurrently([a, b]);
    await settle(devices);

    const domain = a.journal.current();
    expect(canonicalize(b.journal.current())).toBe(canonicalize(domain));
    expect(domain.conflicts.length).toBeGreaterThan(0);
    expect(new Set(domain.entries.map((value) => value.content))).toEqual(
      new Set(['from A', 'from B']),
    );
  });

  test('a later merge of crossing branches finds the newer shared ancestor', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'one'));
    initial = withEntry(initial, entry('e2', 'two'));
    const { devices } = await converged(2, initial);
    const [a, b] = devices;
    edit(a, 'e1', 'A1');
    edit(b, 'e2', 'B1');
    await syncConcurrently([a, b]);
    // Both merge the other branch at once, producing crossing merge snapshots.
    edit(a, 'e1', 'A2');
    edit(b, 'e2', 'B2');
    await syncConcurrently([a, b]);
    await settle(devices);
    for (const device of devices) {
      const domain = device.journal.current();
      expect(domain.conflicts).toEqual([]);
      expect(contents(domain)).toEqual({ e1: 'A2', e2: 'B2' });
    }
  });

  test('a cleaned-up common ancestor falls back to a no-base merge without failing', async () => {
    const { devices, provider } = await converged(
      2,
      withEntry(blankDomain(), entry('e1', 'one')),
    );
    const [a, b] = devices;
    const ancestor = provider.physicalHeads(a.vaultId)[0].head.snapshotId;
    edit(a, 'e1', 'one edited by A');
    edit(b, 'e2', 'new from B');
    await syncConcurrently([a, b]);
    await provider.deleteSnapshot(a.vaultId, ancestor);

    provider.requests.length = 0;
    const result = await a.engine().sync();
    expect(result.status).toBe('published');
    // Two heads plus the one missing ancestor; no unbounded history walk.
    expect(
      provider.requests.filter((value) => value === 'download-snapshot').length,
    ).toBeLessThanOrEqual(3);
    await settle(devices);
    const domain = a.journal.current();
    expect(canonicalize(b.journal.current())).toBe(canonicalize(domain));
    // Without a provable base, A's edit is preserved, if only as a conflict.
    expect(domain.entries.map((value) => value.content)).toContain('one edited by A');
    expect(domain.entries.map((value) => value.content)).toContain('new from B');
  });

  test.each([
    [1, 2],
    [2, 2],
    [3, 3],
    [4, 3],
    [5, 4],
  ])(
    'seed %i with %i devices: disjoint concurrent edits never conflict',
    async (seed, count) => {
      const random = seededRandom(seed);
      let initial = blankDomain();
      for (let index = 0; index < 6; index += 1) {
        initial = withEntry(initial, entry(`shared-${index}`, `shared ${index}`));
      }
      const { devices } = await converged(count, initial);
      // Each device owns a disjoint set of entry IDs, including existing ones.
      const expected = contents(initial);
      const deleted = new Set<string>();
      const owned = (index: number) => [
        ...Array.from({ length: 6 }, (_, id) => `shared-${id}`).filter(
          (_, id) => id % count === index,
        ),
        ...Array.from({ length: 3 }, (_, id) => `${devices[index].deviceId}-${id}`),
      ];
      let expectedName: string | null = null;

      for (let round = 0; round < 12; round += 1) {
        const writers: Harness[] = [];
        devices.forEach((device, index) => {
          if (random() < 0.3) return;
          const candidates = owned(index).filter((id) => !deleted.has(id));
          if (candidates.length === 0) return;
          const entryId = candidates[Math.floor(random() * candidates.length)];
          if (expected[entryId] !== undefined && random() < 0.2) {
            device.journal.mutate(
              withoutEntry(device.journal.current(), entryId, device.deviceId),
            );
            delete expected[entryId];
            deleted.add(entryId);
          } else {
            const content = `${entryId} @${round}`;
            edit(device, entryId, content);
            expected[entryId] = content;
          }
          if (index === 0 && random() < 0.3) {
            expectedName = `Name ${round}`;
            const renamed = device.journal.current();
            renamed.profile = {
              ...renamed.profile,
              displayName: expectedName,
              updatedAt: device.clock.value,
            };
            device.journal.mutate(renamed);
          }
          writers.push(device);
        });
        const readers = devices.filter(
          (device) => !writers.includes(device) && random() < 0.5,
        );
        const results = await syncConcurrently([...writers, ...readers]);
        for (const result of results) expect(result.status).not.toBe('attention');
      }
      await settle(devices);

      const final = devices[0].journal.current();
      for (const device of devices.slice(1)) {
        expect(canonicalize(device.journal.current())).toBe(canonicalize(final));
      }
      expect(final.conflicts).toEqual([]);
      expect(final.entries.filter((value) => value.conflictOriginId)).toEqual([]);
      expect(contents(final)).toEqual(expected);
      expect(final.profile.displayName).toBe(expectedName);
    },
  );

  test('a fresh restore of concurrent heads merges against their retained ancestor', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'one'));
    initial = withEntry(initial, entry('e2', 'two'));
    const { devices, provider, clock } = await converged(2, initial);
    const [a, b] = devices;
    a.journal.mutate(withoutEntry(a.journal.current(), 'e1', a.deviceId));
    edit(b, 'e2', 'B2');
    await syncConcurrently([a, b]);

    const fresh = harness('device-fresh', blankDomain(), provider, clock);
    const downloadPoints: SnapshotKillPoint[] = [];
    const result = await fresh
      .engine({
        at(point) {
          if (point === 'during-remote-snapshot-download') downloadPoints.push(point);
        },
      })
      .sync();
    expect(result.status).not.toBe('attention');
    // Two heads and their shared ancestor each pass the download kill point.
    expect(downloadPoints).toHaveLength(3);
    const domain = fresh.journal.current();
    expect(domain.conflicts).toEqual([]);
    expect(contents(domain)).toEqual({ e2: 'B2' });
  });

  test('ancestor downloads during a fresh restore read as checking', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'one'));
    initial = withEntry(initial, entry('e2', 'two'));
    const { devices, provider, clock } = await converged(2, initial);
    const [a, b] = devices;
    a.journal.mutate(withoutEntry(a.journal.current(), 'e1', a.deviceId));
    edit(b, 'e2', 'B2');
    await syncConcurrently([a, b]);

    const fresh = harness('device-fresh-phases', blankDomain(), provider, clock);
    const tracker = trackPhases(provider);
    // Leave a stale phase after every download so each one must set its own.
    await fresh
      .engine(
        tracker.hooks({
          at(point) {
            if (point === 'during-remote-snapshot-download') tracker.phase = 'uploading';
          },
        }),
      )
      .sync();
    const downloads = tracker.seen.filter((value) =>
      value.startsWith('downloadSnapshot='),
    );
    // Two heads plus their shared ancestor.
    expect(downloads).toEqual([
      'downloadSnapshot=checking',
      'downloadSnapshot=checking',
      'downloadSnapshot=checking',
    ]);
  });

  test.each<[SnapshotKillPoint, string[]]>([
    [
      'after-candidate-persisted',
      ['uploadSnapshot', 'verifySnapshot', 'updateDeviceHead', 'apply-domain'],
    ],
    ['after-snapshot-uploaded', ['verifySnapshot', 'updateDeviceHead', 'apply-domain']],
    ['after-snapshot-verified', ['updateDeviceHead', 'apply-domain']],
    ['after-head-advanced', ['apply-domain']],
  ])(
    'a publication resumed from %s reads as saving throughout',
    async (killPoint, work) => {
      const app = harness(`device-resume-${killPoint}`);
      app.journal.mutate(withEntry(blankDomain(), entry('entry-local', 'Local content')));
      await expect(
        app
          .engine({
            at(point) {
              if (point === killPoint) throw new SimulatedProcessDeath(point);
            },
          })
          .sync(),
      ).rejects.toBeInstanceOf(SimulatedProcessDeath);

      const tracker = trackPhases(app.provider);
      expect((await app.engine(tracker.hooks()).sync()).status).toBe('published');
      expect(tracker.seen).toEqual(work.map((operation) => `${operation}=uploading`));
    },
  );

  test.each([
    ['invalid-data', 'published', null],
    ['transient', 'retry', null],
    ['rate-limited', 'retry', null],
    ['authorization-required', 'attention', 'authorization-required'],
  ] as const)(
    'an ancestor download failing with %s gives %s',
    async (code, status, pauseReason) => {
      const { devices, provider } = await converged(
        2,
        withEntry(blankDomain(), entry('e1', 'one')),
      );
      const [a, b] = devices;
      const ancestor = provider.physicalHeads(a.vaultId)[0].head.snapshotId;
      edit(a, 'e1', 'A1');
      edit(b, 'e2', 'B2');
      await syncConcurrently([a, b]);
      const download = provider.downloadSnapshot.bind(provider);
      provider.downloadSnapshot = async (vaultId, snapshotId) => {
        if (snapshotId === ancestor) throw new SnapshotProviderError(code, 'injected');
        return download(vaultId, snapshotId);
      };

      // Damaged optional history falls back to a no-base merge; it must not
      // durably pause a sync whose heads are all valid.
      expect((await a.engine().sync()).status).toBe(status);
      expect(a.state.loadState(a.vaultId, a.deviceId).pauseReason ?? null).toBe(
        pauseReason,
      );
    },
  );

  test('re-planning a stale candidate reuses verified ancestors from the same pass', async () => {
    const { devices, provider } = await converged(
      2,
      withEntry(blankDomain(), entry('e1', 'one')),
    );
    const [a, b] = devices;
    const ancestor = provider.physicalHeads(a.vaultId)[0].head.snapshotId;
    edit(a, 'e1', 'A');
    edit(b, 'e2', 'B');
    await syncConcurrently([a, b]);
    const download = provider.downloadSnapshot.bind(provider);
    let ancestorDownloads = 0;
    provider.downloadSnapshot = async (vaultId, snapshotId) => {
      if (snapshotId === ancestor) ancestorDownloads += 1;
      return download(vaultId, snapshotId);
    };

    let advanced = 0;
    const result = await a
      .engine({
        async at(point) {
          if (point !== 'after-candidate-persisted') return;
          // B publishes again, so A's candidate is stale before upload.
          const { head } = provider
            .physicalHeads(a.vaultId)
            .find((value) => value.head.deviceId === b.deviceId)!;
          const previous = decodeSnapshot(
            (await download(a.vaultId, head.snapshotId))!,
            head.snapshotId,
          ).payload;
          advanced += 1;
          const encoded = encodeSnapshot({
            ...previous,
            ...withEntry(previous, entry('e2', `B${advanced}`)),
            deviceSequence: head.deviceSequence + 1,
            parentSnapshotIds: [head.snapshotId],
          });
          await provider.uploadSnapshot(
            a.vaultId,
            encoded.snapshotId,
            encoded.compressedBytes,
            previous.createdAt,
          );
          await provider.updateDeviceHead(a.vaultId, {
            ...head,
            deviceSequence: head.deviceSequence + 1,
            snapshotId: encoded.snapshotId,
          });
        },
      })
      .sync();
    expect(result).toMatchObject({ status: 'retry', reason: 'transient' });
    expect(advanced).toBe(4);
    expect(ancestorDownloads).toBe(1);
  });

  test('ancestor transfers stop at the per-pass byte limit and fall back safely', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'one'));
    initial = withEntry(initial, entry('e2', 'two'));
    const { devices, provider, clock } = await converged(2, initial);
    const [a, b] = devices;
    edit(a, 'e1', 'A1');
    edit(b, 'e2', 'B1');
    await syncConcurrently([a, b]);
    edit(a, 'e1', 'A2');
    edit(b, 'e2', 'B2');
    await syncConcurrently([a, b]);
    const heads = new Set(
      provider.physicalHeads(a.vaultId).map((value) => value.head.snapshotId),
    );
    const download = provider.downloadSnapshot.bind(provider);
    const ancestorDownloads: string[] = [];
    provider.downloadSnapshot = async (vaultId, snapshotId) => {
      if (heads.has(snapshotId)) return download(vaultId, snapshotId);
      ancestorDownloads.push(snapshotId);
      // A transfer this large leaves less than one maximum-size snapshot.
      return new Uint8Array(17 * 1024 * 1024);
    };

    const fresh = harness('device-fresh', blankDomain(), provider, clock);
    expect((await fresh.engine().sync()).status).not.toBe('attention');
    expect(ancestorDownloads).toHaveLength(1);
    const domain = fresh.journal.current();
    expect(domain.entries.map((value) => value.content)).toEqual(
      expect.arrayContaining(['A2', 'B2']),
    );
  });

  test('damaged ancestor transfers count against the per-pass byte limit', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'one'));
    initial = withEntry(initial, entry('e2', 'two'));
    const { devices, provider, clock } = await converged(4, initial);
    for (let round = 0; round < 2; round += 1) {
      devices.forEach((device, index) => edit(device, `d${index}`, `r${round}`));
      await syncConcurrently(devices);
    }
    const heads = new Set(
      provider.physicalHeads(devices[0].vaultId).map((value) => value.head.snapshotId),
    );
    const download = provider.downloadSnapshot.bind(provider);
    const ancestorDownloads: string[] = [];
    provider.downloadSnapshot = async (vaultId, snapshotId) => {
      if (heads.has(snapshotId)) return download(vaultId, snapshotId);
      ancestorDownloads.push(snapshotId);
      // Fully transferred, then rejected by the checksum: the bytes still cost.
      throw new SnapshotProviderError('invalid-data', 'checksum mismatch');
    };

    const fresh = harness('device-fresh', blankDomain(), provider, clock);
    expect((await fresh.engine().sync()).status).not.toBe('attention');
    // The 32 MiB budget covers at most two maximum-size transfers.
    expect(ancestorDownloads.length).toBeLessThanOrEqual(2);
  });

  test('crossing merges of conflicting edits converge', async () => {
    let initial = withEntry(blankDomain(), entry('e1', 'base'));
    initial = withEntry(initial, entry('e2', 'two'));
    const { devices } = await converged(2, initial);
    const [a, b] = devices;
    edit(a, 'e1', 'from A');
    edit(b, 'e1', 'from B');
    await syncConcurrently([a, b]);
    // Each merges the conflict in its own local/remote order, at once.
    edit(a, 'e2', 'A2');
    edit(b, 'e3', 'B3');
    await syncConcurrently([a, b]);
    await settle(devices);

    const domain = a.journal.current();
    expect(canonicalize(b.journal.current())).toBe(canonicalize(domain));
    expect(domain.conflicts.length).toBeGreaterThan(0);
    expect(domain.entries.map((value) => value.content)).toEqual(
      expect.arrayContaining(['from A', 'from B', 'A2', 'B3']),
    );
  });

  /**
   * Each round's writers edit one entry and publish at once. Devices that sit
   * out a round fall behind, so later merges meet one conflict found from
   * different bases.
   */
  async function delayedConflicts(
    count: number,
    rounds: { writers: number[]; order: number[] }[],
  ): Promise<void> {
    const { devices } = await converged(
      count,
      withEntry(blankDomain(), entry('e', 'base')),
    );
    for (const [round, { writers, order }] of rounds.entries()) {
      for (const index of writers) edit(devices[index], 'e', `r${round}-${index}`);
      const results = await syncConcurrently(order.map((index) => devices[index]));
      expect(results.map((value) => value.status)).not.toContain('attention');
    }
    await settle(devices);
    await settle(devices);
    const last = rounds.length - 1;
    const domain = devices[0].journal.current();
    expect(domain.entries.map((value) => value.content)).toEqual(
      expect.arrayContaining(rounds[last].writers.map((index) => `r${last}-${index}`)),
    );
    for (const device of devices) {
      expect(canonicalize(device.journal.current())).toBe(canonicalize(domain));
    }
  }

  test('four devices with delayed conflicting edits converge', async () => {
    // Found by fuzzing: d-0 and d-1 reached one conflict with different
    // recovery IDs, and every later merge paused on the collision.
    await delayedConflicts(4, [
      { writers: [2, 3], order: [2, 3] },
      { writers: [2], order: [2] },
      { writers: [0, 2, 3], order: [3, 0, 2] },
      { writers: [0, 1, 2], order: [0, 1, 2] },
      { writers: [1, 2], order: [1, 2] },
      { writers: [0, 3], order: [0, 3] },
      { writers: [2, 3], order: [2, 3] },
      { writers: [0, 2, 3], order: [2, 3, 0] },
      { writers: [0, 1, 2, 3], order: [3, 2, 0, 1] },
    ]);
  });

  test.each(
    Array.from({ length: 18 }, (_, index) => 501 + index).flatMap((seed) =>
      [2, 3, 4].map((count) => [seed, count]),
    ),
  )('delayed conflicting edits converge (seed %i, %i devices)', async (seed, count) => {
    const random = seededRandom(seed);
    const all = Array.from({ length: count }, (_, index) => index);
    const rounds = Array.from({ length: 9 }, (_, round) => {
      const writers = round === 8 ? all : all.filter(() => random() > 0.25);
      return { writers, order: [...writers].sort(() => random() - 0.5) };
    });
    await delayedConflicts(count, rounds);
  });
});

describe('common ancestor selection', () => {
  function lineage(
    author: string,
    domain: SnapshotDomain,
    parents: SnapshotLineage[] = [],
  ): SnapshotLineage {
    const encoded = encodeSnapshot({
      format: 'tackbok-snapshot',
      vaultId: 'vault-sync-test',
      authorDeviceId: author,
      deviceSequence: 1,
      createdAt: 1,
      parentSnapshotIds: parents.map((value) => value.snapshotId).sort(),
      observedDeviceHeads: [],
      ...domain,
    });
    return { snapshotId: encoded.snapshotId, payload: encoded.payload };
  }

  function permutations<T>(values: T[]): T[][] {
    if (values.length <= 1) return [values];
    return values.flatMap((value, index) =>
      permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
        (rest) => [value, ...rest],
      ),
    );
  }

  test('conflicting crossing ancestors give the same base in any history order', () => {
    const root = lineage('root', withEntry(blankDomain(), entry('e', 'root')));
    const branches = ['A', 'B', 'C'].map((author) =>
      lineage(author, withEntry(blankDomain(), entry('e', author)), [root]),
    );
    const remote = lineage('remote', blankDomain(), branches);
    const bases = permutations([...branches, root]).map((history) =>
      canonicalize(commonAncestorDomain(remote, history)),
    );
    expect(new Set(bases).size).toBe(1);
  });

  test('unrelated common ancestors give the same fallback base in any order', () => {
    const left = lineage('A', withEntry(blankDomain(), entry('e', 'A')));
    const right = lineage('B', withEntry(blankDomain(), entry('e', 'B')));
    const remote = lineage('remote', blankDomain(), [left, right]);
    expect(canonicalize(commonAncestorDomain(remote, [left, right]))).toBe(
      canonicalize(commonAncestorDomain(remote, [right, left])),
    );
  });
});

/**
 * Mirrors the production runtime's progress wiring: engine activity hooks plus
 * media transfers reporting their direction. Records the phase shown while each
 * remote operation and the local merge application run.
 */
function trackPhases(provider: FakeSnapshotProvider) {
  const tracker = {
    phase: 'checking' as SyncPassPhase,
    paused: false,
    seen: [] as string[],
    hooks(extra: SnapshotSyncHooks = {}): SnapshotSyncHooks {
      return {
        ...extra,
        activity: (activity) => {
          tracker.phase = PHASE_FOR_ENGINE_ACTIVITY[activity];
        },
        at: async (point) => {
          if (point === 'during-merge-application') record('apply-domain');
          await extra.at?.(point);
        },
      };
    },
  };
  const record = (operation: string) => {
    if (!tracker.paused) tracker.seen.push(`${operation}=${tracker.phase}`);
  };
  const uploadMedia = provider.uploadMedia.bind(provider);
  provider.uploadMedia = (...args) => {
    if (!tracker.paused) tracker.phase = 'uploading';
    return uploadMedia(...args);
  };
  const downloadMedia = provider.downloadMedia.bind(provider);
  provider.downloadMedia = (...args) => {
    if (!tracker.paused) tracker.phase = 'downloading-media';
    return downloadMedia(...args);
  };
  for (const method of [
    'downloadSnapshot',
    'uploadSnapshot',
    'verifySnapshot',
    'updateDeviceHead',
  ] as const) {
    const original = (provider[method] as (...args: unknown[]) => Promise<unknown>).bind(
      provider,
    );
    (provider as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      record(method);
      return original(...args);
    };
  }
  return tracker;
}

describe('sync progress phases', () => {
  test('retention cleanup reads after a publication never read as saving', async () => {
    const app = harness('device-cleanup-phases');
    for (let index = 0; index < 5; index++) {
      app.clock.value++;
      app.journal.mutate(
        withEntry(app.journal.current(), entry(`entry-${index}`, `Value ${index}`)),
      );
      await app.engine().sync();
    }
    app.clock.value += 31 * 24 * 60 * 60 * 1000;
    app.journal.mutate(withEntry(app.journal.current(), entry('entry-new', 'Newest')));

    let phase: SyncPassPhase = 'checking';
    let settled = false;
    const reads: SyncPassPhase[] = [];
    const download = app.provider.downloadSnapshot.bind(app.provider);
    app.provider.downloadSnapshot = async (...args) => {
      if (settled) reads.push(phase);
      return download(...args);
    };
    const result = await app
      .engine({
        activity: (activity) => {
          phase = PHASE_FOR_ENGINE_ACTIVITY[activity];
        },
        at: (point) => {
          if (point === 'after-base-checkpoint-settled') settled = true;
        },
      })
      .sync();
    expect(result.status).toBe('published');
    expect(reads.length).toBeGreaterThan(0);
    expect(reads).not.toContain('uploading');
  });

  test('adopting another device’s snapshot reads as downloading', async () => {
    const provider = new FakeSnapshotProvider();
    const source = harness(
      'device-source',
      withEntry(blankDomain(), entry('entry-remote', 'Remote authored')),
      provider,
    );
    source.state.markDirty(source.vaultId, source.deviceId);
    await source.engine().sync();
    const target = harness('device-target', blankDomain(), provider, source.clock);

    const tracker = trackPhases(provider);
    expect((await target.engine(tracker.hooks()).sync()).status).toBe('pulled');
    expect(tracker.seen).toEqual([
      'downloadSnapshot=checking',
      'apply-domain=downloading',
    ]);
  });

  test('a snapshot published during a media upload downloads as a quiet check', async () => {
    const provider = new FakeSnapshotProvider();
    const bytes = new TextEncoder().encode('synthetic-media-bytes');
    const blobHash = sha256Bytes(bytes);
    const domain = withEntry(blankDomain(), entry('entry-media', 'Has media'));
    domain.media = [
      {
        assetId: 'asset-media',
        ownerType: 'entry',
        ownerId: 'entry-media',
        kind: 'photo',
        blobHash,
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
        width: 10,
        height: 10,
        durationMs: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const app = harness('device-local', domain, provider);
    const other = harness('device-other', blankDomain(), provider, app.clock);
    await app.media.writeVerified(blobHash, bytes);
    app.state.markDirty(app.vaultId, app.deviceId);

    const tracker = trackPhases(provider);
    let published = false;
    const result = await app
      .engine(
        tracker.hooks({
          async beforeHeadRecheck() {
            if (published) return;
            published = true;
            tracker.paused = true;
            other.journal.mutate(withEntry(blankDomain(), entry('entry-other', 'Other')));
            await other.engine().sync();
            tracker.paused = false;
          },
        }),
      )
      .sync();
    expect(result.status).toBe('published');
    expect(provider.requests).toContain('upload-media');
    const downloads = tracker.seen.filter((value) =>
      value.startsWith('downloadSnapshot'),
    );
    expect(downloads.length).toBeGreaterThan(0);
    expect(new Set(downloads)).toEqual(new Set(['downloadSnapshot=checking']));
    expect(tracker.seen.slice(-4)).toEqual([
      'uploadSnapshot=uploading',
      'verifySnapshot=uploading',
      'updateDeviceHead=uploading',
      'apply-domain=uploading',
    ]);
  });

  test('a valid same-sequence duplicate head is read as a quiet check', async () => {
    const app = harness('device-reader');
    for (const [suffix, content] of [
      ['a', 'Branch A'],
      ['b', 'Branch B'],
    ] as const) {
      const encoded = encodeSnapshot({
        format: 'tackbok-snapshot',
        vaultId: app.vaultId,
        parentSnapshotIds: [],
        observedDeviceHeads: [],
        authorDeviceId: 'device-writer',
        deviceSequence: 1,
        createdAt: 1,
        ...withEntry(blankDomain(), entry(`entry-${suffix}`, content)),
      });
      app.provider.injectSnapshot(
        app.vaultId,
        encoded.snapshotId,
        encoded.compressedBytes,
        1,
      );
      app.provider.injectPhysicalHead({
        format: 'tackbok-device-head',
        vaultId: app.vaultId,
        deviceId: 'device-writer',
        deviceSequence: 1,
        snapshotId: encoded.snapshotId,
        updatedAt: 1,
      });
    }

    const tracker = trackPhases(app.provider);
    tracker.phase = 'uploading';
    expect((await app.engine(tracker.hooks()).sync()).status).toBe('attention');
    expect(tracker.seen).toEqual([
      'downloadSnapshot=checking',
      'downloadSnapshot=checking',
    ]);
  });
});
