import { afterEach, describe, expect, test } from 'bun:test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  SyncRuntime,
  type RuntimePlatform,
  type RuntimeSubscription,
} from '../../src/lib/cloudSync/runtime/SyncRuntime';
import {
  SQLiteV2SyncStateStore,
  type V2SyncDatabase,
} from '../../src/lib/cloudSync/v2/sync/sqliteState';
import {
  V2_ATTENTION_RECOVERY_ACTION,
  type V2AttentionReason,
} from '../../src/lib/cloudSync/v2/sync/types';

const mobileRoot = resolve(import.meta.dir, '../..');
const repositoryRoot = resolve(mobileRoot, '../..');
const databases: Database[] = [];

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

function migratedDatabase(): BunV2Database {
  const sqlite = new Database(':memory:', { strict: true });
  for (let index = 0; index <= 10; index += 1) {
    const prefix = String(index).padStart(4, '0');
    const migration = readFileSync(
      join(mobileRoot, 'src/drizzle', readFileSync(join(
        mobileRoot,
        'src/drizzle/meta/_journal.json',
      ), 'utf8').match(new RegExp(`"tag": "(${prefix}_[^"]+)"`))![1] + '.sql'),
      'utf8',
    ).replaceAll('--> statement-breakpoint', '');
    sqlite.exec(migration);
  }
  databases.push(sqlite);
  return new BunV2Database(sqlite);
}

class FakePlatform implements RuntimePlatform {
  online = true;
  addAppStateListener(): RuntimeSubscription { return { remove() {} }; }
  addNetworkListener(): RuntimeSubscription { return { remove() {} }; }
  async getNetworkOnline() { return this.online; }
  setTimer(): ReturnType<typeof setTimeout> {
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }
  clearTimer() {}
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('Phase V7-4 production runtime gate', () => {
  test('migration 0010 installs the production-domain v2 closure', () => {
    const database = migratedDatabase();
    const tables = database.getAllSync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    ).map(({ name }) => name);
    expect(tables).toContain('cloud_v2_tombstones');
    expect(tables).toContain('cloud_v2_conflicts');
    const entryColumns = database.getAllSync<{ name: string }>('PRAGMA table_info(entries)')
      .map(({ name }) => name);
    expect(entryColumns).toContain('conflict_origin_id');
  });

  test('an offline edit remains durably queued across state reconstruction', () => {
    const database = migratedDatabase();
    let state = new SQLiteV2SyncStateStore(database, () => 10);
    state.loadState('vault-offline', 'device-offline');
    state.markDirty('vault-offline', 'device-offline');

    state = new SQLiteV2SyncStateStore(database, () => 20);
    expect(state.loadState('vault-offline', 'device-offline')).toMatchObject({
      journalGeneration: 1,
      settledGeneration: 0,
      pauseReason: null,
    });
  });

  test('foreground sync drains until stable while background remains one bounded pass', async () => {
    const platform = new FakePlatform();
    let actionable = 4;
    let passes = 0;
    const runtime = new SyncRuntime({
      platform,
      readiness: { isReady: async () => true, retryBackfill: async () => undefined },
      createEngine: async () => ({
        provider: { kind: 'google-drive' as const },
        hasPendingWork: () => actionable > 0,
        sync: async () => {
          passes += 1;
          actionable = Math.max(0, actionable - 1);
          return { pulled: 0, pushed: 1 };
        },
      }),
    });
    await runtime.start();
    expect({ passes, actionable }).toEqual({ passes: 4, actionable: 0 });

    actionable = 3;
    const before = passes;
    await runtime.runBoundedBackgroundPass('periodic');
    expect({ passes: passes - before, actionable }).toEqual({ passes: 1, actionable: 2 });
    runtime.stop();
  });

  test('every durable Attention reason has localized visible copy and an action route', async () => {
    const screen = await Bun.file(join(mobileRoot, 'src/screens/cloudBackup/index.tsx')).text();
    const localePaths = [
      'en.ts', 'de.ts', 'ar.ts', 'he.ts', 'zh-CN.ts', 'zh-TW.ts',
    ].map((file) => join(mobileRoot, 'src/lib/i18n/translations', file));
    const locales = await Promise.all(localePaths.map((path) => Bun.file(path).text()));
    const reasons = Object.keys(V2_ATTENTION_RECOVERY_ACTION) as V2AttentionReason[];
    expect(reasons).toHaveLength(20);
    for (const reason of reasons) {
      expect(screen).toContain(`'${reason}'`);
      expect(screen).toContain(`'${V2_ATTENTION_RECOVERY_ACTION[reason]}'`);
    }
    for (const locale of locales) {
      expect(locale).toContain("'Attention needed'");
      expect(locale).toContain("'Cloud backup retry completed'");
      expect(locale).toContain("'Reconnect Google Drive'");
      expect(locale).toContain("'Verify backup health'");
    }
    expect(screen).toContain('accessibilityRole="alert"');
    expect(screen).toContain('accessibilityLiveRegion="polite"');
  });

  test('production wiring is v2-selective, keeps v6 present, and requests no notifications', async () => {
    const paths = [
      'src/lib/cloudSync/runtime/production.ts',
      'src/lib/cloudSync/v2/runtime/productionEngine.ts',
      'src/lib/cloudSync/v2/storage/productionJournal.ts',
      'src/lib/cloudSync/ui/production.ts',
      'src/screens/cloudBackup/index.tsx',
    ];
    const source = (await Promise.all(paths.map((path) =>
      Bun.file(join(mobileRoot, path)).text()))).join('\n');
    expect(source).toContain('createProductionV2RuntimeEngine');
    expect(source).toContain('protocol_version === 2');
    expect(source).toContain('protocol_version: 2');
    expect(source).toContain('journal_generation: shouldPublishLocal');
    expect(source).not.toContain('expo-notifications');
    expect(source).not.toMatch(/request.*Notification.*Permission/i);
    expect(existsSync(join(mobileRoot, 'src/lib/cloudSync/protocol'))).toBe(true);
    expect(existsSync(join(mobileRoot, 'src/lib/cloudSync/phase0'))).toBe(true);
    expect(existsSync(join(mobileRoot, 'src/lib/cloudSync/phase3'))).toBe(true);
  });

  test('the public policy describes complete snapshots and separate media plainly', async () => {
    const policy = await Bun.file(join(
      repositoryRoot,
      'apps/website/src/pages/privacy.astro',
    )).text();
    expect(policy).toContain('complete compressed snapshot');
    expect(policy).toContain('Photos and voice memos are stored separately');
    expect(policy).toContain('not real-time collaborative editing');
    expect(policy).not.toMatch(/cloud_sync_/);
  });
});
