import { useMemo, useCallback } from 'react';
import { getLocales } from 'expo-localization';
import { useLocaleStore, getEffectiveLocale, getEffectiveSupportedLocale } from './store';
import { translate, isRTLLocale } from './translations';
import {
  type SupportedLocale,
  type LocalePreference,
  type TranslationFunction,
} from './types';

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
   * Device default locale code
   */
  deviceDefaultLocale: SupportedLocale | null;

  /**
   * Whether the device default locale is supported by the app
   */
  isDeviceDefaultLocaleSupported: boolean;

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

  // Calculate device default locale
  const deviceDefaultLocale = useMemo(
    () => getEffectiveLocale(deviceLocale, 'device'),
    [deviceLocale],
  );

  // Calculate effective locale
  const locale = useMemo(
    () => getEffectiveSupportedLocale(deviceLocale, localePreference),
    [localePreference, deviceLocale],
  );

  // Create translation function
  const t = useCallback((key: string): string => translate(locale, key), [locale]);

  // Check if RTL
  const isRTL = useMemo(() => isRTLLocale(locale), [locale]);

  // Check if Device default locale is supported by the app
  const isDeviceDefaultLocaleSupported = useMemo(
    () => deviceDefaultLocale !== null,
    [deviceDefaultLocale],
  );

  return {
    t,
    locale,
    isRTL,
    isDeviceDefaultLocaleSupported,
    deviceDefaultLocale,
    localePreference,
    setLocale: setLocalePreference,
    isReady: _hasHydrated,
  };
}
