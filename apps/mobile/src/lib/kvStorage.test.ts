const mockExec = jest.fn();
const mockOpen = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockRemove = jest.fn();
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpen(...args),
}));
jest.mock('expo-sqlite/kv-store', () => ({
  getItem: (...args: unknown[]) => mockGet(...args),
  setItem: (...args: unknown[]) => mockSet(...args),
  removeItem: (...args: unknown[]) => mockRemove(...args),
}));

it('shares one retained connection and finishes configuration before concurrent store hydration', async () => {
  let finish!: () => void;
  mockExec.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const handle = { execAsync: mockExec };
  mockOpen.mockResolvedValue(handle);
  mockGet.mockResolvedValue('saved');
  let storage!: typeof import('./kvStorage').kvStorage;
  jest.isolateModules(() => {
    storage = jest.requireActual<typeof import('./kvStorage')>('./kvStorage').kvStorage;
  });
  const settings = storage.getItem('tackbok-settings');
  const locale = storage.getItem('tackbok-locale');
  await Promise.resolve();
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockExec).toHaveBeenCalledWith(
    'PRAGMA busy_timeout = 2000; PRAGMA journal_mode = WAL;',
  );
  expect(mockGet).not.toHaveBeenCalled();
  finish();
  expect(await Promise.all([settings, locale])).toEqual(['saved', 'saved']);
  await storage.setItem('tackbok-locale', 'he');
  await storage.removeItem('tackbok-locale');
  expect(mockSet).toHaveBeenCalledWith('tackbok-locale', 'he');
  expect(mockRemove).toHaveBeenCalledWith('tackbok-locale');
  expect(mockOpen).toHaveBeenCalledTimes(1);
});
