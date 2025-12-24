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
    'SELECT * FROM gratitudeLogs ORDER BY entryDate DESC',
  );
  return allRows;
};

// The "Smart" Save function
export const saveGratitudeLog = async (
  date: string,
  content: string,
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
    [date, content],
  );
  return { type: 'save', result };
};

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
