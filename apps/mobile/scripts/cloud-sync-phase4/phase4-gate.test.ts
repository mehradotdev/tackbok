import { afterEach, describe, expect, test } from 'bun:test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import golden from '../../src/lib/cloudSync/phase0/fixtures/golden-v1.json';
import { canonicalBytes } from '../../src/lib/cloudSync/codec';
import type { DomainState, EntityType, EntryState } from '../../src/lib/cloudSync/domain/types';
import {
  SQLiteEngineCheckpointStore,
  SQLiteSyncEngine,
  type DurableSyncStep,
  type SyncCheckpointDatabase,
} from '../../src/lib/cloudSync/engine';
import { FakeCloudProvider } from '../../src/lib/cloudSync/providers';
import {
  SyncRuntime,
  type RuntimePlatform,
  type RuntimeSubscription,
} from '../../src/lib/cloudSync/runtime/SyncRuntime';
import { runGoldenScenarioWithFactory } from '../../src/lib/cloudSync/engine/goldenCatalog.test';
import { shouldAdoptQueuedGeneration } from '../../src/lib/cloudSync/storage/queueReconciliation';

const databases: Database[] = [];
type SeedItem = { type: EntityType; id: string; state: DomainState };

class BunCheckpointDatabase implements SyncCheckpointDatabase {
  constructor(readonly database: Database) {}
  execSync(source: string): void { this.database.exec(source); }
  getFirstSync<T>(source: string, ...params: unknown[]): T | null {
    return (this.database.query(source).get(...params as SQLQueryBindings[]) as T | null) ?? null;
  }
  getAllSync<T>(source: string, ...params: unknown[]): T[] {
    return this.database.query(source).all(...params as SQLQueryBindings[]) as T[];
  }
  runSync(source: string, ...params: unknown[]): unknown {
    return this.database.query(source).run(...params as SQLQueryBindings[]);
  }
}

function store(): SQLiteEngineCheckpointStore {
  const database = new Database(':memory:', { strict: true });
  databases.push(database);
  database.exec(`
    CREATE TABLE sync_entity_state (
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      current_head_hashes TEXT NOT NULL DEFAULT '[]',
      last_remote_head_hashes TEXT NOT NULL DEFAULT '[]', tombstone INTEGER NOT NULL DEFAULT 0,
      local_generation INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
      PRIMARY KEY(entity_type, entity_id)
    );
    CREATE TABLE sync_change_queue (
      change_id TEXT PRIMARY KEY NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      action TEXT NOT NULL, base_head_hashes TEXT NOT NULL DEFAULT '[]', generation INTEGER NOT NULL,
      batch_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX sync_change_queue_entity_unique ON sync_change_queue(entity_type, entity_id);
    CREATE TABLE sync_versions (
      version_hash TEXT PRIMARY KEY NOT NULL, vault_id TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, parent_hashes TEXT NOT NULL,
      kind TEXT NOT NULL, author_device_id TEXT, edit_sequence INTEGER, state TEXT NOT NULL,
      applied INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0,
      canonical_body TEXT, body_path TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE sync_conflicts (
      conflict_id TEXT PRIMARY KEY NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      head_hashes TEXT NOT NULL, resolution_type TEXT NOT NULL,
      recovered_entities TEXT NOT NULL DEFAULT '[]', alternate_scalars TEXT NOT NULL DEFAULT '[]',
      acknowledged_at INTEGER, created_at INTEGER NOT NULL
    );
  `);
  database.exec(readFileSync(join(import.meta.dir, '../../src/drizzle/0005_normal_mauler.sql'), 'utf8'));
  database.exec(
    readFileSync(join(import.meta.dir, '../../src/drizzle/0006_classy_roxanne_simpson.sql'), 'utf8')
      .replaceAll('--> statement-breakpoint', ''),
  );
  return new SQLiteEngineCheckpointStore(new BunCheckpointDatabase(database));
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

const entry = (content: string, tags: string[] = []): EntryState => ({
  entityType: 'entry', title: content, content, mood: null, tagIds: tags,
  assets: [], createdAt: 1, updatedAt: 1, conflictOriginId: null,
});

async function setup(pageSize = 20) {
  const provider = new FakeCloudProvider(pageSize);
  await provider.connect();
  const { vault } = await provider.createVaultMarker(
    'vault',
    canonicalBytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId: 'vault' }),
  );
  return { provider, vault };
}

