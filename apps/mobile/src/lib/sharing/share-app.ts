import { Linking, Platform, Share } from 'react-native';
import Constants from 'expo-constants';

const TACKBOK_URL = 'https://tackbok.org';
const ANDROID_RATING_URL =
  'https://play.google.com/store/apps/details?id=dev.mehra.tackbok&showAllReviews=true';
const SAMSUNG_RATING_URL = 'samsungapps://ProductDetail/dev.mehra.tackbok';
const SAMSUNG_RATING_FALLBACK_URL =
  'https://galaxystore.samsung.com/detail/dev.mehra.tackbok';
const IOS_RATING_URL =
  'https://apps.apple.com/us/app/tackbok-gratitude-journal/id6757330507';

export async function shareTackbok(message: string): Promise<void> {
  const platform = process.env.EXPO_OS ?? Platform.OS;
  await Share.share(
    platform === 'ios'
      ? { message, url: TACKBOK_URL }
      : { message: `${message}\n${TACKBOK_URL}` },
  );
}

export async function openTackbokRating(): Promise<void> {
  const platform = Platform.OS;
  if (platform === 'android' && Constants.expoConfig?.extra?.androidStore === 'samsung') {
    try {
      await Linking.openURL(SAMSUNG_RATING_URL);
    } catch {
      await Linking.openURL(SAMSUNG_RATING_FALLBACK_URL);
    }
    return;
  }

  const url =
    platform === 'android'
      ? ANDROID_RATING_URL
      : platform === 'ios'
        ? IOS_RATING_URL
        : TACKBOK_URL;
  await Linking.openURL(url);
}
