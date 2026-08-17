import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { Platform } from 'react-native';
import * as schema from './schema';

// ============================================================================
// Database Instance
// ============================================================================

const DATABASE_NAME = 'tackbok.db';
// Database file used by expo-sqlite/kv-store, which backs zustand persist.
const KV_STORE_DATABASE_NAME = 'ExpoSQLiteStorage';

export const sqlite = SQLite.openDatabaseSync(DATABASE_NAME);

// busy_timeout makes SQLite retry for a bit instead of failing immediately
// with "Error code 5: database is locked", and WAL lets readers and a writer
// coexist across connections. Both matter in dev on iOS: a JS reload can
// briefly leave the torn-down runtime's native connection alive (sometimes
// mid-transaction) alongside the new one, which made startup reads/writes
// throw uncaught "database is locked" errors.
sqlite.execSync('PRAGMA busy_timeout = 2000');
sqlite.execSync('PRAGMA journal_mode = WAL');

// On Apple platforms, SQLite's fullfsync pragmas make FULL synchronous commits
// and WAL checkpoints use F_FULLFSYNC instead of ordinary fsync. This covers
// the durable publisher/checkpoint half of ADR V7-0005; AtomicFileModule covers
// the app-private base-shadow file before its SQLite checkpoint is committed.
// Do not apply these Apple-specific pragmas to Android, whose fsync primitive
// and storage stack have different semantics.
if (Platform.OS === 'ios') {
  sqlite.execSync([
    'PRAGMA synchronous = FULL',
    'PRAGMA fullfsync = ON',
    'PRAGMA checkpoint_fullfsync = ON',
  ].join('; '));
}

// Same hardening for the kv-store database. Opening with default options
// returns the same pooled native connection kv-store itself uses, so the
// per-connection busy_timeout applies to its reads/writes too (journal_mode
// is persisted in the file either way). Best effort: a failed attempt is
// retried on next launch.
//
// The promise must stay reachable for the app's lifetime: on Android,
// garbage-collecting a JS database handle closes the underlying native
// connection (NativeDatabase.sharedObjectDidRelease) even though kv-store
// still uses it, after which every settings write dies with an NPE from
// prepareAsync. A settled promise strongly references its value, so holding
// the promise keeps the handle alive.
const kvStoreDbHandle = SQLite.openDatabaseAsync(KV_STORE_DATABASE_NAME);
void kvStoreDbHandle
  .then((kvDb) =>
    kvDb.execAsync('PRAGMA busy_timeout = 2000; PRAGMA journal_mode = WAL;'),
  )
  .catch((error) => {
    console.warn('Failed to configure kv-store database:', error);
  });

export const db = drizzle(sqlite, { schema });

// Re-export schema for convenience
export * from './schema';
