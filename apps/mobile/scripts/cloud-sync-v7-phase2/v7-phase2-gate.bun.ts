import { afterEach, describe, expect, test } from 'bun:test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalBytesV2, canonicalizeV2 } from '../../src/lib/cloudSync/v2/canonical';
import { decodeSnapshotV2, encodeSnapshotV2 } from '../../src/lib/cloudSync/v2/codec';
import { sha256BytesV2 } from '../../src/lib/cloudSync/v2/sha256';
import { BaseShadowManagerV2 } from '../../src/lib/cloudSync/v2/sync/baseShadow';
import { SnapshotV2SyncEngine } from '../../src/lib/cloudSync/v2/sync/engine';
import {
  FakeSnapshotV2Provider,
  MemoryBaseShadowFileStore,
  MemorySnapshotV2JournalStore,
  MemorySnapshotV2MediaStore,
} from '../../src/lib/cloudSync/v2/sync/fakes';
import {
  SQLiteV2SyncStateStore,
  type V2SyncDatabase,
} from '../../src/lib/cloudSync/v2/sync/sqliteState';
import {
  V2_ATTENTION_RECOVERY_ACTION,
  V2ProviderError,
  type V2AttentionReason,
  type V2KillPoint,
  type V2SyncHooks,
} from '../../src/lib/cloudSync/v2/sync/types';
import type {
  SnapshotDomainV2,
  SnapshotEntryV2,
} from '../../src/lib/cloudSync/v2/types';
import { encodeGzip } from '../../src/lib/zip/core/gzip-codec';

const databases: Database[] = [];
const V7_MIGRATION = readFileSync(
  join(import.meta.dir, '../../src/drizzle/0007_confused_infant_terrible.sql'),
  'utf8',
).replaceAll('--> statement-breakpoint', '');

class BunV2Database implements V2SyncDatabase {
  constructor(private readonly database: Database) {}
  execSync(source: string): void { this.database.exec(source); }
  getFirstSync<T>(source: string, ...params: unknown[]): T | null {
    return this.database.query(source).get(...params as SQLQueryBindings[]) as T | null;
  }
  getAllSync<T>(source: string, ...params: unknown[]): T[] {
    return this.database.query(source).all(...params as SQLQueryBindings[]) as T[];
  }
  runSync(source: string, ...params: unknown[]): unknown {
    return this.database.query(source).run(...params as SQLQueryBindings[]);
  }
}

function database(): BunV2Database {
  const sqlite = new Database(':memory:', { strict: true });
  sqlite.exec(V7_MIGRATION);
  databases.push(sqlite);
  return new BunV2Database(sqlite);
}

function blankDomain(): SnapshotDomainV2 {
  return {
    entries: [], tags: [], entryTags: [], prompts: [],
    profile: { profileId: 'profile', displayName: null, photoAssetId: null, updatedAt: 1 },
    media: [], tombstones: [], conflicts: [],
  };
}

function entry(entryId: string, content: string, updatedAt = 1): SnapshotEntryV2 {
  return {
    entryId, title: null, content, mood: null, createdAt: 1, updatedAt,
    conflictOriginId: null,
  };
}

function withEntry(domain: SnapshotDomainV2, value: SnapshotEntryV2): SnapshotDomainV2 {
  const next = structuredClone(domain);
  next.entries = [...next.entries.filter((item) => item.entryId !== value.entryId), value]
    .sort((left, right) => left.entryId.localeCompare(right.entryId));
  return next;
}

interface Clock { value: number }

interface Harness {
  vaultId: string;
  deviceId: string;
  provider: FakeSnapshotV2Provider;
  database: BunV2Database;
  state: SQLiteV2SyncStateStore;
  files: MemoryBaseShadowFileStore;
  shadows: BaseShadowManagerV2;
  journal: MemorySnapshotV2JournalStore;
  media: MemorySnapshotV2MediaStore;
  clock: Clock;
  engine(hooks?: V2SyncHooks): SnapshotV2SyncEngine;
}

