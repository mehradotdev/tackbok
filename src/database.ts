import * as SQLite from 'expo-sqlite';
import { GratitudeLog, SaveGratitudeLogResult } from './types';

// Open database synchronously
export const db = SQLite.openDatabaseSync('gratitude.db');

export const initDB = (): void => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS gratitudeLogs (
      entryDate TEXT PRIMARY KEY, -- Format: YYYY-MM-DD
      entryContent TEXT NOT NULL
    );
  `);
};

// Fetch GratitudeLogs sorted by date descending
export const getGratitudeLogs = async (): Promise<GratitudeLog[]> => {
  // We cast the result because we know the schema matches our interface
  const allRows = await db.getAllAsync<GratitudeLog>(
    'SELECT * FROM gratitudeLogs ORDER BY entryDate DESC'
  );
  return allRows;
};

// The "Smart" Save function
export const saveGratitudeLog = async (
  date: string,
  content: string
): Promise<SaveGratitudeLogResult> => {
  // 1. DELETE if content is empty or just whitespace
  if (!content || content.trim() === '') {
    const result = await db.runAsync('DELETE FROM gratitudeLogs WHERE entryDate = ?', [
      date,
    ]);
    return { type: 'delete', result };
  }

  // TODO: Use prepared statements to prevent SQL injection
  // 2. UPSERT (Insert or Update) if content exists
  const result = await db.runAsync(
    'INSERT OR REPLACE INTO gratitudeLogs (entryDate, entryContent) VALUES (?, ?)',
    [date, content]
  );
  return { type: 'save', result };
};
