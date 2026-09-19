import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from 'expo-sqlite/kv-store';
import type { LocalePreference, SupportedLocale } from './types';
import { ALL_SUPPORTED_LOCALES, DEFAULT_LOCALE, SUPPORTED_LANG_CODES } from './types';

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
 * If device locale is not supported, returns null
 */
export function getEffectiveLocale(
  deviceLocale: string | readonly string[] | null,
  preference: LocalePreference = 'device',
): SupportedLocale | null {
  if (preference !== 'device') {
    // Persisted preferences can come from older builds or imported settings.
    return ALL_SUPPORTED_LOCALES.includes(preference) ? preference : DEFAULT_LOCALE;
  }

  if (!deviceLocale) {
    return null;
  }

  if (Array.isArray(deviceLocale)) {
    for (const tag of deviceLocale) {
      const locale = getEffectiveLocale(tag);
      if (locale) return locale;
    }
    return null;
  }
  const normalizedLocale = (deviceLocale as string).replaceAll('_', '-').toLowerCase();

  // Script takes precedence over region (e.g. zh-Hant-CN).
  if (/^zh(?:-|$)/.test(normalizedLocale)) {
    const parts = normalizedLocale.split('-');
    if (parts.includes('hant')) return 'zh-TW';
    if (parts.includes('hans')) return 'zh-CN';
    return parts.some((part) => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
  }

  // Extract language code from device locale (e.g., 'en-US' -> 'en')
  const langCode = normalizedLocale.split('-')[0];

  // Check if device language is supported
  if (SUPPORTED_LANG_CODES.includes(langCode as (typeof SUPPORTED_LANG_CODES)[number])) {
    return langCode as SupportedLocale;
  }

  return null;
}

/**
 * Get the effective supported locale based on user preference and device settings
 */
export function getEffectiveSupportedLocale(
  deviceLocale: string | readonly string[] | null,
  preference: LocalePreference,
): SupportedLocale {
  return getEffectiveLocale(deviceLocale, preference) ?? DEFAULT_LOCALE;
}