describe('SQLite engine catalog and restart gate', () => {
  test('a structured queue row cannot resurrect an already-settled durable generation', () => {
    expect(shouldAdoptQueuedGeneration({
      queuedGeneration: 7,
      durableOutboxGeneration: null,
      durableEntityGeneration: 7,
    })).toBe(false);
    expect(shouldAdoptQueuedGeneration({
      queuedGeneration: 8,
      durableOutboxGeneration: null,
      durableEntityGeneration: 7,
    })).toBe(true);
    expect(shouldAdoptQueuedGeneration({
      queuedGeneration: 7,
      durableOutboxGeneration: 7,
      durableEntityGeneration: 7,
    })).toBe(false);
  });

  test.each(golden.scenarios.map(({ id }) => id))(
    'frozen semantic scenario %s passes with SQLite reconstruction between operations',
    async (id) => {
      const stores = new Map<string, SQLiteEngineCheckpointStore>();
      await runGoldenScenarioWithFactory(id, (deviceId, vault, provider) => {
        const checkpoint = stores.get(deviceId) ?? store();
        stores.set(deviceId, checkpoint);
        let normalizedSeed: SeedItem[] | null = null;
        const open = () => new SQLiteSyncEngine(
          deviceId, vault, provider, checkpoint, { persistInlineBlobs: true },
        );
        return new Proxy({} as SQLiteSyncEngine, {
          get(_target, property) {
            if (property === 'seed') {
              return (states: SeedItem[]) => {
                normalizedSeed = [...states].sort((left, right) =>
                  `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`),
                );
              };
            }
            const engine = open();
            if (property === 'sync' && normalizedSeed && engine.needsSeedPage) {
              const cursor = engine.seedingCheckpoint;
              const start = cursor === null
                ? 0
                : normalizedSeed.findIndex(({ type, id }) => `${type}:${id}` === cursor) + 1;
              const page = normalizedSeed.slice(start, start + 50);
              engine.seedBatch(page, start + page.length >= normalizedSeed.length);
            }
            const value = engine[property as keyof SQLiteSyncEngine];
            return typeof value === 'function' ? value.bind(engine) : value;
          },
        }) as unknown as import('../../src/lib/cloudSync/engine').InMemorySyncDevice;
      });
      for (const checkpoint of stores.values()) {
        expect(checkpoint.stats.restoredLoadCount).toBeGreaterThan(0);
      }
    },
  );

  test.each([
    'publish-edit',
    'publish-blob',
    'publish-recovery-init',
    'publish-resolution',
    'publish-join',
  ] as DurableSyncStep[])('process death after %s resumes without losing intent', async (killStep) => {
    const { provider, vault } = await setup();
    const checkpoint = store();
    const remote = new SQLiteSyncEngine('remote', vault, provider, checkpoint);
    remote.mutate('entry', 'e', entry('base'));
    await remote.sync();

    let killed = false;
    let local = new SQLiteSyncEngine('local', vault, provider, checkpoint, {
      persistInlineBlobs: true,
      onCheckpoint(step) {
        if (!killed && step === killStep) {
          killed = true;
          throw new Error(`process-death:${step}`);
        }
      },
    });
    await local.sync();
    remote.mutate('entry', 'e', entry(killStep === 'publish-join' ? 'same' : 'remote'));
    await remote.sync();
    if (killStep === 'publish-blob') {
      const bytes = new Uint8Array([1, 2, 3]);
      const hash = local.putBlob(bytes);
      local.mutate('entry', 'e', {
        ...entry('local'),
        assets: [{
          assetId: 'a', kind: 'photo', mimeType: 'image/jpeg', byteSize: 3,
          width: 1, height: 1, durationMs: null, blobHash: hash,
        }],
      });
    } else {
      local.mutate('entry', 'e', entry(killStep === 'publish-join' ? 'same' : 'local'));
    }
    await expect(local.sync()).rejects.toThrow(`process-death:${killStep}`);
    expect(killed).toBe(true);

    local = new SQLiteSyncEngine('local', vault, provider, checkpoint);
    for (let pass = 0; pass < 3; pass++) await local.sync();
    expect(local.outbox.size).toBe(0);
    expect(local.snapshot()['entry:e']).toBeDefined();
    if (killStep === 'publish-blob') expect(local.blobs.size).toBe(1);
  });

  test('process death immediately after the revocation marker resumes the purge', async () => {
    const { provider, vault } = await setup(1);
    const checkpoint = store();
    const seed = new SQLiteSyncEngine('owner', vault, provider, checkpoint);
    seed.mutate('entry', 'e', entry('value'));
    await seed.sync();
    const crashing = new SQLiteSyncEngine('owner', vault, provider, checkpoint, {
      onCheckpoint(step) {
        if (step === 'publish-revocation') throw new Error('process-death:publish-revocation');
      },
    });
    await expect(crashing.revoke('backup-deleted', 'revocation', 1))
      .rejects.toThrow('process-death:publish-revocation');
    const restarted = new SQLiteSyncEngine('owner', vault, provider, checkpoint);
    await restarted.sync();
    expect(restarted.isRevoked).toBe(true);
    expect(provider.physicalObjects(vault).every((item) => item.key.startsWith('revocations/')))
      .toBe(true);
  });

  test('a process kill loses neither queued intent nor the retained-media ledger', async () => {
    const { provider, vault } = await setup();
    const checkpoint = store();
    const database = databases.at(-1)!;
    database.exec(`CREATE TABLE sync_retained_media (
      ledger_id TEXT PRIMARY KEY NOT NULL,
      original_uri TEXT NOT NULL,
      state TEXT NOT NULL
    )`);
    database.query(
      'INSERT INTO sync_retained_media(ledger_id, original_uri, state) VALUES (?, ?, ?)',
    ).run('ledger', 'photos/kept.jpg', 'recorded');
    let killed = false;
    const crashing = new SQLiteSyncEngine('device', vault, provider, checkpoint, {
      onCheckpoint(step) {
        if (!killed && step === 'publish-edit') {
          killed = true;
          throw new Error('process-death:publish-edit');
        }
      },
    });
    crashing.mutate('entry', 'e', entry('queued'));
    await expect(crashing.sync()).rejects.toThrow('process-death:publish-edit');
    const restarted = new SQLiteSyncEngine('device', vault, provider, checkpoint);
    expect(restarted.outbox.size).toBe(1);
    expect(database.query(
      'SELECT original_uri FROM sync_retained_media WHERE ledger_id = ?',
    ).get('ledger')).toEqual({ original_uri: 'photos/kept.jpg' });
    await restarted.sync();
    expect(restarted.outbox.size).toBe(0);
  });

  test('a kill before normalized materialization replays the exact pending Apply', async () => {
    const { provider, vault } = await setup();
    const sourceStore = store();
    const localStore = store();
    const source = new SQLiteSyncEngine('source', vault, provider, sourceStore);
    source.mutate('entry', 'remote-entry', entry('remote value'));
    await source.sync();

    let local = new SQLiteSyncEngine('local', vault, provider, localStore, {
      requiresMaterializationAck: true,
    });
    const interrupted = await local.sync();
    expect(interrupted.appliedEntityKeys).toEqual(['entry:remote-entry']);
    expect(interrupted.remoteApplied).toBe(1);

    // Simulate process death before the normalized/UI transaction and its ack.
    local = new SQLiteSyncEngine('local', vault, provider, localStore, {
      requiresMaterializationAck: true,
    });
    const replay = await local.sync();
    expect(replay.appliedEntityKeys).toEqual(['entry:remote-entry']);
    expect(replay.remoteApplied).toBe(1);
    local.acknowledgeMaterialized(replay.appliedEntityKeys);

    local = new SQLiteSyncEngine('local', vault, provider, localStore, {
      requiresMaterializationAck: true,
    });
    const settled = await local.sync();
    expect(settled.appliedEntityKeys).toEqual([]);
    expect(settled.remoteApplied).toBe(0);
  });

  test('a kill after every bounded purge batch resumes and preserves revocation markers', async () => {
    for (let killBatch = 1; killBatch <= 5; killBatch++) {
      const { provider, vault } = await setup(1);
      const checkpoint = store();
      const seed = new SQLiteSyncEngine('seed', vault, provider, checkpoint);
      for (let index = 0; index < 4; index++) {
        seed.mutate('entry', `e-${index}`, entry(`value-${index}`));
        await seed.sync();
      }
      let observedBatches = 0;
      const crashing = new SQLiteSyncEngine('owner', vault, provider, checkpoint, {
        onCheckpoint(step) {
          if (step === 'purge-batch' && ++observedBatches === killBatch) {
            throw new Error('process-death:purge-batch');
          }
        },
      });
      await expect(crashing.revoke('backup-deleted', `r-${killBatch}`, 1))
        .rejects.toThrow('process-death:purge-batch');
      const restarted = new SQLiteSyncEngine('owner', vault, provider, checkpoint);
      await restarted.sync();
      expect(restarted.isRevoked).toBe(true);
      expect(provider.physicalObjects(vault).every((item) =>
        item.key.startsWith('revocations/'),
      )).toBe(true);
    }
  });

  test('checkpointed initial seeding survives restarts and an ahead-of-cursor edit', async () => {
    const { provider, vault } = await setup(3);
    const checkpoint = store();
    let engine = new SQLiteSyncEngine('seed', vault, provider, checkpoint);
    const normalizedSeed = Array.from({ length: 80 }, (_, index) => ({
      type: 'entry' as const,
      id: `e-${String(index).padStart(3, '0')}`,
      state: entry(`seed-${index}`),
    }));
    engine.mutate('entry', 'e-075', entry('ahead-of-cursor'));
    for (let pass = 0; pass < 8; pass++) {
      if (engine.needsSeedPage) {
        const cursor = engine.seedingCheckpoint;
        const start = cursor === null
          ? 0
          : normalizedSeed.findIndex(({ type, id }) => `${type}:${id}` === cursor) + 1;
        const page = normalizedSeed.slice(start, start + 50);
        engine.seedBatch(page, start + page.length >= normalizedSeed.length);
      }
      await engine.sync();
      engine = new SQLiteSyncEngine('seed', vault, provider, checkpoint);
    }
    expect(engine.snapshot()['entry:e-075']).toMatchObject({ content: 'ahead-of-cursor' });
    expect(engine.outbox.size).toBe(0);
    expect(engine.seedingCheckpoint).toBe('entry:e-079');
  });

  test('500/2,000-entity paged seeding keeps the pass checkpoint bounded', async () => {
    const results: {
      entities: number;
      elapsedMs: number;
      checkpointSaves: number;
      checkpointBytesWritten: number;
      maxCheckpointBytes: number;
    }[] = [];
    for (const total of [500, 2_000]) {
      const { provider, vault } = await setup(500);
      const checkpoint = store();
      const startedAt = performance.now();
      let engine = new SQLiteSyncEngine(`scale-${total}`, vault, provider, checkpoint);
      for (let offset = 0; offset < total; offset += 50) {
        engine.seedBatch(Array.from({ length: 50 }, (_, pageIndex) => {
          const index = offset + pageIndex;
          return {
            type: 'entry' as const,
            id: `scale-${String(index).padStart(5, '0')}`,
            state: entry(`scale-${index}-${'x'.repeat(400)}`),
          };
        }), offset + 50 === total);
        await engine.sync();
        engine = new SQLiteSyncEngine(`scale-${total}`, vault, provider, checkpoint);
      }
      const elapsedMs = performance.now() - startedAt;
      expect(engine.outbox.size).toBe(0);
      expect(engine.isSeedingComplete).toBe(true);
      expect(checkpoint.stats.maxCheckpointBytes).toBeLessThan(64 * 1024);
      expect(elapsedMs).toBeLessThan(30_000);
      results.push({
        entities: total,
        elapsedMs: Math.round(elapsedMs),
        checkpointSaves: checkpoint.stats.saveCount,
        checkpointBytesWritten: checkpoint.stats.checkpointBytesWritten,
        maxCheckpointBytes: checkpoint.stats.maxCheckpointBytes,
      });
    }
    expect(results[1].checkpointBytesWritten / results[0].checkpointBytesWritten)
      .toBeLessThan(6);
    expect(results[1].checkpointBytesWritten).toBeLessThan(20 * 1024 * 1024);
    process.stdout.write(`${JSON.stringify({ phase4Scale: results })}\n`);
  }, 30_000);

  test('general chaos and revocation schedules converge across a restart after every pass', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { provider, vault } = await setup(3);
      const checkpoint = store();
      const open = (id: string) => new SQLiteSyncEngine(id, vault, provider, checkpoint);
      let devices = ['a', 'b', 'c'].map(open);
      devices[0].mutate('entry', 'e', entry(`root-${seed}`));
      for (let round = 0; round < 2; round++) {
        for (const device of devices) await device.sync();
        devices = ['a', 'b', 'c'].map(open);
      }
      for (let operation = 0; operation < 6; operation++) {
        const index = (seed + operation) % devices.length;
        devices[index].mutate('entry', 'e', entry(`s${seed}-o${operation}`, [`t${operation % 2}`]));
        provider.faults.duplicateNextPut = operation % 3 === 0;
        try { await devices[index].sync(); } catch { /* retry after restart */ }
        devices = ['a', 'b', 'c'].map(open);
      }
      for (let round = 0; round < 7; round++) {
        for (const device of devices) await device.sync();
        devices = ['a', 'b', 'c'].map(open);
      }
      expect(devices.map((device) => device.snapshot())).toEqual([
        devices[0].snapshot(), devices[0].snapshot(), devices[0].snapshot(),
      ]);

      devices[1].mutate('entry', 'e', entry(`stale-${seed}`));
      await devices[0].revoke(seed % 2 ? 'backup-deleted' : 'journal-deleted', `r-${seed}`, seed);
      devices = ['a', 'b', 'c'].map(open);
      await devices[1].sync();
      await devices[2].sync();
      expect(devices.every((device) => device.isRevoked)).toBe(true);
    }
  });
});

