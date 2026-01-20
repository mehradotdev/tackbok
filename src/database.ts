import * as SQLite from 'expo-sqlite';
import { IGratitudeDBLog, ISaveGratitudeLogResult } from './types';

const DATABASE_NAME = 'tackbok.db';

// Open database synchronously
export const db = SQLite.openDatabaseSync(DATABASE_NAME);

export const initDB = (): void => {
  // Create main table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS gratitudeLogs (
      entryDate TEXT PRIMARY KEY, -- Format: YYYY-MM-DD
      entryContent TEXT NOT NULL
    );
  `);

  // Create FTS5 virtual table for full-text search
  // This table mirrors entryDate and entryContent for fast searching
  db.execSync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS gratitudeLogs_fts 
    USING fts5(entryDate UNINDEXED, entryContent, content='gratitudeLogs', content_rowid='rowid');
  `);

  // Trigger: Insert into FTS when inserting into main table
  db.execSync(`
    CREATE TRIGGER IF NOT EXISTS gratitudeLogs_ai 
    AFTER INSERT ON gratitudeLogs BEGIN
      INSERT INTO gratitudeLogs_fts(rowid, entryDate, entryContent)
      VALUES (new.rowid, new.entryDate, new.entryContent);
    END;
  `);

  // Trigger: Delete from FTS when deleting from main table
  db.execSync(`
    CREATE TRIGGER IF NOT EXISTS gratitudeLogs_ad 
    AFTER DELETE ON gratitudeLogs BEGIN
      INSERT INTO gratitudeLogs_fts(gratitudeLogs_fts, rowid, entryDate, entryContent)
      VALUES ('delete', old.rowid, old.entryDate, old.entryContent);
    END;
  `);

  // Trigger: Update FTS when updating main table
  db.execSync(`
    CREATE TRIGGER IF NOT EXISTS gratitudeLogs_au 
    AFTER UPDATE ON gratitudeLogs BEGIN
      INSERT INTO gratitudeLogs_fts(gratitudeLogs_fts, rowid, entryDate, entryContent)
      VALUES ('delete', old.rowid, old.entryDate, old.entryContent);
      INSERT INTO gratitudeLogs_fts(rowid, entryDate, entryContent)
      VALUES (new.rowid, new.entryDate, new.entryContent);
    END;
  `);

  // Rebuild FTS index for existing data (only runs if FTS table is empty)
  const ftsCount = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM gratitudeLogs_fts',
  );
  const mainCount = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM gratitudeLogs',
  );

  if (ftsCount && mainCount && ftsCount.count === 0 && mainCount.count > 0) {
    db.execSync(`INSERT INTO gratitudeLogs_fts(rowid, entryDate, entryContent) 
                 SELECT rowid, entryDate, entryContent FROM gratitudeLogs;`);
  }
};

// Fetch GratitudeLogs sorted by date descending
export const getGratitudeLogs = async (): Promise<IGratitudeDBLog[]> => {
  // We cast the result because we know the schema matches our interface
  const allRows = await db.getAllAsync<IGratitudeDBLog>(
    'SELECT * FROM gratitudeLogs ORDER BY entryDate DESC',
  );
  return allRows;
};

// Fetch GratitudeLog by date
export const getGratitudeLogByDate = (
  date?: string, // Format: YYYY-MM-DD
): IGratitudeDBLog | undefined => {
  if (!date) return undefined;
  const row = db.getFirstSync<IGratitudeDBLog>(
    'SELECT * FROM gratitudeLogs WHERE entryDate = ?',
    [date],
  );

  if (!row) return undefined;
  return row;
};

// Fetch all entry dates for a specific month (YYYY-MM format)
// Returns an array of date strings in YYYY-MM-DD format
export const getGratitudeEntryDatesForMonth = (
  year: number,
  month: number, // 1-based month (1 = January, 12 = December)
): string[] => {
  // Format month as YYYY-MM for SQL LIKE pattern
  const monthStr = month.toString().padStart(2, '0');
  const yearMonthPattern = `${year}-${monthStr}-%`;

  const rows = db.getAllSync<{ entryDate: string }>(
    'SELECT entryDate FROM gratitudeLogs WHERE entryDate LIKE ?',
    [yearMonthPattern],
  );

  return rows.map((row) => row.entryDate);
};

