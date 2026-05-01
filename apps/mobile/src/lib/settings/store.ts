import { create } from 'zustand';
import AsyncStorage from 'expo-sqlite/kv-store';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Uniwind } from 'uniwind';
import { FirstDay, type FirstDayOfWeek } from '~/types';
import { DEFAULT_THEME_ID, getThemeConfig } from '~/lib/theme';
import {
  applyTitleFont,
  DEFAULT_BODY_FONT_SIZE,
  DEFAULT_TITLE_FONT_SELECTION,
  normalizeBodyFontSize,
  normalizeTitleFontSelection,
  type BodyFontSize,
  type TitleFontSelection,
} from '~/lib/theme/typography';
import {
  DEFAULT_JOURNAL_FOCUS_AREAS,
  type BuiltInJournalPromptCategoryId,
  type JournalPromptsMode,
} from '~/lib/journalPrompts';

// TODO: Implement actual functionality for all settings
// This is currently a mock store - all values are stored but not yet connected to real features

interface SettingsState {
  // Notifications
  dailyReminderEnabled: boolean;
  reminderTime: string; // HH:MM format, e.g., "09:00"

  // Profile
  profileName: string | null;
  profileEmail: string | null;
  profileImageUri: string | null;

  // Appearance
  theme: string;
  timelineEntryLength: number; // 1-50, default 10
  inspirationalQuotesEnabled: boolean;
  dateIncludesDayOfWeek: boolean;
  firstDayOfWeek: FirstDayOfWeek;
  showTimelineBorders: boolean;

  // Typography
  titleFont: TitleFontSelection;
  bodyFontSize: BodyFontSize;

  // Security
  biometricUnlockEnabled: boolean;

  // Backup
  googleDriveBackupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'on_change';

  // Privacy
  analyticsEnabled: boolean;

  // Journaling
  customWorksheetTemplate: string | null;
  journalFocusAreas: BuiltInJournalPromptCategoryId[];
  journalPromptsMode: JournalPromptsMode;

  // Hydration status
  _hasHydrated: boolean;

  // Actions
  setDailyReminderEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setProfileName: (name: string | null) => void;
  setProfileEmail: (email: string | null) => void;
  setProfileImageUri: (uri: string | null) => void;
  setTheme: (theme: string) => void;
  setTimelineEntryLength: (length: number) => void;
  setInspirationalQuotesEnabled: (enabled: boolean) => void;
  setDateIncludesDayOfWeek: (enabled: boolean) => void;
  setFirstDayOfWeek: (day: FirstDayOfWeek) => void;
  setShowTimelineBorders: (enabled: boolean) => void;
  setTitleFont: (fontId: TitleFontSelection) => void;
  setBodyFontSize: (size: BodyFontSize) => void;
  setBiometricUnlockEnabled: (enabled: boolean) => void;
  setGoogleDriveBackupEnabled: (enabled: boolean) => void;
  setBackupFrequency: (frequency: 'daily' | 'weekly' | 'on_change') => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
  setCustomWorksheetTemplate: (template: string | null) => void;
  resetCustomWorksheetTemplate: () => void;
  setJournalFocusAreas: (areas: BuiltInJournalPromptCategoryId[]) => void;
  setJournalPromptsMode: (mode: JournalPromptsMode) => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Default values
      dailyReminderEnabled: false,
      reminderTime: '09:00',
      profileName: null,
      profileEmail: null,
      profileImageUri: null,
      theme: DEFAULT_THEME_ID,
      timelineEntryLength: 10,
      inspirationalQuotesEnabled: true,
      dateIncludesDayOfWeek: false,
      firstDayOfWeek: FirstDay.MONDAY,
      showTimelineBorders: false,
      titleFont: DEFAULT_TITLE_FONT_SELECTION,
      bodyFontSize: DEFAULT_BODY_FONT_SIZE,
      biometricUnlockEnabled: false,
      googleDriveBackupEnabled: false,
      backupFrequency: 'daily',
      analyticsEnabled: false,
      customWorksheetTemplate: null,
      journalFocusAreas: DEFAULT_JOURNAL_FOCUS_AREAS,
      journalPromptsMode: 'off',
      _hasHydrated: false,

      // Actions
      setDailyReminderEnabled: (enabled) => set({ dailyReminderEnabled: enabled }),
      setReminderTime: (time) => set({ reminderTime: time }),
      setProfileName: (name) => set({ profileName: name?.trim() ? name.trim() : null }),
      setProfileEmail: (email) =>
        set({ profileEmail: email?.trim() ? email.trim() : null }),
      setProfileImageUri: (uri) =>
        set({ profileImageUri: uri?.trim() ? uri.trim() : null }),
      setTheme: (theme) => {
        const id = getThemeConfig(theme).id;
        Uniwind.setTheme(id);
        applyTitleFont(get().titleFont);
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
      setTitleFont: (fontId) => {
        const safeFontId = normalizeTitleFontSelection(fontId);
        applyTitleFont(safeFontId);
        set({ titleFont: safeFontId });
      },
      setBodyFontSize: (size) => set({ bodyFontSize: normalizeBodyFontSize(size) }),
      setBiometricUnlockEnabled: (enabled) => set({ biometricUnlockEnabled: enabled }),
      setGoogleDriveBackupEnabled: (enabled) =>
        set({ googleDriveBackupEnabled: enabled }),
      setBackupFrequency: (frequency) => set({ backupFrequency: frequency }),
      setAnalyticsEnabled: (enabled) => set({ analyticsEnabled: enabled }),
      setCustomWorksheetTemplate: (template) =>
        set({ customWorksheetTemplate: template?.trim() ? template : null }),
      resetCustomWorksheetTemplate: () => set({ customWorksheetTemplate: null }),
      setJournalFocusAreas: (areas) => set({ journalFocusAreas: areas }),
      setJournalPromptsMode: (mode) => set({ journalPromptsMode: mode }),
      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
    }),
    {
      name: 'tackbok-settings',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
          const safeThemeId = getThemeConfig(state.theme).id;
          const safeTitleFont = normalizeTitleFontSelection(state.titleFont);
          const safeBodyFontSize = normalizeBodyFontSize(state.bodyFontSize);
          Uniwind.setTheme(safeThemeId);
          if (
            state.theme !== safeThemeId ||
            state.titleFont !== safeTitleFont ||
            state.bodyFontSize !== safeBodyFontSize
          ) {
            useSettingsStore.setState({
              theme: safeThemeId,
              titleFont: safeTitleFont,
              bodyFontSize: safeBodyFontSize,
            });
          }

          applyTitleFont(safeTitleFont);
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
        profileName: state.profileName,
        profileEmail: state.profileEmail,
        profileImageUri: state.profileImageUri,
        theme: state.theme,
        timelineEntryLength: state.timelineEntryLength,
        inspirationalQuotesEnabled: state.inspirationalQuotesEnabled,
        dateIncludesDayOfWeek: state.dateIncludesDayOfWeek,
        firstDayOfWeek: state.firstDayOfWeek,
        showTimelineBorders: state.showTimelineBorders,
        titleFont: state.titleFont,
        bodyFontSize: state.bodyFontSize,
        biometricUnlockEnabled: state.biometricUnlockEnabled,
        googleDriveBackupEnabled: state.googleDriveBackupEnabled,
        backupFrequency: state.backupFrequency,
        analyticsEnabled: state.analyticsEnabled,
        customWorksheetTemplate: state.customWorksheetTemplate,
        journalFocusAreas: state.journalFocusAreas,
        journalPromptsMode: state.journalPromptsMode,
      }),
    },
  ),
);
