import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

import { openTackbokRating } from './share-app';

jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: { openURL: jest.fn() },
}));

beforeEach(() => {
  jest.resetAllMocks();
  Platform.OS = 'android';
  Constants.expoConfig!.extra = {};
  jest.mocked(Linking.openURL).mockResolvedValue(undefined);
});

test.each([
  [
    'google',
    'android',
    'https://play.google.com/store/apps/details?id=dev.mehra.tackbok&showAllReviews=true',
  ],
  [
    undefined,
    'android',
    'https://play.google.com/store/apps/details?id=dev.mehra.tackbok&showAllReviews=true',
  ],
  ['samsung', 'android', 'samsungapps://ProductDetail/dev.mehra.tackbok'],
  [
    'samsung',
    'ios',
    'https://apps.apple.com/us/app/tackbok-gratitude-journal/id6757330507',
  ],
  ['samsung', 'web', 'https://tackbok.org'],
] as const)('opens the rating URL for %s on %s', async (androidStore, platform, url) => {
  Constants.expoConfig!.extra = { androidStore };
  Platform.OS = platform;

  await openTackbokRating();

  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(Linking.openURL).toHaveBeenCalledWith(url);
});

test('falls back to the Galaxy Store website when the deep link fails', async () => {
  Constants.expoConfig!.extra = { androidStore: 'samsung' };
  jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error('Store unavailable'));

  await openTackbokRating();

  expect(Linking.openURL).toHaveBeenCalledTimes(2);
  expect(Linking.openURL).toHaveBeenNthCalledWith(
    1,
    'samsungapps://ProductDetail/dev.mehra.tackbok',
  );
  expect(Linking.openURL).toHaveBeenNthCalledWith(
    2,
    'https://galaxystore.samsung.com/detail/dev.mehra.tackbok',
  );
});

test.each(['google', 'samsung'])(
  'propagates %s store failures to the caller',
  async (androidStore) => {
    Constants.expoConfig!.extra = { androidStore };
    const error = new Error('Unable to open store');
    jest.mocked(Linking.openURL).mockRejectedValue(error);

    await expect(openTackbokRating()).rejects.toBe(error);
    expect(Linking.openURL).toHaveBeenCalledTimes(androidStore === 'samsung' ? 2 : 1);
  },
);
