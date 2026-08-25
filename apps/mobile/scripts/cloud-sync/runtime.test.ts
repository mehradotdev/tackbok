import { afterEach, describe, expect, test } from 'bun:test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  SyncRuntime,
  type RuntimePlatform,
  type RuntimeSubscription,
} from '../../src/lib/cloudSync/runtime/SyncRuntime';
import {
  SQLiteSyncStateStore,
  type SyncDatabase,
} from '../../src/lib/cloudSync/snapshot/sync/sqliteState';
import {
  ATTENTION_RECOVERY_ACTION,
  type SyncAttentionReason,
} from '../../src/lib/cloudSync/snapshot/sync/types';

const mobileRoot = resolve(import.meta.dir, '../..');
const repositoryRoot = resolve(mobileRoot, '../..');
const databases: Database[] = [];

class BunSyncDatabase implements SyncDatabase {
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

function migratedDatabase(): BunSyncDatabase {
  const sqlite = new Database(':memory:', { strict: true });
  const journal = JSON.parse(readFileSync(
    join(mobileRoot, 'src/drizzle/meta/_journal.json'),
    'utf8',
  )) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const migration = readFileSync(
      join(mobileRoot, 'src/drizzle', `${tag}.sql`),
      'utf8',
    ).replaceAll('--> statement-breakpoint', '');
    sqlite.exec(migration);
  }
  databases.push(sqlite);
  return new BunSyncDatabase(sqlite);
}

class FakePlatform implements RuntimePlatform {
  online = true;
  private networkListener: ((online: boolean) => void) | null = null;
  private timerCallback: (() => void) | null = null;
  addAppStateListener(): RuntimeSubscription { return { remove() {} }; }
  addNetworkListener(listener: (online: boolean) => void): RuntimeSubscription {
    this.networkListener = listener;
    return {
      remove: () => {
        if (this.networkListener === listener) this.networkListener = null;
      },
    };
  }
  async getNetworkOnline() { return this.online; }
  setTimer(callback: () => void): ReturnType<typeof setTimeout> {
    this.timerCallback = callback;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }
  clearTimer() { this.timerCallback = null; }
  emitNetwork(online: boolean) { this.networkListener?.(online); }
  fireTimer() {
    const callback = this.timerCallback;
    this.timerCallback = null;
    callback?.();
  }
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('production cloud-sync runtime', () => {
  test('the consolidated migration installs the snapshot domain', () => {
    const database = migratedDatabase();
    const tables = database.getAllSync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    ).map(({ name }) => name);
    expect(tables).toContain('cloud_tombstones');
    expect(tables).toContain('cloud_conflicts');
    const entryColumns = database.getAllSync<{ name: string }>('PRAGMA table_info(entries)')
      .map(({ name }) => name);
    expect(entryColumns).toContain('conflict_origin_id');
  });

  test('an offline edit remains durably queued across state reconstruction', () => {
    const database = migratedDatabase();
    let state = new SQLiteSyncStateStore(database, () => 10);
    state.loadState('vault-offline', 'device-offline');
    state.markDirty('vault-offline', 'device-offline');

    state = new SQLiteSyncStateStore(database, () => 20);
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

  test('an online transport change retries queued Wi-Fi-only work', async () => {
    const platform = new FakePlatform();
    let passes = 0;
    let resolveSecondPass!: () => void;
    const secondPass = new Promise<void>((resolve) => { resolveSecondPass = resolve; });
    const runtime = new SyncRuntime({
      platform,
      debounceMs: 0,
      readiness: { isReady: async () => true, retryBackfill: async () => undefined },
      createEngine: async () => ({
        provider: { kind: 'google-drive' as const },
        sync: async () => {
          passes += 1;
          if (passes === 2) resolveSecondPass();
          return { pulled: 0, pushed: 0 };
        },
      }),
    });
    await runtime.start();
    expect(passes).toBe(1);

    // Both cellular and Wi-Fi are coarsely "online". The network event still
    // represents a transport change and must schedule another pass.
    platform.emitNetwork(true);
    platform.fireTimer();
    await secondPass;
    expect(passes).toBe(2);
    runtime.stop();
  });

  test('every durable Attention reason has localized visible copy and an action route', async () => {
    const screen = await Bun.file(join(mobileRoot, 'src/screens/cloudBackup/index.tsx')).text();
    const productionUi = await Bun.file(join(
      mobileRoot,
      'src/lib/cloudSync/ui/production.ts',
    )).text();
    const localePaths = [
      'en.ts', 'de.ts', 'ar.ts', 'he.ts', 'zh-CN.ts', 'zh-TW.ts',
    ].map((file) => join(mobileRoot, 'src/lib/i18n/translations', file));
    const locales = await Promise.all(localePaths.map((path) => Bun.file(path).text()));
    const reasons = Object.keys(ATTENTION_RECOVERY_ACTION) as SyncAttentionReason[];
    expect(reasons).toHaveLength(20);
    for (const reason of reasons) {
      expect(screen).toContain(`'${reason}'`);
      expect(screen).toContain(`'${ATTENTION_RECOVERY_ACTION[reason]}'`);
    }
    for (const locale of locales) {
      expect(locale).toContain("'Attention needed'");
      expect(locale).toContain("'Cloud backup retry completed'");
      expect(locale).toContain("'Reconnect Google Drive'");
      expect(locale).toContain("'Verify backup health'");
      expect(locale).toContain(
        "'Photos and voice memos are waiting for Wi-Fi. Your changes remain safely queued.'",
      );
      expect(locale).toContain(
        "'Text-only changes sync on mobile data. Changes with new photos or voice memos wait for Wi-Fi.'",
      );
    }
    expect(screen).toContain('accessibilityRole="alert"');
    expect(screen).toContain('accessibilityLiveRegion="polite"');
    const attachmentRetry = screen.slice(
      screen.indexOf("if (action === 'locate-retry-attachment')"),
      screen.indexOf('await runAction(', screen.indexOf("if (action === 'locate-retry-attachment')")) +
        180,
    );
    expect(attachmentRetry).toContain('retrySyncAttentionReason(reason)');
    expect(attachmentRetry).not.toContain("router.push('/settings')");
    const retryHelper = productionUi.slice(
      productionUi.indexOf('export async function retrySyncAttentionReason'),
      productionUi.indexOf('\n}', productionUi.indexOf(
        'export async function retrySyncAttentionReason',
      )) + 2,
    );
    expect(retryHelper).toContain("set({ status: 'dirty'");
    expect(retryHelper).not.toContain("vault.status !== 'paused'");
  });

  test('production wiring has one snapshot path and requests no notifications', async () => {
    const paths = [
      'src/lib/cloudSync/runtime/production.ts',
      'src/lib/cloudSync/snapshot/runtime/productionEngine.ts',
      'src/lib/cloudSync/snapshot/storage/productionJournal.ts',
      'src/lib/cloudSync/ui/production.ts',
      'src/screens/cloudBackup/index.tsx',
    ];
    const source = (await Promise.all(paths.map((path) =>
      Bun.file(join(mobileRoot, path)).text()))).join('\n');
    expect(source).toContain('createProductionSnapshotRuntimeEngine');
    expect(source).toContain('journal_generation: shouldPublishLocal');
    expect(source).not.toContain('expo-notifications');
    expect(source).not.toMatch(/request.*Notification.*Permission/i);
    expect(source).toContain("new SnapshotProviderError('wifi-only-media'");
    expect(source).toContain("case 'wifi-only-media':");
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
