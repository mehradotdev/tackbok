import { afterEach, describe, expect, test } from 'bun:test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SQLiteDriveV2ProviderStateStore } from '../../src/lib/cloudSync/v2/drive/state';
import type { V2SyncDatabase } from '../../src/lib/cloudSync/v2/sync/sqliteState';

const databases: Database[] = [];
const DRIVE_STATE_MIGRATIONS = [
  '0008_gorgeous_thor.sql',
  '0009_nebulous_bulldozer.sql',
  '0011_even_gargoyle.sql',
]
  .map((name) => readFileSync(join(import.meta.dir, `../../src/drizzle/${name}`), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

class BunDatabase implements V2SyncDatabase {
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

function database(): BunDatabase {
  const sqlite = new Database(':memory:', { strict: true });
  sqlite.exec(DRIVE_STATE_MIGRATIONS);
  databases.push(sqlite);
  return new BunDatabase(sqlite);
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('V7-3 durable Drive adapter state', () => {
  test('cursor, inventory, retry window, metadata and resumable session survive reconstruction', () => {
    const db = database();
    const first = new SQLiteDriveV2ProviderStateStore(db, 'connection-a', () => 100);
    first.replaceInitialInventory('vault-a', [{
      fileId: 'physical-head-a',
      logicalKey: 'heads/device-a.json',
      kind: 'head',
      contentSha256: 'a'.repeat(64),
      byteCount: 200,
      createdAt: 90,
      head: {
        format: 'tackbok-device-head', formatVersion: 2, vaultId: 'vault-a',
        deviceId: 'device-a', deviceSequence: 3, snapshotId: 'b'.repeat(64), updatedAt: 90,
      },
    }], 'cursor-1');
    first.setRetryNotBefore('vault-a', 500);
    first.setUploadSession('vault-a', {
      logicalKey: 'snapshots/c.json.gz', contentSha256: 'c'.repeat(64),
      uri: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=local-test',
      expiresAt: 1_000, byteCount: 6_000_000, uploadedBytes: 1_048_576,
    });

    const afterRestart = new SQLiteDriveV2ProviderStateStore(db, 'connection-a', () => 200);
    expect(afterRestart.loadDiscovery('vault-a')).toEqual({
      cursor: 'cursor-1', inventoryComplete: true, retryNotBefore: 500,
    });
    expect(afterRestart.listKind('vault-a', 'head')).toHaveLength(1);
    expect(afterRestart.getUploadSession(
      'vault-a', 'snapshots/c.json.gz', 'c'.repeat(64),
    )).toMatchObject({
      byteCount: 6_000_000,
      uploadedBytes: 1_048_576,
      expiresAt: 1_000,
    });
  });

  test('opaque connection and vault scopes prevent cached Drive state crossing accounts', () => {
    const db = database();
    const firstConnection = new SQLiteDriveV2ProviderStateStore(db, 'connection-a');
    firstConnection.replaceInitialInventory('vault-a', [{
      fileId: 'physical-snapshot-a', logicalKey: `snapshots/${'a'.repeat(64)}.json.gz`,
      kind: 'snapshot', contentSha256: 'b'.repeat(64), byteCount: 100,
      createdAt: 1, head: null,
    }], 'cursor-a');

    const otherVault = new SQLiteDriveV2ProviderStateStore(db, 'connection-a');
    const otherConnection = new SQLiteDriveV2ProviderStateStore(db, 'connection-b');
    expect(otherVault.listKind('vault-b', 'snapshot')).toEqual([]);
    expect(otherVault.loadDiscovery('vault-b').inventoryComplete).toBe(false);
    expect(otherConnection.listKind('vault-a', 'snapshot')).toEqual([]);
    expect(otherConnection.loadDiscovery('vault-a').inventoryComplete).toBe(false);
  });

  test('change-page application removes and replaces inventory atomically', () => {
    const db = database();
    const state = new SQLiteDriveV2ProviderStateStore(db, 'connection-a');
    state.replaceInitialInventory('vault-a', [{
      fileId: 'old', logicalKey: 'heads/device-a.json', kind: 'head',
      contentSha256: 'a'.repeat(64), byteCount: 1, createdAt: 1, head: null,
    }], 'cursor-1');
    state.applyChangePage('vault-a', [{
      fileId: 'new', logicalKey: `snapshots/${'b'.repeat(64)}.json.gz`, kind: 'snapshot',
      contentSha256: 'c'.repeat(64), byteCount: 2, createdAt: 2, head: null,
    }], ['old'], 'cursor-2');

    expect(state.listKind('vault-a', 'head')).toEqual([]);
    expect(state.listKind('vault-a', 'snapshot')).toHaveLength(1);
    expect(state.loadDiscovery('vault-a').cursor).toBe('cursor-2');
  });
});
