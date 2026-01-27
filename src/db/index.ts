import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// ============================================================================
// Database Instance
// ============================================================================

const DATABASE_NAME = 'tackbok.db';
const expo = SQLite.openDatabaseSync(DATABASE_NAME);

export const db = drizzle(expo, { schema });

// Re-export schema for convenience
export * from './schema';
