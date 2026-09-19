import type { SupportedLocale } from './types';

/** Keep stored locale IDs stable while using script-aware tags supported by native Intl. */
export function getIntlLanguageTag(locale: SupportedLocale): string {
  return locale === 'zh-CN' ? 'zh-Hans' : locale === 'zh-TW' ? 'zh-Hant' : locale;
}
