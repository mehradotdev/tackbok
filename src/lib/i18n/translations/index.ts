import type { SupportedLocale, Translations, LanguageInfo } from '../types';
import { RTL_LOCALES } from '../types';
import { en } from './en';
import { es } from './es';
import { ur } from './ur';

/**
 * All translations indexed by locale code
 */
export const translations: Record<SupportedLocale, Translations> = {
  en,
  es,
  ur,
};

/**
 * Language metadata for UI display
 */
export const languages: LanguageInfo[] = [
  { code: 'en', displayName: 'English', nativeName: 'English', isRTL: false },
  { code: 'es', displayName: 'Spanish', nativeName: 'Español', isRTL: false },
  { code: 'ur', displayName: 'Urdu', nativeName: 'اردو', isRTL: true },
];

/**
 * Get translation for a key in the specified locale
 * Falls back to the key itself if translation not found
 */
export function translate(locale: SupportedLocale, key: string): string {
  const localeTranslations = translations[locale];
  return localeTranslations?.[key] ?? key;
}

/**
 * Check if a locale is RTL
 */
export function isRTLLocale(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}
