import { en } from './translations/en';

/**
 * List of supported language codes (excluding Chinese variants)
 * Chinese variants (zh-CN, zh-TW, zh-HK) require special handling with full locale codes
 */
export const SUPPORTED_LANG_CODES = [
  'en',
  // 'es',
  // 'ur',
  'ar',
  // 'fa',
  'he',
  // 'fr',
  'de',
  // 'nl',
  // 'pl',
  // 'ru',
  // 'pt',
  // 'it',
  // 'hi',
  // 'ko',
  // 'ja',
  // 'tr',
  // 'ta',
  // 'te',
  // 'kn',
  // 'ml',
  // 'mr',
  // 'bn',
  // 'sv',
] as const;

/**
 * Chinese locale variants that require full locale code with region
 */
export const CHINESE_LOCALE_VARIANTS = [
  'zh-CN',
  'zh-TW',
  // 'zh-HK'
] as const;

/**
 * All supported locale codes
 * Derived from SUPPORTED_LANG_CODES and CHINESE_LOCALE_VARIANTS
 */
export const ALL_SUPPORTED_LOCALES = [
  ...SUPPORTED_LANG_CODES,
  ...CHINESE_LOCALE_VARIANTS,
] as const;

/**
 * Supported locale codes type
 * Automatically inferred from ALL_SUPPORTED_LOCALES constant
 */
export type SupportedLocale = (typeof ALL_SUPPORTED_LOCALES)[number];

/**
 * Locale preference type
 * 'device' represents using the device's default language
 */
export type LocalePreference = SupportedLocale | 'device';

/**
 * List of RTL (Right-to-Left) locales
 */
export const RTL_LOCALES: SupportedLocale[] = [
  'ar',
  // 'fa',
  'he',
  // 'ur',
];

/**
 * Default fallback locale when device locale is not supported
 */
export const DEFAULT_LOCALE = 'en' as const satisfies SupportedLocale;

/**
 * Flat translation dictionary
 * Keys are the English text, values are translations
 * If a key is missing for a locale, the key itself is used as fallback
 */
export type Translations = typeof en;

/**
 * Translation function type
 * Takes a key (English text) and returns the translated string
 * Optionally accepts interpolation params, e.g. t('importedCount', { count: 5 })
 * Falls back to the key itself if translation not found
 */
export type TranslationFunction = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/**
 * Language metadata for display in UI
 */
export interface LanguageInfo {
  code: LocalePreference;
  displayName: string;
  nativeName: string;
  isRTL: boolean;
}
