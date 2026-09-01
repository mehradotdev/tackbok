import { Linking, Platform, Share } from 'react-native';

const TACKBOK_URL = 'https://tackbok.org';
const ANDROID_RATING_URL =
  'https://play.google.com/store/apps/details?id=dev.mehra.tackbok&showAllReviews=true';
// Replace this with the production App Store review URL once Tackbok has an
// App Store ID. Until then, iOS users can support the current TestFlight build.
const IOS_RATING_URL = 'https://testflight.apple.com/join/jGTWBEWq';

export async function shareTackbok(message: string): Promise<void> {
  const platform = process.env.EXPO_OS ?? Platform.OS;
  await Share.share(
    platform === 'ios'
      ? { message, url: TACKBOK_URL }
      : { message: `${message}\n${TACKBOK_URL}` },
  );
}

export async function openTackbokRating(): Promise<void> {
  const platform = process.env.EXPO_OS ?? Platform.OS;
  const url =
    platform === 'android'
      ? ANDROID_RATING_URL
      : platform === 'ios'
        ? IOS_RATING_URL
        : TACKBOK_URL;
  await Linking.openURL(url);
}