// Search gratitude logs by content using FTS5
export const searchGratitudeLogs = async (
  searchTerm: string,
): Promise<IGratitudeDBLog[]> => {
  if (!searchTerm.trim()) return [];

  // Escape FTS5 special characters to prevent syntax errors
  // Double quotes need to be doubled, and we wrap in quotes to handle special chars
  const escapedTerm = searchTerm
    .replace(/"/g, '""') // Escape double quotes
    .replace(/\*/g, ''); // Remove asterisks (FTS5 special char)

  // If after escaping we have nothing left, return empty results
  if (!escapedTerm.trim()) return [];

  // Add asterisk for prefix matching (enables partial word matches like "grate" matching "grateful")
  // Split by spaces to handle multi-word searches, add * to each word
  const prefixQuery = escapedTerm
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0) // Remove empty strings
    .map((word) => `"${word}"*`) // Wrap in quotes and add * for prefix match
    .join(' ');

  // Use FTS5 MATCH for fast full-text search
  // The query searches the entryContent column and orders by entryDate DESC
  const rows = await db.getAllAsync<IGratitudeDBLog>(
    `SELECT gratitudeLogs.entryDate, gratitudeLogs.entryContent
     FROM gratitudeLogs_fts
     JOIN gratitudeLogs ON gratitudeLogs.rowid = gratitudeLogs_fts.rowid
     WHERE gratitudeLogs_fts MATCH ?
     ORDER BY gratitudeLogs.entryDate DESC`,
    [prefixQuery],
  );
  return rows;
};

// The "Smart" Save function
export const saveGratitudeLog = async (
  date: string,
  content: string,
): Promise<ISaveGratitudeLogResult> => {
  // 1. DELETE if content is empty or just whitespace
  if (!content || content.trim() === '') {
    const result = await db.runAsync('DELETE FROM gratitudeLogs WHERE entryDate = ?', [
      date,
    ]);
    return { type: 'delete', result };
  }

  // 2. UPSERT (Insert or Update) if content exists
  const result = await db.runAsync(
    'INSERT OR REPLACE INTO gratitudeLogs (entryDate, entryContent) VALUES (?, ?)',
    [date, content],
  );
  return { type: 'save', result };
};

/**
 * Completely resets the database by dropping all tables and recreating the schema.
 * This is a destructive operation - all data will be permanently lost.
 */
export async function deleteAllData(): Promise<void> {
  db.execSync('BEGIN');
  try {
    // Drop triggers first (they depend on tables)
    db.execSync('DROP TRIGGER IF EXISTS gratitudeLogs_ai');
    db.execSync('DROP TRIGGER IF EXISTS gratitudeLogs_ad');
    db.execSync('DROP TRIGGER IF EXISTS gratitudeLogs_au');

    // Drop FTS virtual table
    db.execSync('DROP TABLE IF EXISTS gratitudeLogs_fts');

    // Drop main table
    db.execSync('DROP TABLE IF EXISTS gratitudeLogs');

    // Recreate the schema from scratch
    initDB();
    db.execSync('COMMIT');
  } catch (err) {
    db.execSync('ROLLBACK');
    throw err;
  }
}

export const generateMockData = async (): Promise<void> => {
  const today = new Date();

  const mockMessages = [
    'Grateful for a warm cup of coffee this morning.',
    'Had a really productive meeting with the team.',
    'The weather was perfect for a walk.',
    'Found a solution to a bug I was stuck on.',
    'My partner cooked an amazing dinner.',
    'Read a fantastic chapter in my book.',
    'Got a solid 8 hours of sleep.',
    'Caught up with an old friend.',
    'Learned a new trick in React Native.',
    'Grateful for a quiet evening to relax.',
  ];

  try {
    // Execute all inserts as a single atomic transaction
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < 10; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i); // Subtract 'i' days

        const dateStr = new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD
        const content = mockMessages[i];

        await db.runAsync(
          'INSERT OR REPLACE INTO gratitudeLogs (entryDate, entryContent) VALUES (?, ?)',
          [dateStr, content],
        );
        console.log(`Generated mock entry for: ${dateStr}`);
      }
    });
    console.log('10 Mock entries generated successfully!');
  } catch (error) {
    console.error('Error generating mock data:', error);
  }
};
