import type { SupportedLocale, Translations, LanguageInfo } from '../types';
import { RTL_LOCALES } from '../types';
import { en } from './en';
import { ar } from './ar';
import { he } from './he';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';
// import { es } from './es';
// import { ur } from './ur';
// import { fa } from './fa';
// import { fr } from './fr';
// import { de } from './de';
// import { nl } from './nl';
// import { pl } from './pl';
// import { ru } from './ru';
// import { pt } from './pt';
// import { it } from './it';
// import { hi } from './hi';
// import { ko } from './ko';
// import { ja } from './ja';
// import { zhHK } from './zh-HK';
// import { tr } from './tr';
// import { ta } from './ta';
// import { te } from './te';
// import { kn } from './kn';
// import { ml } from './ml';
// import { mr } from './mr';
// import { bn } from './bn';
// import { sv } from './sv';

/**
 * All translations indexed by locale code
 */
export const translations: Record<SupportedLocale, Translations> = {
  en,
  // es,
  // ur,
  ar,
  // fa,
  he,
  // fr,
  // de,
  // nl,
  // pl,
  // ru,
  // pt,
  // it,
  // hi,
  // ko,
  // ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  // 'zh-HK': zhHK,
  // tr,
  // ta,
  // te,
  // kn,
  // ml,
  // mr,
  // bn,
  // sv,
};

/**
 * Language metadata for UI display
 */
export const languages: LanguageInfo[] = [
  { code: 'en', displayName: 'English', nativeName: 'English', isRTL: false },
  { code: 'ar', displayName: 'Arabic', nativeName: 'العربية', isRTL: true },
  // { code: 'bn', displayName: 'Bengali', nativeName: 'বাংলা', isRTL: false },
  // { code: 'zh-HK', displayName: 'Cantonese', nativeName: '廣東話', isRTL: false },
  {
    code: 'zh-CN',
    displayName: 'CN Simplified',
    nativeName: '简体中文',
    isRTL: false,
  },
  {
    code: 'zh-TW',
    displayName: 'CN Traditional',
    nativeName: '繁體中文',
    isRTL: false,
  },
  // { code: 'nl', displayName: 'Dutch', nativeName: 'Nederlands', isRTL: false },
  // { code: 'fa', displayName: 'Farsi', nativeName: 'فارسی', isRTL: true },
  // { code: 'fr', displayName: 'French', nativeName: 'Français', isRTL: false },
  // { code: 'de', displayName: 'German', nativeName: 'Deutsch', isRTL: false },
  { code: 'he', displayName: 'Hebrew', nativeName: 'עברית', isRTL: true },
  // { code: 'hi', displayName: 'Hindi', nativeName: 'हिन्दी', isRTL: false },
  // { code: 'it', displayName: 'Italian', nativeName: 'Italiano', isRTL: false },
  // { code: 'ja', displayName: 'Japanese', nativeName: '日本語', isRTL: false },
  // { code: 'kn', displayName: 'Kannada', nativeName: 'ಕನ್ನಡ', isRTL: false },
  // { code: 'ko', displayName: 'Korean', nativeName: '한국어', isRTL: false },
  // { code: 'ml', displayName: 'Malayalam', nativeName: 'മലയാളം', isRTL: false },
  // { code: 'mr', displayName: 'Marathi', nativeName: 'मराठी', isRTL: false },
  // { code: 'pl', displayName: 'Polish', nativeName: 'Polski', isRTL: false },
  // { code: 'pt', displayName: 'Portuguese', nativeName: 'Português', isRTL: false },
  // { code: 'ru', displayName: 'Russian', nativeName: 'Русский', isRTL: false },
  // { code: 'es', displayName: 'Spanish', nativeName: 'Español', isRTL: false },
  // { code: 'sv', displayName: 'Swedish', nativeName: 'Svenska', isRTL: false },
  // { code: 'ta', displayName: 'Tamil', nativeName: 'தமிழ்', isRTL: false },
  // { code: 'te', displayName: 'Telugu', nativeName: 'తెలుగు', isRTL: false },
  // { code: 'tr', displayName: 'Turkish', nativeName: 'Türkçe', isRTL: false },
  // { code: 'ur', displayName: 'Urdu', nativeName: 'اردو', isRTL: true },
];

/**
 * Get translation for a key in the specified locale
 * Falls back to the key itself if translation not found
 */
export function translate(locale: SupportedLocale, key: string): string {
  const localeTranslations = translations[locale];

  if (key in localeTranslations) {
    return localeTranslations[key as keyof Translations];
  }

  if (__DEV__) {
    console.warn(`[i18n] Missing translation for key: "${key}" in locale: "${locale}"`);
  }
  return key;
}

/**
 * Check if a locale is RTL
 */
export function isRTLLocale(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}
