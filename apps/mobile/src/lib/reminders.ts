import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getLocales } from 'expo-localization';
import { router, type Href } from 'expo-router';
import { useSettingsStore } from '~/lib/settings';
import {
  getEffectiveSupportedLocale,
  translate,
  useLocaleStore,
  type SupportedLocale,
  type TranslationFunction,
} from '~/lib/i18n';
import { getBuiltInJournalPromptTitles } from '~/lib/journalPrompts';

/**
 * Daily reminder — a single repeating local notification driven by the
 * `dailyReminderEnabled` / `reminderTime` settings. No push/remote involved.
 *
 * Notification text is baked at schedule time, so anything that changes it
 * (language, focus areas, time) must trigger a reschedule. `resyncReminder()`
 * runs on every app launch and on language change to keep reality matching
 * the persisted settings.
 */

const DAILY_REMINDER_ID = 'daily-reminder';
const ANDROID_CHANNEL_ID = 'daily-reminder';
const NEW_ENTRY_ROUTE = '/gratitudeEntry';

function getCurrentLocale(): SupportedLocale {
  const deviceLocale = getLocales()[0]?.languageTag ?? null;
  return getEffectiveSupportedLocale(
    deviceLocale,
    useLocaleStore.getState().localePreference,
  );
}

function parseReminderTime(time: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 9, minute: 0 };
  }
  return { hour, minute };
}

function isPermissionGranted(settings: Notifications.NotificationPermissionsStatus) {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function hasReminderPermission(): Promise<boolean> {
  return isPermissionGranted(await Notifications.getPermissionsAsync());
}

/**
 * Returns true when notifications are (or become) allowed. Safe to call
 * repeatedly; only prompts while the OS still allows asking.
 */
export async function requestReminderPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(existing)) {
    return true;
  }
  if (!existing.canAskAgain) {
    return false;
  }
  return isPermissionGranted(await Notifications.requestPermissionsAsync());
}

async function ensureAndroidChannel(locale: SupportedLocale) {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: translate(locale, 'Daily Reminder'),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function buildReminderContent(locale: SupportedLocale) {
  const t: TranslationFunction = (key, params) => translate(locale, key, params);
  const pool = getBuiltInJournalPromptTitles(
    t,
    useSettingsStore.getState().journalFocusAreas,
  );
  const body =
    pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : t('What are you grateful for today?');
  return {
    title: t('Daily Reminder'),
    body,
    // Carry the prompt into the tap target so the entry editor opens with the
    // exact question the user tapped, not a fresh random one.
    data: { url: `${NEW_ENTRY_ROUTE}?promptTitle=${encodeURIComponent(body)}` },
  };
}

/**
 * (Re)schedules the repeating daily reminder at `time` (HH:mm). Uses a fixed
 * identifier and cancels first, so calling it any number of times leaves
 * exactly one scheduled reminder.
 */
export async function scheduleDailyReminder(time: string): Promise<void> {
  const { hour, minute } = parseReminderTime(time);
  const locale = getCurrentLocale();
  await ensureAndroidChannel(locale);
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: buildReminderContent(locale),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
}

/**
 * Makes the OS schedule match the persisted settings. Heals OS reboots,
 * reinstall-with-restored-settings, missed reschedules, and permission
 * revoked behind our back (in which case the toggle flips off).
 */
export async function resyncReminder(): Promise<void> {
  const { dailyReminderEnabled, reminderTime, setDailyReminderEnabled } =
    useSettingsStore.getState();

  if (!dailyReminderEnabled) {
    await cancelDailyReminder();
    return;
  }

  if (!(await hasReminderPermission())) {
    setDailyReminderEnabled(false);
    await cancelDailyReminder();
    return;
  }

  await scheduleDailyReminder(reminderTime);
}

let remindersInitialized = false;

/**
 * One-time bootstrap: suppress the reminder while the app is foregrounded,
 * resync the schedule with settings, and re-bake notification text when the
 * language changes. Call once after both settings and locale stores hydrate.
 */
export function initReminders(): void {
  if (remindersInitialized) {
    return;
  }
  remindersInitialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  useLocaleStore.subscribe((state, prev) => {
    if (state.localePreference !== prev.localePreference) {
      void resyncReminder();
    }
  });

  void resyncReminder();
}

function redirectFromNotification(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) {
    router.push(url as Href);
  }
}

/**
 * Navigates to the new-entry screen when the app is opened from a reminder
 * tap — cold start (last response) and warm/background taps (listener).
 * Render inside the root navigator so navigation targets a mounted router.
 */
export function useReminderTapObserver(): void {
  useEffect(() => {
    let isMounted = true;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (isMounted) {
        redirectFromNotification(response);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      redirectFromNotification,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);
}
