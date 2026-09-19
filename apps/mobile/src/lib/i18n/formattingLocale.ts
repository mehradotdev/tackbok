import { getIntlLanguageTag } from './languageTag';
import { getLocales, type Locale } from 'expo-localization';
import type { SupportedLocale } from './types';

/** App language controls words; the device region controls regional conventions. */
export function getFormattingLocale(
  language: SupportedLocale,
  device: Pick<Locale, 'languageTag' | 'regionCode'> = getLocales()[0],
): string {
  const appTag = getIntlLanguageTag(language);
  const region = device?.regionCode;
  const tag = region ? `${appTag}-${region}` : appTag;
  // Android's Intl may reject synthesized script/region pairs (e.g. zh-Hans-US).
  // Preserve the app language rather than silently falling back to device English.
  return Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0 &&
    Intl.NumberFormat.supportedLocalesOf([tag]).length > 0
    ? tag
    : appTag;
}
