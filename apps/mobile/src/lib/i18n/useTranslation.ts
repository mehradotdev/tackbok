import { getFormattingLocale } from './formattingLocale';
import { useMemo } from 'react';
import { useLocales, useCalendars } from 'expo-localization';
import { useLocaleStore, getEffectiveLocale, getEffectiveSupportedLocale } from './store';
import { translate, isRTLLocale } from './translations';
import {
  type SupportedLocale,
  type LocalePreference,
  type TranslationFunction,
  type TranslationKey,
} from './types';

interface UseTranslationResult {
  /**
   * Translation function - t("key") returns translated string
   * Falls back to the English source message
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
  const deviceLocales = useLocales();
  const calendars = useCalendars();
  const deviceLocale = useMemo(
    () => deviceLocales.map((item) => item.languageTag),
    [deviceLocales],
  );

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
  const t = useMemo(
    () =>
      Object.assign(
        (key: TranslationKey, params?: Record<string, string | number>) =>
          translate(locale, key, params),
        {
          locale,
          formattingLocale: getFormattingLocale(locale, deviceLocales[0]),
          uses24hourClock: calendars[0]?.uses24hourClock,
        },
      ),
    [locale, deviceLocales, calendars],
  );

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
