import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from 'expo-sqlite/kv-store';

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
  firstDayOfWeek: 'saturday' | 'sunday' | 'monday';
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
  setFirstDayOfWeek: (day: 'saturday' | 'sunday' | 'monday') => void;
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
      theme: 'default',
      timelineEntryLength: 10,
      inspirationalQuotesEnabled: true,
      dateIncludesDayOfWeek: false,
      firstDayOfWeek: 'sunday',
      showTimelineBorders: false,
      biometricUnlockEnabled: false,
      googleDriveBackupEnabled: false,
      backupFrequency: 'daily',
      analyticsEnabled: false,
      _hasHydrated: false,

      // Actions
      setDailyReminderEnabled: (enabled) => set({ dailyReminderEnabled: enabled }),
      setReminderTime: (time) => set({ reminderTime: time }),
      setTheme: (theme) => set({ theme }),
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
        } else {
          console.warn('Settings store rehydration failed');
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
