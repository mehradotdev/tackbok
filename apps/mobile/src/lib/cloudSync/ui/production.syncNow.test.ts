import { CloudSyncActionError, syncNow } from './production';
import { cloudConnectionLifecycle } from '../runtime/connectionLifecycle';
import { SyncCancelledError } from '../snapshot/sync/errors';

const mockManualSync = jest.fn<Promise<boolean>, []>();
const mockFailureCategory = jest.fn<string | null, []>(() => null);

jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-file-system', () => ({}));
jest.mock('~/db', () => ({}));
jest.mock('drizzle-orm', () => ({}));
jest.mock('~/db/queries', () => ({}));
jest.mock('~/lib/photoUtils', () => ({}));
jest.mock('~/lib/voiceMemoUtils', () => ({}));
jest.mock('../auth', () => ({}));
jest.mock('../auth/secureTokenStore', () => ({}));
jest.mock('../snapshot/drive', () => ({}));
jest.mock('../snapshot/sync', () => ({}));
jest.mock('../runtime/production', () => ({
  runProductionManualSync: () => mockManualSync(),
  getProductionCloudSyncFailureCategory: () => mockFailureCategory(),
}));
jest.mock('../runtime/backgroundTask', () => ({}));
jest.mock('../storage/repositories', () => ({}));

beforeEach(() => jest.clearAllMocks());

test('a pass stopped by a connection change is reported as cancelled, not failed', async () => {
  mockManualSync.mockImplementationOnce(async () => {
    // Pause or Disconnect starts while the manual pass is running.
    await cloudConnectionLifecycle.change(async () => undefined);
    return false;
  });
  await expect(syncNow()).rejects.toBeInstanceOf(SyncCancelledError);
});

test('a failed pass without a connection change keeps its failure category', async () => {
  mockManualSync.mockResolvedValueOnce(false);
  mockFailureCategory.mockReturnValueOnce('offline');
  const failure = syncNow();
  await expect(failure).rejects.toBeInstanceOf(CloudSyncActionError);
  await expect(failure).rejects.toMatchObject({ category: 'offline' });
});

test('a completed pass resolves', async () => {
  mockManualSync.mockResolvedValueOnce(true);
  await expect(syncNow()).resolves.toBe(true);
});
