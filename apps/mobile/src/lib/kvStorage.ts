import { openDatabaseAsync } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';

// Expo caches this native connection, so this handle and kv-store's handle share
// it. Android closes it when either JS handle is collected. Keep the promise
// reachable through every storage operation, not just a module-local startup task.
let database: ReturnType<typeof openDatabaseAsync> | undefined;

function getDatabase() {
  database ??= openDatabaseAsync('ExpoSQLiteStorage').then(async (db) => {
    await db.execAsync('PRAGMA busy_timeout = 2000; PRAGMA journal_mode = WAL;');
    return db;
  });
  return database;
}

export const kvStorage = {
  async getItem(name: string) {
    await getDatabase();
    return Storage.getItem(name);
  },
  async setItem(name: string, value: string) {
    await getDatabase();
    await Storage.setItem(name, value);
  },
  async removeItem(name: string) {
    await getDatabase();
    await Storage.removeItem(name);
  },
};
