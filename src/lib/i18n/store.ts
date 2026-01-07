import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from 'expo-sqlite/kv-store';
import type { LocalePreference, SupportedLocale } from './types';
import { DEFAULT_LOCALE } from './types';

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
 * Get the effective locale based on user preference and device settings
 */
export function getEffectiveLocale(
  preference: LocalePreference,
  deviceLocale: string | null,
): SupportedLocale {
  if (preference !== 'device') {
    return preference;
  }

  // Extract language code from device locale (e.g., 'en-US' -> 'en')
  const langCode = deviceLocale?.split('-')[0]?.toLowerCase();

  // Check if device language is supported
  if (langCode === 'en' || langCode === 'es' || langCode === 'ur') {
    return langCode as SupportedLocale;
  }

  return DEFAULT_LOCALE;
}
