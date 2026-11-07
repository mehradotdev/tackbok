import { runExclusiveDbTransaction } from '~/db';

const mockSql: string[] = [];
const mockFailures: { commit?: Error; close?: Error } = {};
// The real Expo transaction lifecycle (hoisted install), with the native module faked.
jest.mock('../../../../node_modules/expo-sqlite/src/ExpoSQLite', () => ({
  __esModule: true,
  default: {
    NativeDatabase: class {
      async initAsync() {}
      async execAsync(sql: string) {
        mockSql.push(sql);
        if (sql === 'COMMIT' && mockFailures.commit) throw mockFailures.commit;
      }
      async closeAsync() {
        if (mockFailures.close) throw mockFailures.close;
      }
    },
  },
}));
jest.mock('expo-sqlite', () => {
  const { SQLiteDatabase } = jest.requireActual(
    '../../../../node_modules/expo-sqlite/src/SQLiteDatabase',
  );
  return { openDatabaseSync: () => new SQLiteDatabase('test.db', {}, { execSync() {} }) };
});
jest.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

beforeEach(() => {
  mockSql.length = 0;
  delete mockFailures.commit;
  delete mockFailures.close;
});

test('a committed transaction resolves even when its connection fails to close', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFailures.close = new Error('native close failed');
  await expect(runExclusiveDbTransaction(async () => 'committed')).resolves.toBe(
    'committed',
  );
  expect(mockSql).toEqual(['BEGIN', 'COMMIT']);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test('a failed COMMIT still rejects', async () => {
  mockFailures.commit = new Error('commit failed');
  await expect(runExclusiveDbTransaction(async () => 'value')).rejects.toBe(
    mockFailures.commit,
  );
});

test('a failing operation still rolls back and rejects', async () => {
  const failure = new Error('operation failed');
  await expect(
    runExclusiveDbTransaction(async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(mockSql).toEqual(['BEGIN', 'ROLLBACK']);
});
