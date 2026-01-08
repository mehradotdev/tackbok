import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from 'expo-sqlite/kv-store';
import type { LocalePreference, SupportedLocale } from './types';
import { DEFAULT_LOCALE, SUPPORTED_LANG_CODES } from './types';

interface LocaleState {
  /**
   * User's locale preference
   * Can be a specific locale or 'device' for auto-detection
   */
  localePreference: LocalePreference;

  /**
   * Whether the store has been hydrated from AsyncStorage
   */
  _hasHydrated: boolean;

  /**
   * Set the locale preference
   */
  setLocalePreference: (locale: LocalePreference) => void;

  /**
   * Internal: mark store as hydrated
   */
  setHasHydrated: (hydrated: boolean) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      localePreference: 'device',
      _hasHydrated: false,

      setLocalePreference: (locale) => set({ localePreference: locale }),

      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
    }),
    {
      name: 'tackbok-locale',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({ localePreference: state.localePreference }),
    },
  ),
);

/**
 * Get the effective locale based on user preference and device locale.
 * If device ocale is not supported, returns null
 */
export function getEffectiveLocale(
  deviceLocale: string | null,
  preference: LocalePreference = 'device',
): SupportedLocale | null {
  if (preference !== 'device') {
    return preference;
  }

  if (!deviceLocale) {
    return DEFAULT_LOCALE;
  }

  const normalizedLocale = deviceLocale.toLowerCase();

  // Handle Chinese locale variants as special cases (need full locale code with region)
  if (normalizedLocale.startsWith('zh-cn') || normalizedLocale === 'zh-hans') {
    return 'zh-CN';
  }
  if (normalizedLocale.startsWith('zh-tw') || normalizedLocale === 'zh-hant') {
    return 'zh-TW';
  }
  // if (normalizedLocale.startsWith('zh-hk')) {
  //   return 'zh-HK';
  // }

  // Extract language code from device locale (e.g., 'en-US' -> 'en')
  const langCode = normalizedLocale.split('-')[0];

  // Check if device language is supported
  if (SUPPORTED_LANG_CODES.includes(langCode as (typeof SUPPORTED_LANG_CODES)[number])) {
    return langCode as SupportedLocale;
  }

  return DEFAULT_LOCALE;
}

/**
 * Get the effective supported locale based on user preference and device settings
 */
export function getEffectiveSupportedLocale(
  deviceLocale: string | null,
  preference: LocalePreference,
): SupportedLocale {
  return getEffectiveLocale(deviceLocale, preference) ?? DEFAULT_LOCALE;
}
