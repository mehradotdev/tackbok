import { create, type StoreApi } from 'zustand';
import { I18nManager } from 'react-native';
import { getLocales } from 'expo-localization';
import { persist, createJSONStorage } from 'zustand/middleware';
import { kvStorage as Storage } from '~/lib/kvStorage';
import type { LocalePreference, SupportedLocale } from './types';
import {
  ALL_SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  RTL_LOCALES,
  SUPPORTED_LANG_CODES,
} from './types';

interface LocaleState {
  /**
   * User's locale preference
   * Can be a specific locale or 'device' for auto-detection
   */
  localePreference: LocalePreference;

  /**
   * Whether the store has been hydrated from SQLite storage
   */
  _hasHydrated: boolean;

  /**
   * Set the locale preference
   */
  setLocalePreference: (locale: LocalePreference) => Promise<void>;

  /**
   * Internal: mark store as hydrated
   */
  setHasHydrated: (hydrated: boolean) => void;
}

function createLocaleStore() {
  // This setter bypasses persistence: recovery must not overwrite a preference
  // that could still be readable on the next launch.
  let setRuntimeState!: StoreApi<LocaleState>['setState'];
  const persisted = persist<LocaleState, [], [], Pick<LocaleState, 'localePreference'>>(
    (set, get) => ({
      localePreference: 'device',
      _hasHydrated: false,

      // Persist's set returns the storage write. RTL restarts must await it.
      setLocalePreference: async (locale) => {
        const previous = get().localePreference;
        try {
          await set({ localePreference: locale });
        } catch (error) {
          // Persist updates memory before writing. Restore the visible language
          // if saving fails, even when the rollback write also cannot complete.
          try {
            await set({ localePreference: previous });
          } catch {
            // The in-memory rollback has already happened.
          }
          throw error;
        }
      },

      setHasHydrated: (hydrated) => setRuntimeState({ _hasHydrated: hydrated }),
    }),
    {
      name: 'tackbok-locale',
      // Share the async initialization lock with the settings store. Mixing sync
      // and async opens can replace a handle and close the pooled Android database.
      storage: createJSONStorage(() => ({
        ...Storage,
        async getItem(name) {
          try {
            return await Storage.getItem(name);
          } catch (cause) {
            // Only JSON parsing errors may trigger corrupt-data cleanup below.
            throw new Error('Locale storage read failed', { cause });
          }
        },
      })),
      onRehydrateStorage: () => (state, error) => {
        if (state) {
          state.setHasHydrated(true);
          return;
        }
        console.warn('Locale hydration failed:', error);
        setRuntimeState((current) => ({
          localePreference: getRecoveryLocale(current.localePreference),
          _hasHydrated: true,
        }));
        // Invalid JSON is corrupt data; an unavailable database is not. Cleanup
        // is best effort and must never delay startup or reject unhandled.
        if (error instanceof SyntaxError) {
          void Storage.removeItem('tackbok-locale').catch(() => {});
        }
      },
      partialize: (state) => ({ localePreference: state.localePreference }),
    },
  );
  const creator: typeof persisted = (set, get, api) => {
    setRuntimeState = set;
    return persisted(set, get, api);
  };
  return create<LocaleState>()(creator);
}

export const useLocaleStore = createLocaleStore();

function getRecoveryLocale(preference: LocalePreference): SupportedLocale {
  const tags = getLocales().map(({ languageTag }) => languageTag);
  const preferred = getEffectiveSupportedLocale(tags, preference);
  if (RTL_LOCALES.includes(preferred) === I18nManager.isRTL) return preferred;
  const device = getEffectiveLocale(
    tags.filter((tag) => {
      const locale = getEffectiveLocale(tag);
      return locale !== null && RTL_LOCALES.includes(locale) === I18nManager.isRTL;
    }),
  );
  // With no readable preference or matching device language, the native direction
  // is all we know. Use Arabic for RTL and English for LTR for this session only.
  return device ?? (I18nManager.isRTL ? 'ar' : DEFAULT_LOCALE);
}

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