function harness(
  deviceId: string,
  initial = blankDomain(),
  provider = new FakeSnapshotV2Provider(),
  clock: Clock = { value: 1_800_000_000_000 },
  vaultId = 'vault-v7-phase2',
): Harness {
  const syncDatabase = database();
  const state = new SQLiteV2SyncStateStore(syncDatabase, () => clock.value);
  const files = new MemoryBaseShadowFileStore();
  const shadows = new BaseShadowManagerV2(files);
  const journal = new MemorySnapshotV2JournalStore(initial, state, vaultId, deviceId);
  const media = new MemorySnapshotV2MediaStore();
  return {
    vaultId, deviceId, provider, database: syncDatabase,
    state, files, shadows, journal, media, clock,
    engine: (hooks = {}) => new SnapshotV2SyncEngine(
      vaultId, deviceId, state, shadows, journal, media, provider, hooks,
      () => clock.value,
    ),
  };
}

class SimulatedProcessDeath extends Error {}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('V7-2 durable publisher', () => {
  test('a 2,000-entry import coalesces into one immutable snapshot and one head write', async () => {
    const imported = blankDomain();
    imported.entries = Array.from({ length: 2_000 }, (_, index) =>
      entry(`entry-${String(index).padStart(4, '0')}`, `Synthetic import row ${index}`));
    const app = harness('device-import', imported);
    app.state.markDirty(app.vaultId, app.deviceId, 2_000);

    const result = await app.engine().sync();
    expect(result.status).toBe('published');
    expect(app.provider.requests.filter((value) => value === 'upload-snapshot')).toHaveLength(1);
    expect(app.provider.requests.filter((value) => value === 'update-head')).toHaveLength(1);
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
  ] satisfies V2KillPoint[])('restart at %s preserves intent and the previous backup', async (point) => {
    const app = harness('device-kill');
    app.journal.mutate(withEntry(blankDomain(), entry('entry-base', 'Verified base')));
    await app.engine().sync();
    const previousId = app.provider.physicalHeads(app.vaultId)[0].head.snapshotId;
    app.clock.value += 1;
    app.journal.mutate(withEntry(app.journal.current(), entry('entry-next', 'Queued after base', 2)));
    let injected = false;
    const hooks: V2SyncHooks = {
      at(candidate) {
        if (!injected && candidate === point) {
          injected = true;
          throw new SimulatedProcessDeath(point);
        }
      },
    };

    await expect(app.engine(hooks).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);
    const resumed = await app.engine().sync();
    expect(['published', 'up-to-date']).toContain(resumed.status);
    expect(app.provider.snapshotIds(app.vaultId)).toContain(previousId);
    expect(app.journal.current().entries.map((value) => value.content))
      .toEqual(['Verified base', 'Queued after base']);
    expect(app.state.loadPending(app.vaultId, app.deviceId)).toBeNull();
    expect(app.state.loadState(app.vaultId, app.deviceId).settledGeneration)
      .toBe(app.state.loadState(app.vaultId, app.deviceId).journalGeneration);
  });

  test('media survives a transfer death and is uploaded before its referencing snapshot', async () => {
    const bytes = new TextEncoder().encode('synthetic-media-bytes');
    const blobHash = sha256BytesV2(bytes);
    const domain = withEntry(blankDomain(), entry('entry-media', 'Has media'));
    domain.media = [{
      assetId: 'asset-media', ownerType: 'entry', ownerId: 'entry-media', kind: 'photo',
      blobHash, mimeType: 'image/jpeg', byteSize: bytes.length, width: 10, height: 10,
      durationMs: null, createdAt: 1, updatedAt: 1,
    }];
    const app = harness('device-media', domain);
    await app.media.writeVerified(blobHash, bytes);
    app.state.markDirty(app.vaultId, app.deviceId);
    let killed = false;
    await expect(app.engine({
      at(point) {
        if (!killed && point === 'during-media-transfer') {
          killed = true;
          throw new SimulatedProcessDeath(point);
        }
      },
    }).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);
    expect(app.provider.snapshotIds(app.vaultId)).toEqual([]);

    await app.engine().sync();
    const mediaUpload = app.provider.requests.indexOf('upload-media');
    const snapshotUpload = app.provider.requests.indexOf('upload-snapshot');
    expect(mediaUpload).toBeGreaterThanOrEqual(0);
    expect(snapshotUpload).toBeGreaterThan(mediaUpload);
  });

  test('a resumed candidate re-establishes vanished media before snapshot upload', async () => {
    const bytes = new TextEncoder().encode('synthetic-resume-media');
    const blobHash = sha256BytesV2(bytes);
    const domain = withEntry(blankDomain(), entry('entry-resume-media', 'Resume media'));
    domain.media = [{
      assetId: 'asset-resume-media', ownerType: 'entry', ownerId: 'entry-resume-media',
      kind: 'photo', blobHash, mimeType: 'image/jpeg', byteSize: bytes.length,
      width: 1, height: 1, durationMs: null, createdAt: 1, updatedAt: 1,
    }];
    const app = harness('device-resume-media', domain);
    await app.media.writeVerified(blobHash, bytes);
    app.state.markDirty(app.vaultId, app.deviceId);
    await expect(app.engine({
      at(point) {
        if (point === 'after-candidate-persisted') throw new SimulatedProcessDeath(point);
      },
    }).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);
    app.provider.removeMediaForTest(app.vaultId, blobHash);

    expect((await app.engine().sync()).status).toBe('published');
    expect(app.provider.requests.filter((value) => value === 'upload-media')).toHaveLength(2);
    expect(app.provider.requests.lastIndexOf('upload-media'))
      .toBeLessThan(app.provider.requests.indexOf('upload-snapshot'));
  });

  test('lost upload and head responses resume idempotently without double materialization', async () => {
    const app = harness('device-lost-response');
    app.journal.mutate(withEntry(blankDomain(), entry('entry-one', 'One logical edit')));
    app.provider.failNext(
      'upload-snapshot',
      new V2ProviderError('transient', 'lost upload response'),
      true,
    );
    expect((await app.engine().sync()).status).toBe('retry');
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(1);

    app.provider.failNext(
      'update-head',
      new V2ProviderError('transient', 'lost head response'),
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
    app.journal.mutate(withEntry(app.journal.current(), entry('entry-candidate', 'Candidate')));
    let killed = false;
    await expect(app.engine({
      at(point) {
        if (!killed && point === 'after-head-advanced') {
          killed = true;
          app.journal.mutate(withEntry(app.journal.current(), entry('entry-late', 'Late edit')));
          throw new SimulatedProcessDeath(point);
        }
      },
    }).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);

    const settledCandidate = await app.engine().sync();
    expect(settledCandidate).toMatchObject({ status: 'published', actionableChanges: 1 });
    expect(app.journal.current().entries.some((value) => value.entryId === 'entry-late')).toBe(true);
    const final = await app.engine().sync();
    expect(final).toMatchObject({ status: 'published', actionableChanges: 0 });
    expect(app.journal.current().entries.map((value) => value.entryId))
      .toEqual(['entry-base', 'entry-candidate', 'entry-late']);
  });

  test('a live CAS miss re-merges remote-derived content before base settlement', async () => {
    const provider = new FakeSnapshotV2Provider();
    const clock = { value: 1_800_000_000_000 };
    const source = harness('device-x1-source', blankDomain(), provider, clock);
    source.journal.mutate(withEntry(
      source.journal.current(),
      entry('entry-remote-x1', 'Remote branch survives'),
    ));
    await source.engine().sync();

    const target = harness('device-x1-target', blankDomain(), provider, clock);
    let edited = false;
    const first = await target.engine({
      at(point) {
        if (!edited && point === 'after-head-advanced') {
          edited = true;
          target.journal.mutate(withEntry(
            target.journal.current(),
            entry('entry-late-x1', 'Late local edit'),
          ));
        }
      },
    }).sync();
    expect(first).toMatchObject({ status: 'published', actionableChanges: 1 });
    expect(target.journal.current().entries.map((value) => value.entryId))
      .toEqual(['entry-late-x1', 'entry-remote-x1']);

    expect(await target.engine().sync()).toMatchObject({
      status: 'published', actionableChanges: 0,
    });
    const targetHead = provider.physicalHeads(target.vaultId)
      .find((value) => value.head.deviceId === target.deviceId)!.head;
    const targetBytes = await provider.downloadSnapshot(target.vaultId, targetHead.snapshotId);
    expect(targetBytes).not.toBeNull();
    const targetPayload = decodeSnapshotV2(targetBytes!, targetHead.snapshotId).payload;
    expect(targetPayload.entries.map((value) => value.entryId))
      .toEqual(['entry-late-x1', 'entry-remote-x1']);
    expect(targetPayload.tombstones.some((value) => value.entityId === 'entry-remote-x1'))
      .toBe(false);

    provider.removeDeviceHeadForTest(target.vaultId, source.deviceId);
    const restored = harness('device-x1-restored', blankDomain(), provider, clock);
    expect((await restored.engine().sync()).status).toBe('published');
    expect(restored.journal.current().entries.map((value) => value.entryId))
      .toEqual(['entry-late-x1', 'entry-remote-x1']);
  });

  test('a head-advanced crash then local edit re-merges remote-derived content on resume', async () => {
    const provider = new FakeSnapshotV2Provider();
    const clock = { value: 1_800_000_000_000 };
    const source = harness('device-x1-crash-source', blankDomain(), provider, clock);
    source.journal.mutate(withEntry(
      source.journal.current(),
      entry('entry-remote-crash', 'Remote branch survives restart'),
    ));
    await source.engine().sync();

    const target = harness('device-x1-crash-target', blankDomain(), provider, clock);
    let killed = false;
    await expect(target.engine({
      at(point) {
        if (!killed && point === 'after-head-advanced') {
          killed = true;
          throw new SimulatedProcessDeath(point);
        }
      },
    }).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);
    expect(target.state.loadPending(target.vaultId, target.deviceId)?.stage)
      .toBe('head-advanced');
    target.journal.mutate(withEntry(
      target.journal.current(),
      entry('entry-late-crash', 'Late edit after process death'),
    ));

    expect(await target.engine().sync()).toMatchObject({
      status: 'published', actionableChanges: 1,
    });
    expect(target.journal.current().entries.map((value) => value.entryId))
      .toEqual(['entry-late-crash', 'entry-remote-crash']);
    expect(await target.engine().sync()).toMatchObject({
      status: 'published', actionableChanges: 0,
    });
    const targetHead = provider.physicalHeads(target.vaultId)
      .find((value) => value.head.deviceId === target.deviceId)!.head;
    const targetBytes = await provider.downloadSnapshot(target.vaultId, targetHead.snapshotId);
    expect(targetBytes).not.toBeNull();
    const targetPayload = decodeSnapshotV2(targetBytes!, targetHead.snapshotId).payload;
    expect(targetPayload.entries.map((value) => value.entryId))
      .toEqual(['entry-late-crash', 'entry-remote-crash']);
    expect(targetPayload.tombstones.some((value) => value.entityId === 'entry-remote-crash'))
      .toBe(false);

    provider.removeDeviceHeadForTest(target.vaultId, source.deviceId);
    const restored = harness('device-x1-crash-restored', blankDomain(), provider, clock);
    expect((await restored.engine().sync()).status).toBe('published');
    expect(restored.journal.current().entries.map((value) => value.entryId))
      .toEqual(['entry-late-crash', 'entry-remote-crash']);
  });

  test('a corrupted pending candidate pauses durably instead of escaping the engine', async () => {
    const app = harness('device-corrupt-pending');
    app.journal.mutate(withEntry(blankDomain(), entry('entry-pending', 'Pending candidate')));
    await expect(app.engine({
      at(point) {
        if (point === 'after-candidate-persisted') {
          throw new SimulatedProcessDeath(point);
        }
      },
    }).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);
    app.database.runSync(
      `UPDATE cloud_v2_pending_publication
       SET compressed_bytes = ?
       WHERE vault_id = ? AND device_id = ?`,
      new Uint8Array([1, 2, 3]),
      app.vaultId,
      app.deviceId,
    );

    expect(await app.engine().sync()).toMatchObject({
      status: 'attention', reason: 'invalid-remote-snapshot',
    });
    expect(app.state.loadState(app.vaultId, app.deviceId)).toMatchObject({
      pauseReason: 'invalid-remote-snapshot',
      lastErrorClass: 'local-candidate-validation-invalid-gzip',
    });
    expect(app.state.loadPending(app.vaultId, app.deviceId)?.stage)
      .toBe('candidate-persisted');
  });

  test('repeated journal CAS misses stay bounded and retain the head-advanced intent', async () => {
    const app = harness('device-cas-contention');
    app.journal.mutate(withEntry(blankDomain(), entry('entry-contention', 'Queued intent')));
    const apply = app.journal.applyMergedIfGeneration.bind(app.journal);
    app.journal.applyMergedIfGeneration = async () => false;

    expect(await app.engine().sync()).toMatchObject({
      status: 'retry', reason: 'transient', actionableChanges: 1,
    });
    expect(app.state.loadPending(app.vaultId, app.deviceId)?.stage).toBe('head-advanced');
    expect(app.state.loadBaseCheckpoint(app.vaultId, app.deviceId)).toBeNull();
    expect(app.state.loadState(app.vaultId, app.deviceId).lastErrorClass)
      .toBe('journal-changed-during-publication-reconciliation');

    app.journal.applyMergedIfGeneration = apply;
    expect(await app.engine().sync()).toMatchObject({
      status: 'published', actionableChanges: 0,
    });
  });

  test('remote snapshot download death restarts without hiding the remote head', async () => {
    const provider = new FakeSnapshotV2Provider();
    const source = harness(
      'device-source',
      withEntry(blankDomain(), entry('entry-remote', 'Remote authored')),
      provider,
    );
    source.state.markDirty(source.vaultId, source.deviceId);
    await source.engine().sync();
    const target = harness('device-target', blankDomain(), provider, source.clock);
    let killed = false;
    await expect(target.engine({
      at(point) {
        if (!killed && point === 'during-remote-snapshot-download') {
          killed = true;
          throw new SimulatedProcessDeath(point);
        }
      },
    }).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);
    expect(provider.physicalHeads(target.vaultId)
      .some((value) => value.head.deviceId === 'device-source')).toBe(true);

    expect((await target.engine().sync()).status).toBe('published');
    expect(target.journal.current().entries.map((value) => value.content))
      .toEqual(['Remote authored']);
  });

  test('provider failures map to durable ADR V7-0004 outcomes', async () => {
    const cases = [
      ['authorization-required', 'attention', 'authorization-required'],
      ['quota-full', 'attention', 'provider-quota-full'],
      ['permission-denied', 'attention', 'provider-permission-denied'],
      ['rate-limited', 'retry', 'rate-limited'],
      ['transient', 'retry', 'transient'],
    ] as const;
    for (const [providerCode, status, reason] of cases) {
      const app = harness(`device-${providerCode}`);
      app.journal.mutate(withEntry(blankDomain(), entry('entry', `Synthetic ${providerCode}`)));
      app.provider.failNext('list-heads', new V2ProviderError(providerCode, providerCode));
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
      reason: V2AttentionReason;
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
        const encoded = encodeSnapshotV2({
          format: 'tackbok-snapshot', formatVersion: 2, vaultId: 'different-vault',
          parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: 'remote-wrong',
          deviceSequence: 1, createdAt: 1, ...blankDomain(),
        });
        return {
          suffix: 'wrong', reason: 'wrong-vault', snapshotId: encoded.snapshotId,
          bytes: encoded.compressedBytes,
        };
      })(),
      (() => {
        const payload = {
          format: 'tackbok-snapshot', formatVersion: 3,
          vaultId: 'vault-v7-phase2', parentSnapshotIds: [], observedDeviceHeads: [],
          authorDeviceId: 'remote-unsupported', deviceSequence: 1, createdAt: 1,
          ...blankDomain(),
        };
        const canonicalBytes = canonicalBytesV2(payload);
        return {
          suffix: 'unsupported', reason: 'unsupported-format',
          snapshotId: sha256BytesV2(canonicalBytes),
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
        format: 'tackbok-device-head', formatVersion: 2, vaultId: app.vaultId,
        deviceId: remoteDeviceId, deviceSequence: 1,
        snapshotId: value.snapshotId, updatedAt: 1,
      });
      expect(await app.engine().sync()).toMatchObject({
        status: 'attention', reason: value.reason,
      });
      expect(app.state.loadState(app.vaultId, app.deviceId).pauseReason)
        .toBe(value.reason);
    }
  });

  test('every durable Attention-needed reason has its ADR V7-0004 recovery action', () => {
    expect(Object.keys(V2_ATTENTION_RECOVERY_ACTION).sort()).toEqual([
      'account-mismatch', 'ambiguous-device-head', 'authorization-required',
      'backup-deleted', 'cleanup-inconsistent', 'consent-incomplete',
      'derived-id-collision', 'frontier-too-wide', 'head-snapshot-missing',
      'invalid-remote-snapshot', 'journal-deleted', 'local-media-unreadable',
      'local-storage-full', 'missing-media', 'normalized-model-not-ready',
      'provider-permission-denied', 'provider-quota-full', 'purge-incomplete',
      'unsupported-format', 'wrong-vault',
    ]);
    expect(V2_ATTENTION_RECOVERY_ACTION['ambiguous-device-head'])
      .toBe('inspect-repair-backup');
  });

  test('simultaneous device publications remain discoverable and later converge', async () => {
    const provider = new FakeSnapshotV2Provider();
    const clock = { value: 1_800_000_000_000 };
    const initial = withEntry(blankDomain(), entry('entry-shared', 'Base'));
    const first = harness('device-a', initial, provider, clock);
    first.journal.mutate(initial);
    await first.engine().sync();
    const second = harness('device-b', initial, provider, clock);
    await second.engine().sync();

    first.journal.mutate(withEntry(first.journal.current(), entry('entry-shared', 'Device A', 2)));
    second.journal.mutate(withEntry(second.journal.current(), entry('entry-shared', 'Device B', 2)));
    let waiting = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const hooks: V2SyncHooks = {
      async beforeHeadRecheck() {
        waiting += 1;
        if (waiting === 2) release();
        await barrier;
      },
    };
    await Promise.all([first.engine(hooks).sync(), second.engine(hooks).sync()]);
    expect(new Set(provider.physicalHeads(first.vaultId)
      .map((value) => value.head.deviceId))).toEqual(new Set(['device-a', 'device-b']));

    await first.engine().sync();
    await second.engine().sync();
    expect(canonicalizeV2(first.journal.current()))
      .toBe(canonicalizeV2(second.journal.current()));
    expect(new Set(first.journal.current().entries.map((value) => value.content)))
      .toEqual(new Set(['Device A', 'Device B']));
  });

  test('three simultaneous disjoint writers converge without dropping a branch', async () => {
    const provider = new FakeSnapshotV2Provider();
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
      device.journal.mutate(withEntry(
        device.journal.current(),
        entry(`entry-${index}`, `Device ${index}`),
      ));
    });
    let waiting = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const hooks: V2SyncHooks = {
      async beforeHeadRecheck() {
        waiting += 1;
        if (waiting === devices.length) release();
        await barrier;
      },
    };
    await Promise.all(devices.map((device) => device.engine(hooks).sync()));
    expect(new Set(provider.physicalHeads(devices[0].vaultId)
      .map((value) => value.head.deviceId))).toEqual(
        new Set(['device-a', 'device-b', 'device-c']),
      );

    for (let round = 0; round < 3; round += 1) {
      for (const device of devices) await device.engine().sync();
    }
    const canonical = devices.map((device) => canonicalizeV2(device.journal.current()));
    expect(new Set(canonical).size).toBe(1);
    expect(new Set(devices[0].journal.current().entries.map((value) => value.content)))
      .toEqual(new Set(['Device 0', 'Device 1', 'Device 2']));
  });

  test('equal-sequence different valid heads pause durably as ambiguous', async () => {
    const app = harness('device-reader');
    for (const [suffix, content] of [['a', 'Branch A'], ['b', 'Branch B']] as const) {
      const encoded = encodeSnapshotV2({
        format: 'tackbok-snapshot', formatVersion: 2, vaultId: app.vaultId,
        parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: 'device-ambiguous',
        deviceSequence: 7, createdAt: 7,
        ...withEntry(blankDomain(), entry(`entry-${suffix}`, content)),
      });
      app.provider.injectSnapshot(app.vaultId, encoded.snapshotId, encoded.compressedBytes, 7);
      app.provider.injectPhysicalHead({
        format: 'tackbok-device-head', formatVersion: 2, vaultId: app.vaultId,
        deviceId: 'device-ambiguous', deviceSequence: 7,
        snapshotId: encoded.snapshotId, updatedAt: 7,
      });
    }
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention', reason: 'ambiguous-device-head',
    });
    expect(app.state.loadState(app.vaultId, app.deviceId).pauseReason)
      .toBe('ambiguous-device-head');
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention', reason: 'ambiguous-device-head',
    });
  });

  test('nine independent frontier heads pause instead of truncating parents', async () => {
    const app = harness('device-wide-frontier');
    for (let index = 0; index < 9; index += 1) {
      const deviceId = `frontier-device-${index}`;
      const encoded = encodeSnapshotV2({
        format: 'tackbok-snapshot', formatVersion: 2, vaultId: app.vaultId,
        parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: deviceId,
        deviceSequence: 1, createdAt: 1,
        ...withEntry(blankDomain(), entry(`entry-${index}`, `Branch ${index}`)),
      });
      app.provider.injectSnapshot(app.vaultId, encoded.snapshotId, encoded.compressedBytes, 1);
      app.provider.injectPhysicalHead({
        format: 'tackbok-device-head', formatVersion: 2, vaultId: app.vaultId,
        deviceId, deviceSequence: 1, snapshotId: encoded.snapshotId, updatedAt: 1,
      });
    }
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention', reason: 'frontier-too-wide',
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
      status: 'attention', reason: 'local-storage-full',
    });
    expect(app.state.loadPending(app.vaultId, app.deviceId)?.stage).toBe('domain-applied');
    expect(app.provider.physicalHeads(app.vaultId)).toHaveLength(1);

    app.files.writeTempAndFsync = originalWrite;
    app.state.clearPause(app.vaultId, app.deviceId, 'local-storage-full');
    expect(await app.engine().sync()).toMatchObject({ status: 'published', actionableChanges: 0 });
    expect(app.state.loadPending(app.vaultId, app.deviceId)).toBeNull();
  });

  test('required missing media pauses without publishing a dangling snapshot', async () => {
    const domain = withEntry(blankDomain(), entry('entry-media-missing', 'Missing attachment'));
    domain.media = [{
      assetId: 'asset-missing', ownerType: 'entry', ownerId: 'entry-media-missing',
      kind: 'photo', blobHash: 'a'.repeat(64), mimeType: 'image/jpeg', byteSize: 10,
      width: null, height: null, durationMs: null, createdAt: 1, updatedAt: 1,
    }];
    const app = harness('device-missing-local', domain);
    app.state.markDirty(app.vaultId, app.deviceId);
    expect(await app.engine().sync()).toMatchObject({
      status: 'attention', reason: 'local-media-unreadable',
    });
    expect(app.provider.snapshotIds(app.vaultId)).toEqual([]);
  });

  test('remote text restores and publishes when Wi-Fi-only policy defers its verified blob', async () => {
    const provider = new FakeSnapshotV2Provider();
    const bytes = new TextEncoder().encode('synthetic-remote-photo');
    const blobHash = sha256BytesV2(bytes);
    const sourceDomain = withEntry(blankDomain(), entry('entry-remote-media', 'Restored text'));
    sourceDomain.media = [{
      assetId: 'asset-remote-media', ownerType: 'entry', ownerId: 'entry-remote-media',
      kind: 'photo', blobHash, mimeType: 'image/jpeg', byteSize: bytes.byteLength,
      width: null, height: null, durationMs: null, createdAt: 1, updatedAt: 1,
    }];
    const source = harness('device-media-source', sourceDomain, provider);
    await source.media.writeVerified(blobHash, bytes);
    source.state.markDirty(source.vaultId, source.deviceId);
    expect(await source.engine().sync()).toMatchObject({ status: 'published' });

    const restoring = harness(
      'device-media-restore', blankDomain(), provider, source.clock, source.vaultId,
    );
    provider.failNext(
      'download-media',
      new V2ProviderError('wifi-only-media', 'waiting-for-wifi'),
    );
    expect(await restoring.engine().sync()).toMatchObject({
      status: 'published', actionableChanges: 0,
    });
    expect(restoring.journal.current().entries).toContainEqual(
      expect.objectContaining({ entryId: 'entry-remote-media', content: 'Restored text' }),
    );
    expect(await restoring.media.hasVerified(blobHash)).toBe(false);
    expect(restoring.provider.requests).toContain('download-media');
  });

  test('an actually absent remote blob still restores text before durable Attention', async () => {
    const app = harness('device-remote-missing');
    const domain = withEntry(blankDomain(), entry('entry-remote-missing', 'Readable text'));
    domain.media = [{
      assetId: 'asset-remote-missing', ownerType: 'entry', ownerId: 'entry-remote-missing',
      kind: 'photo', blobHash: 'b'.repeat(64), mimeType: 'image/jpeg', byteSize: 10,
      width: null, height: null, durationMs: null, createdAt: 1, updatedAt: 1,
    }];
    const encoded = encodeSnapshotV2({
      format: 'tackbok-snapshot', formatVersion: 2, vaultId: app.vaultId,
      parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: 'remote-missing',
      deviceSequence: 1, createdAt: 1, ...domain,
    });
    app.provider.injectSnapshot(app.vaultId, encoded.snapshotId, encoded.compressedBytes, 1);
    app.provider.injectPhysicalHead({
      format: 'tackbok-device-head', formatVersion: 2, vaultId: app.vaultId,
      deviceId: 'remote-missing', deviceSequence: 1, snapshotId: encoded.snapshotId,
      updatedAt: 1,
    });

    expect(await app.engine().sync()).toMatchObject({ status: 'attention', reason: 'missing-media' });
    expect(app.journal.current().entries).toContainEqual(
      expect.objectContaining({ entryId: 'entry-remote-missing', content: 'Readable text' }),
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
    const provider = new FakeSnapshotV2Provider();
    const clock = { value: 1_800_000_000_000 };
    const initial = withEntry(blankDomain(), entry('entry-shared', 'Base'));
    const first = harness('device-a', initial, provider, clock);
    first.journal.mutate(initial);
    await first.engine().sync();
    const second = harness('device-b', initial, provider, clock);
    await second.engine().sync();

    first.journal.mutate(withEntry(first.journal.current(), entry('entry-shared', 'Local authored', 2)));
    second.journal.mutate(withEntry(second.journal.current(), entry('entry-shared', 'Remote authored', 2)));
    await second.engine().sync();
    const checkpoint = first.state.loadBaseCheckpoint(first.vaultId, first.deviceId)!;
    first.files.files.set(checkpoint.fileName, new Uint8Array([1, 2, 3]));

    const result = await first.engine().sync();
    expect(result.status).toBe('published');
    expect(first.files.quarantined).toHaveLength(1);
    expect(new Set(first.journal.current().entries.map((value) => value.content)))
      .toEqual(new Set(['Local authored', 'Remote authored']));
  });

  test('an unupgradeable future base-shadow version degrades instead of blocking sync', async () => {
    const app = harness('device-future-shadow');
    const encoded = encodeSnapshotV2({
      format: 'tackbok-snapshot', formatVersion: 2, vaultId: app.vaultId,
      parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: app.deviceId,
      deviceSequence: 1, createdAt: 1, ...blankDomain(),
    });
    const futureShadow = {
      format: 'tackbok-base-shadow', shadowFormatVersion: 2,
      protocolFormatVersion: 2, vaultId: app.vaultId,
      snapshotId: encoded.snapshotId, acceptedDeviceHeads: [], payload: encoded.payload,
    };
    const canonicalBytes = canonicalBytesV2(futureShadow);
    const compressedBytes = encodeGzip(canonicalBytes, { level: 6 });
    const fileName = 'base-future.v2.json.gz';
    app.files.files.set(fileName, compressedBytes);

    const loaded = await app.shadows.load({
      vaultId: app.vaultId, deviceId: app.deviceId, shadowFormatVersion: 1,
      snapshotId: encoded.snapshotId, fileName,
      canonicalSha256: sha256BytesV2(canonicalBytes), byteCount: compressedBytes.length,
      committedGeneration: 0,
    });
    expect(loaded).toEqual({ shadow: null, degraded: true });
    expect(app.files.quarantined).toHaveLength(1);
  });

  test('cleanup retains three verified snapshots and resumes after a process death', async () => {
    const app = harness('device-retention');
    for (let index = 0; index < 5; index += 1) {
      app.clock.value += 1;
      app.journal.mutate(withEntry(app.journal.current(), entry(`entry-${index}`, `Value ${index}`)));
      await app.engine().sync();
    }
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(5);
    app.clock.value += 31 * 24 * 60 * 60 * 1000;
    app.journal.mutate(withEntry(app.journal.current(), entry('entry-new', 'Newest')));
    let killed = false;
    await expect(app.engine({
      at(point) {
        if (!killed && point === 'during-snapshot-cleanup') {
          killed = true;
          throw new SimulatedProcessDeath(point);
        }
      },
    }).sync()).rejects.toBeInstanceOf(SimulatedProcessDeath);
    const currentHead = app.provider.physicalHeads(app.vaultId)[0].head.snapshotId;
    expect(app.provider.snapshotIds(app.vaultId)).toContain(currentHead);

    expect((await app.engine().sync()).status).toBe('up-to-date');
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(3);
    expect(app.provider.snapshotIds(app.vaultId)).toContain(currentHead);
    expect(app.provider.requests).not.toContain('delete-media' as never);
  });

  test('the alpha v1 transition marks one local v2 publication without copying v1 state', async () => {
    const app = harness('device-transition', withEntry(blankDomain(), entry('entry-local', 'Local alpha data')));
    expect(app.state.transitionFromV1LocalOnly(app.vaultId, app.deviceId)).toBe(1);
    expect(app.state.transitionFromV1LocalOnly(app.vaultId, app.deviceId)).toBe(1);
    await app.engine().sync();
    expect(app.provider.snapshotIds(app.vaultId)).toHaveLength(1);
    expect(app.state.loadState(app.vaultId, app.deviceId)).toMatchObject({
      journalGeneration: 1,
      settledGeneration: 1,
    });
  });
});
