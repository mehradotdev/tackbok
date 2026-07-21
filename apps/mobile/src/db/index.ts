import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// ============================================================================
// Database Instance
// ============================================================================

const DATABASE_NAME = 'tackbok.db';
// Database file used by expo-sqlite/kv-store, which backs zustand persist.
const KV_STORE_DATABASE_NAME = 'ExpoSQLiteStorage';

const expo = SQLite.openDatabaseSync(DATABASE_NAME);

// busy_timeout makes SQLite retry for a bit instead of failing immediately
// with "Error code 5: database is locked", and WAL lets readers and a writer
// coexist across connections. Both matter in dev on iOS: a JS reload can
// briefly leave the torn-down runtime's native connection alive (sometimes
// mid-transaction) alongside the new one, which made startup reads/writes
// throw uncaught "database is locked" errors.
expo.execSync('PRAGMA busy_timeout = 2000');
expo.execSync('PRAGMA journal_mode = WAL');

// Same hardening for the kv-store database. Opening with default options
// returns the same pooled native connection kv-store itself uses, so the
// per-connection busy_timeout applies to its reads/writes too (journal_mode
// is persisted in the file either way). Best effort: a failed attempt is
// retried on next launch.
void SQLite.openDatabaseAsync(KV_STORE_DATABASE_NAME)
  .then((kvDb) =>
    kvDb.execAsync('PRAGMA busy_timeout = 2000; PRAGMA journal_mode = WAL;'),
  )
  .catch((error) => {
    console.warn('Failed to configure kv-store database:', error);
  });

export const db = drizzle(expo, { schema });

// Re-export schema for convenience
export * from './schema';