class FakePlatform implements RuntimePlatform {
  appListener: ((state: 'active' | 'background' | 'inactive') => void) | null = null;
  networkListener: ((online: boolean) => void) | null = null;
  timers: (() => void)[] = [];
  online = true;
  addAppStateListener(listener: (state: 'active' | 'background' | 'inactive') => void): RuntimeSubscription {
    this.appListener = listener; return { remove: () => { this.appListener = null; } };
  }
  addNetworkListener(listener: (online: boolean) => void): RuntimeSubscription {
    this.networkListener = listener; return { remove: () => { this.networkListener = null; } };
  }
  async getNetworkOnline() { return this.online; }
  setTimer(callback: () => void) {
    this.timers.push(callback);
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }
  clearTimer() {}
  async fireTimer() { this.timers.shift()?.(); await Promise.resolve(); await Promise.resolve(); }
}

describe('SyncRuntime gate', () => {
  const emptyResult = () => ({
    pulled: 0, pushed: 0, applied: 0, skippedByCas: 0, revoked: false as const,
    changedEntityKeys: [], appliedEntityKeys: [], remoteApplied: 0,
  });

  test('sync cannot start before readiness and a failed backfill retries in-session', async () => {
    const platform = new FakePlatform();
    let ready = false;
    let attempts = 0;
    let created = 0;
    let passes = 0;
    const runtime = new SyncRuntime({
      platform,
      readiness: {
        isReady: async () => ready,
        retryBackfill: async () => {
          attempts++;
          if (attempts === 1) throw new Error('interrupted');
          ready = true;
        },
      },
      createEngine: async () => {
        created++;
        return {
          provider: { kind: 'google-drive' as const },
          sync: async () => {
            passes++;
            return {
              pulled: 0, pushed: 0, applied: 0, skippedByCas: 0, revoked: false,
              changedEntityKeys: [], appliedEntityKeys: [], remoteApplied: 0,
            };
          },
        };
      },
      readinessRetryMs: 1,
    });
    await runtime.start();
    expect({ attempts, created, passes }).toEqual({ attempts: 1, created: 0, passes: 0 });
    await platform.fireTimer();
    await Promise.resolve();
    expect({ attempts, created, passes }).toEqual({ attempts: 2, created: 1, passes: 1 });
    runtime.stop();
  });

  test('one background trigger runs one bounded pass and returns', async () => {
    const platform = new FakePlatform();
    let passes = 0;
    const runtime = new SyncRuntime({
      platform,
      readiness: { isReady: async () => true, retryBackfill: async () => undefined },
      createEngine: async () => ({
        provider: { kind: 'google-drive' as const },
        sync: async () => {
          passes++;
          return {
            pulled: 1, pushed: 1, applied: 1, skippedByCas: 0, revoked: false,
            changedEntityKeys: [], appliedEntityKeys: [], remoteApplied: 0,
          };
        },
      }),
    });
    await runtime.start();
    const before = passes;
    const result = await runtime.runBoundedBackgroundPass('periodic');
    expect(result).not.toBeNull();
    expect(passes).toBe(before + 1);
    runtime.stop();
  });

  test('a committed local mutation schedules the debounced foreground pass', async () => {
    const platform = new FakePlatform();
    let mutationListener = () => {};
    let passes = 0;
    const runtime = new SyncRuntime({
      platform,
      readiness: { isReady: async () => true, retryBackfill: async () => undefined },
      addMutationListener(listener) {
        mutationListener = listener;
        return { remove: () => { mutationListener = () => {}; } };
      },
      createEngine: async () => ({
        provider: { kind: 'google-drive' as const },
        sync: async () => { passes++; return emptyResult(); },
      }),
      debounceMs: 1,
    });
    await runtime.start();
    mutationListener();
    await platform.fireTimer();
    await Promise.resolve();
    expect(passes).toBe(2);
    runtime.stop();
  });

  test('a trigger arriving during a pass queues exactly one follow-up pass', async () => {
    const platform = new FakePlatform();
    let passes = 0;
    const control: { release?: () => void } = {};
    let block = false;
    const runtime = new SyncRuntime({
      platform,
      readiness: { isReady: async () => true, retryBackfill: async () => undefined },
      createEngine: async () => ({
        provider: { kind: 'google-drive' as const },
        sync: async () => {
          passes++;
          if (block) {
            block = false;
            await new Promise<void>((resolve) => { control.release = resolve; });
          }
          return emptyResult();
        },
      }),
    });
    await runtime.start();
    block = true;
    const first = runtime.run('manual');
    await Promise.resolve();
    void runtime.run('local-mutation');
    control.release?.();
    await first;
    expect(passes).toBe(3);
    runtime.stop();
  });

  test('stop during an awaiting start cannot leak subscriptions', async () => {
    const onlineControl: { resolve?: (online: boolean) => void } = {};
    let subscriptions = 0;
    const platform: RuntimePlatform = {
      getNetworkOnline: () => new Promise((resolve) => { onlineControl.resolve = resolve; }),
      addAppStateListener: () => { subscriptions++; return { remove: () => subscriptions-- }; },
      addNetworkListener: () => { subscriptions++; return { remove: () => subscriptions-- }; },
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => undefined,
    };
    const runtime = new SyncRuntime({
      platform,
      readiness: { isReady: async () => true, retryBackfill: async () => undefined },
      createEngine: async () => null,
    });
    const starting = runtime.start();
    runtime.stop();
    onlineControl.resolve?.(true);
    await starting;
    expect(subscriptions).toBe(0);
  });

  test('runtime and layout contain no notification permission dependency', () => {
    const files = [
      '../../src/lib/cloudSync/runtime/SyncRuntime.ts',
      '../../src/lib/cloudSync/runtime/production.ts',
      '../../src/lib/cloudSync/runtime/backgroundTask.ts',
      '../../src/app/_layout.tsx',
    ];
    const source = files.map((file) => readFileSync(join(import.meta.dir, file), 'utf8')).join('\n');
    expect(source).not.toContain('expo-notifications');
    expect(source).not.toMatch(/requestPermissionsAsync|requestPermissions/);
    expect(source).toContain('if (result.remoteApplied > 0)');
    expect(source).toContain('isProductionCloudSyncConfigured');
  });
});
