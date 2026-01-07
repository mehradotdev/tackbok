import { useMemo, useCallback } from 'react';
import { getLocales } from 'expo-localization';
import { useLocaleStore, getEffectiveLocale } from './store';
import { translate, isRTLLocale } from './translations';
import type { SupportedLocale, LocalePreference, TranslationFunction } from './types';

interface UseTranslationResult {
  /**
   * Translation function - t("key") returns translated string
   * Falls back to the key itself if translation not found
   */
  t: TranslationFunction;

  /**
   * Current active locale code
   */
  locale: SupportedLocale;

  /**
   * Whether the current locale is RTL
   */
  isRTL: boolean;

  /**
   * User's locale preference (may be 'device')
   */
  localePreference: LocalePreference;

  /**
   * Set the locale preference
   */
  setLocale: (locale: LocalePreference) => void;

  /**
   * Whether the locale store has been hydrated
   */
  isReady: boolean;
}

/**
 * Hook to access translations and locale information
 */
export function useTranslation(): UseTranslationResult {
  const { localePreference, setLocalePreference, _hasHydrated } = useLocaleStore();

  // Get device locale
  const deviceLocale = useMemo(() => {
    const locales = getLocales();
    return locales[0]?.languageTag ?? null;
  }, []);

  // Calculate effective locale
  const locale = useMemo(
    () => getEffectiveLocale(localePreference, deviceLocale),
    [localePreference, deviceLocale],
  );

  // Create translation function
  const t = useCallback((key: string): string => translate(locale, key), [locale]);

  // Check if RTL
  const isRTL = useMemo(() => isRTLLocale(locale), [locale]);

  return {
    t,
    locale,
    isRTL,
    localePreference,
    setLocale: setLocalePreference,
    isReady: _hasHydrated,
  };
}
