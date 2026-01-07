/**
 * Supported locale codes
 * 'device' represents using the device's default language
 */
export type SupportedLocale = 'en' | 'es' | 'ur';
export type LocalePreference = SupportedLocale | 'device';

/**
 * List of RTL (Right-to-Left) locales
 */
export const RTL_LOCALES: SupportedLocale[] = ['ur'];

/**
 * Default fallback locale when device locale is not supported
 */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Flat translation dictionary
 * Keys are the English text, values are translations
 * If a key is missing for a locale, the key itself is used as fallback
 */
export type Translations = Record<string, string>;

/**
 * Translation function type
 * Takes a key (English text) and returns the translated string
 * Falls back to the key itself if translation not found
 */
export type TranslationFunction = (key: string) => string;

/**
 * Language metadata for display in UI
 */
export interface LanguageInfo {
  code: SupportedLocale;
  displayName: string;
  nativeName: string;
  isRTL: boolean;
}
