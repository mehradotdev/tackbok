import type { InstallMarkerStore } from '../storage/installBinding';

let mockOs = 'android';
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOs;
    },
  },
}));
const mockGet = jest.fn<Promise<string | null>, [string]>();
const mockDelete = jest.fn(async (_key: string) => {});
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: (key: string) => mockGet(key),
  setItemAsync: async () => {},
  deleteItemAsync: (key: string) => mockDelete(key),
}));
jest.mock('../snapshot/storage', () => ({ productionApplyFiles: () => ({}) }));
let mockRead: string | null | Error = null;
jest.mock('../storage/installBinding', () => ({
  ensureInstallBinding: async ({ marker }: { marker: InstallMarkerStore }) => {
    try {
      mockRead = await marker.read();
    } catch (error) {
      mockRead = error as Error;
      throw error;
    }
    return 'bound';
  },
}));

beforeEach(() => {
  jest.resetModules();
  mockGet.mockReset();
  mockDelete.mockClear();
  mockRead = null;
});

const ensure = () =>
  (
    require('./installBinding') as typeof import('./installBinding')
  ).ensureInstallBoundDeviceId();

test('Android: a marker that cannot be decrypted is dropped and reads as missing', async () => {
  mockOs = 'android';
  mockGet.mockRejectedValue(new Error('DecryptException'));
  await ensure();
  expect(mockDelete).toHaveBeenCalledWith('tackbok.install-marker.v1');
  expect(mockRead).toBeNull();
});

test('Android: a brief Keystore error is retried once and keeps the marker', async () => {
  mockOs = 'android';
  mockGet.mockRejectedValueOnce(new Error('System error')).mockResolvedValueOnce('m');
  await ensure();
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockRead).toBe('m');
});

test('iOS: a locked keychain throws and keeps the marker for a later attempt', async () => {
  mockOs = 'ios';
  mockGet.mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce('m');
  await expect(ensure()).rejects.toThrow('locked');
  expect(mockDelete).not.toHaveBeenCalled();
  await ensure();
  expect(mockRead).toBe('m');
});
