import { isToday, isYesterday } from 'date-fns';
import { getCalendars } from 'expo-localization';
import type { SupportedLocale, TranslationFunction } from './types';
import { getFormattingLocale } from './formattingLocale';

export interface FormatDateOptions {
  includeWeekday?: boolean;
  relative?: boolean;
}

function toValidDate(date: string | number | Date): Date | null {
  // Date-only journal values represent a local day, not UTC midnight.
  const dateObj =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00`)
      : new Date(date);
  return Number.isNaN(dateObj.getTime()) ? null : dateObj;
}

/** Localized display only. Storage and archive date formats stay machine-readable. */
export function formatLocalizedDate(
  date: string | number | Date,
  t: TranslationFunction,
  options?: FormatDateOptions,
): string {
  const value = toValidDate(date);
  if (!value) return String(date);
  if (options?.relative) {
    if (isToday(value)) return t('calendar.today');
    if (isYesterday(value)) return t('calendar.yesterday');
  }
  return new Intl.DateTimeFormat(
    t.formattingLocale ?? getFormattingLocale(t.locale ?? 'en'),
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(options?.includeWeekday ? { weekday: 'long' } : {}),
    },
  ).format(value);
}

export function formatLocalizedTime(
  date: Date,
  locale: SupportedLocale,
  options?: { hourOnly?: boolean },
): string {
  const uses24hourClock = getCalendars()[0]?.uses24hourClock;
  return new Intl.DateTimeFormat(getFormattingLocale(locale), {
    hour: 'numeric',
    ...(options?.hourOnly ? {} : { minute: '2-digit' as const }),
    ...(uses24hourClock == null ? {} : { hour12: !uses24hourClock }),
  }).format(date);
}

export function formatTimeLabel(
  date: string | number | Date,
  t: TranslationFunction,
): string {
  const value = toValidDate(date);
  if (!value) return String(date);
  const locale = t.locale ?? 'en';
  const weekday = new Intl.DateTimeFormat(getFormattingLocale(locale), {
    weekday: 'long',
  }).format(value);
  return t('dateFormat.timeLabel', { weekday, time: formatLocalizedTime(value, locale) });
}
