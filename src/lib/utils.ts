import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isToday, isYesterday } from 'date-fns';
import { getLocales } from 'expo-localization';
import { MONTH_SHORT_KEYS, DAY_KEYS } from '~/constants';
import { useLocaleStore, translate, getEffectiveSupportedLocale } from '~/lib/i18n';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function t(key: string): string {
  const { localePreference } = useLocaleStore.getState();
  const deviceLocale = getLocales()[0]?.languageTag ?? null;
  const locale = getEffectiveSupportedLocale(deviceLocale, localePreference);
  return translate(locale, key);
}

export function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  if (isToday(date)) {
    return t('Today');
  } else if (isYesterday(date)) {
    return t('Yesterday');
  } else {
    const day = format(date, 'd');
    const month = t(MONTH_SHORT_KEYS[date.getMonth()]);
    const year = format(date, 'yyyy');
    return `${day} ${month}, ${year}`;
  }
}

export function formatTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const dayName = t(DAY_KEYS[date.getDay()]);
  const time = format(date, 'HH:mm');
  return `${dayName} ${t('at')} ${time}`;
}

/**
 * Generate a UUID v4
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Combine a calendar date with the current wall-clock time.
 * Useful when back-dating an entry so it doesn't default to midnight (00:00:00),
 * ensuring the entry captures "when" it was written on that specific day.
 */
export function combineDateWithCurrentTime(date: Date): Date {
  const now = new Date();
  const result = new Date(date);
  result.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  return result;
}
