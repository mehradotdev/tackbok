/**
 * Real SQLite databases, one per simulated device, behind the app's `~/db`
 * module. `installSqliteDevices` must run before anything imports `~/db`
 * (Bun's module mocks are process-wide, so call it at the top of a test file
 * and import app modules dynamically after it).
 *
 * Every database runs every migration, as on a phone. `use(n)` picks the
 * database that `db` and `runExclusiveDbTransaction` reach; a transaction
 * keeps the database it started on.
 */
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { mock } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as schema from '../../../src/db/schema';
import type { SyncDatabase } from '../../../src/lib/cloudSync/snapshot/sync/sqliteState';

const ROOT = join(import.meta.dir, '../../..');

export type SimDb = ReturnType<typeof drizzle<typeof schema>>;

export interface SqliteDevice {
  sqlite: Database;
  db: SimDb;
}

function migrated(): Database {
  const sqlite = new Database(':memory:');
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(ROOT, 'src/drizzle/meta/_journal.json'), 'utf8'),
  );
  for (const { tag } of journal.entries)
    for (const statement of readFileSync(
      join(ROOT, `src/drizzle/${tag}.sql`),
      'utf8',
    ).split('--> statement-breakpoint'))
      sqlite.exec(statement);
  // As in the app, which never turns foreign keys on (see repositories.ts);
  // some migrations end with them on.
  sqlite.exec('PRAGMA foreign_keys = OFF');
  return sqlite;
}

export function installSqliteDevices() {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  let current: SqliteDevice | null = null;
  const active = () => {
    if (!current) throw new Error('No simulated device database selected');
    return current;
  };
  const db = new Proxy({} as SimDb, {
    get(_target, property) {
      const target = active().db as unknown as Record<PropertyKey, unknown>;
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  mock.module('../../../src/db', () => ({
    ...schema,
    db,
    sqlite: null,
    runExclusiveDbTransaction: async (operation: (tx: SimDb) => Promise<unknown>) => {
      const device = active();
      device.sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await operation(device.db);
        device.sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        device.sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  }));
  mock.module('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
  mock.module('react-native', () => ({ Platform: { OS: 'ios' } }));
  mock.module('../../../src/lib/cloudSync/runtime/mutationSignal', () => ({
    notifyCloudSyncMutationCommitted() {},
  }));
  mock.module('../../../src/lib/cloudSync/storage/retainedMedia', () => ({
    async reapRetainedMediaWithoutVault() {},
  }));

  return {
    create(): SqliteDevice {
      const sqlite = migrated();
      return { sqlite, db: drizzle(sqlite, { schema }) };
    },
    use(device: SqliteDevice) {
      current = device;
    },
    /** Runs `operation` on `device` with `Date.now()` reading `wall`. */
    async on<T>(
      device: SqliteDevice,
      wall: number,
      operation: () => Promise<T>,
    ): Promise<T> {
      const previous = current;
      const realNow = Date.now;
      current = device;
      Date.now = () => wall;
      try {
        return await operation();
      } finally {
        Date.now = realNow;
        current = previous;
      }
    },
  };
}

/** The synchronous database API the sync state store uses, over a device's database. */
export class BunSyncDatabase implements SyncDatabase {
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
