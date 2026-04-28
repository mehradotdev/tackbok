import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';

let importFromPresentlyCSV: typeof import('./presently').importFromPresentlyCSV;

const mockFileText = mock(async () => '');
const mockSelect = mock(() => ({ from: mockFrom }));
const mockFrom = mock(() => ({ where: mockWhere }));
const mockWhere = mock(() => ({ limit: mockLimit }));
const mockLimit = mock(async () => []);
const mockValues = mock(async () => undefined);
const mockInsert = mock(() => ({ values: mockValues }));
const mockTransaction = mock(
  async (
    callback: (tx: {
      select: typeof mockSelect;
      insert: typeof mockInsert;
    }) => Promise<void>,
  ) =>
    callback({
      select: mockSelect,
      insert: mockInsert,
    }),
);
const mockGenerateUUID = mock(() => 'generated-note-id');
const mockReportImportProgress = mock(() => {});

mock.module('expo-document-picker', () => ({
  getDocumentAsync: mock(async () => ({ canceled: true })),
}));

mock.module('expo-file-system', () => ({
  File: class MockFile {
    text() {
      return mockFileText();
    }
  },
}));

mock.module('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ type: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
}));

mock.module('~/db', () => ({
  db: {
    transaction: (callback: Parameters<typeof mockTransaction>[0]) =>
      mockTransaction(callback),
  },
  entries: {
    note_id: 'note_id',
    created_at: 'created_at',
    text_content: 'text_content',
  },
}));

mock.module('~/lib/utils', () => ({
  generateUUID: () => mockGenerateUUID(),
}));

mock.module('../progress', () => ({
  reportImportProgress: (...args: Parameters<typeof mockReportImportProgress>) =>
    mockReportImportProgress(...args),
}));

describe('importFromPresentlyCSV', () => {
  beforeAll(async () => {
    ({ importFromPresentlyCSV } = await import('./presently'));
  });

  beforeEach(() => {
    mockFileText.mockReset();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockLimit.mockReset();
    mockValues.mockReset();
    mockInsert.mockClear();
    mockTransaction.mockClear();
    mockGenerateUUID.mockReset();
    mockReportImportProgress.mockReset();

    mockLimit.mockImplementation(async () => []);
    mockValues.mockImplementation(async () => undefined);
    mockGenerateUUID.mockImplementation(() => 'generated-note-id');
  });

  test('imports rows separated by bare CR line terminators', async () => {
    mockFileText.mockResolvedValue(
      'entryDate,entryContent\r2024-01-01,First entry\r2024-01-02,Second entry',
    );

    const summary = await importFromPresentlyCSV('/tmp/presently.csv');

    expect(summary.importedEntries).toBe(2);
    expect(summary.skippedEntries).toBe(0);
    expect(mockValues).toHaveBeenCalledTimes(2);
    expect(mockValues).toHaveBeenNthCalledWith(1, {
      note_id: 'generated-note-id',
      text_content: 'First entry',
      created_at: new Date('2024-01-01T00:00:00').getTime(),
      updated_at: expect.any(Number),
    });
    expect(mockValues).toHaveBeenNthCalledWith(2, {
      note_id: 'generated-note-id',
      text_content: 'Second entry',
      created_at: new Date('2024-01-02T00:00:00').getTime(),
      updated_at: expect.any(Number),
    });
  });

  test('skips impossible calendar dates instead of rolling them over', async () => {
    mockFileText.mockResolvedValue(
      [
        'entryDate,entryContent',
        '2025-02-30,Invalid February date',
        '2025-13-45,Invalid month and day',
        '2025-02-29,Invalid non-leap day',
        '2024-02-29,Valid leap day',
      ].join('\n'),
    );

    const summary = await importFromPresentlyCSV('/tmp/presently.csv');

    expect(summary.importedEntries).toBe(1);
    expect(summary.skippedEntries).toBe(0);
    expect(mockValues).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith({
      note_id: 'generated-note-id',
      text_content: 'Valid leap day',
      created_at: new Date(2024, 1, 29).getTime(),
      updated_at: expect.any(Number),
    });
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
