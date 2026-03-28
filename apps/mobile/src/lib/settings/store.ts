import { create } from 'zustand';
import AsyncStorage from 'expo-sqlite/kv-store';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Uniwind } from 'uniwind';
import { FirstDay, type FirstDayOfWeek } from '~/types';
import { DEFAULT_THEME_ID, getThemeConfig } from '~/lib/theme';

// TODO: Implement actual functionality for all settings
// This is currently a mock store - all values are stored but not yet connected to real features

interface SettingsState {
  // Notifications
  dailyReminderEnabled: boolean;
  reminderTime: string; // HH:MM format, e.g., "09:00"

  // Appearance
  theme: string;
  timelineEntryLength: number; // 1-50, default 10
  inspirationalQuotesEnabled: boolean;
  dateIncludesDayOfWeek: boolean;
  firstDayOfWeek: FirstDayOfWeek;
  showTimelineBorders: boolean;

  // Security
  biometricUnlockEnabled: boolean;

  // Backup
  googleDriveBackupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'on_change';

  // Privacy
  analyticsEnabled: boolean;

  // Hydration status
  _hasHydrated: boolean;

  // Actions
  setDailyReminderEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setTheme: (theme: string) => void;
  setTimelineEntryLength: (length: number) => void;
  setInspirationalQuotesEnabled: (enabled: boolean) => void;
  setDateIncludesDayOfWeek: (enabled: boolean) => void;
  setFirstDayOfWeek: (day: FirstDayOfWeek) => void;
  setShowTimelineBorders: (enabled: boolean) => void;
  setBiometricUnlockEnabled: (enabled: boolean) => void;
  setGoogleDriveBackupEnabled: (enabled: boolean) => void;
  setBackupFrequency: (frequency: 'daily' | 'weekly' | 'on_change') => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      dailyReminderEnabled: false,
      reminderTime: '09:00',
      theme: DEFAULT_THEME_ID,
      timelineEntryLength: 10,
      inspirationalQuotesEnabled: true,
      dateIncludesDayOfWeek: false,
      firstDayOfWeek: FirstDay.MONDAY,
      showTimelineBorders: false,
      biometricUnlockEnabled: false,
      googleDriveBackupEnabled: false,
      backupFrequency: 'daily',
      analyticsEnabled: false,
      _hasHydrated: false,

      // Actions
      setDailyReminderEnabled: (enabled) => set({ dailyReminderEnabled: enabled }),
      setReminderTime: (time) => set({ reminderTime: time }),
      setTheme: (theme) => {
        const id = getThemeConfig(theme).id;
        Uniwind.setTheme(id);
        set({ theme: id });
      },
      setTimelineEntryLength: (length) => {
        const safeLength = Math.max(1, Math.min(50, length));
        set({ timelineEntryLength: safeLength });
      },
      setInspirationalQuotesEnabled: (enabled) =>
        set({ inspirationalQuotesEnabled: enabled }),
      setDateIncludesDayOfWeek: (enabled) => set({ dateIncludesDayOfWeek: enabled }),
      setFirstDayOfWeek: (day) => set({ firstDayOfWeek: day }),
      setShowTimelineBorders: (enabled) => set({ showTimelineBorders: enabled }),
      setBiometricUnlockEnabled: (enabled) => set({ biometricUnlockEnabled: enabled }),
      setGoogleDriveBackupEnabled: (enabled) =>
        set({ googleDriveBackupEnabled: enabled }),
      setBackupFrequency: (frequency) => set({ backupFrequency: frequency }),
      setAnalyticsEnabled: (enabled) => set({ analyticsEnabled: enabled }),
      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
    }),
    {
      name: 'tackbok-settings',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
          // If the persisted theme is no longer valid (e.g., 'default'), map it.
          // Use setTheme (not direct mutation): a partial set above replaces the store
          // object, so mutating this callback's `state` would not update subscribers
          // or persist; setTheme also keeps Uniwind in sync.
          const safeThemeId = getThemeConfig(state.theme).id;
          state.setTheme(safeThemeId);
        } else {
          console.warn('Settings store rehydration failed');
          // `state` is unavailable here (persisted merge failed), so we cannot call
          // `state.setHasHydrated` — use the live store handle instead.
          useSettingsStore.getState().setHasHydrated(true);
        }
      },
      partialize: (state) => ({
        dailyReminderEnabled: state.dailyReminderEnabled,
        reminderTime: state.reminderTime,
        theme: state.theme,
        timelineEntryLength: state.timelineEntryLength,
        inspirationalQuotesEnabled: state.inspirationalQuotesEnabled,
        dateIncludesDayOfWeek: state.dateIncludesDayOfWeek,
        firstDayOfWeek: state.firstDayOfWeek,
        showTimelineBorders: state.showTimelineBorders,
        biometricUnlockEnabled: state.biometricUnlockEnabled,
        googleDriveBackupEnabled: state.googleDriveBackupEnabled,
        backupFrequency: state.backupFrequency,
        analyticsEnabled: state.analyticsEnabled,
      }),
    },
  ),
);
