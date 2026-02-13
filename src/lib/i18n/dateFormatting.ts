import { format, isToday, isYesterday } from 'date-fns';
import type { TranslationFunction } from './types';
import { DAY_KEYS, MONTH_KEYS } from '~/constants';

export interface FormatDateOptions {
  /** Include the weekday (e.g., "Sunday, January 1, 2022") */
  includeWeekday?: boolean;
  /** Return "Today" or "Yesterday" if applicable */
  relative?: boolean;
}

/**
 * Helper to coerce and validate a date input.
 * Returns a valid Date object or null if invalid.
 */
function toValidDate(date: string | number | Date): Date | null {
  const dateObj =
    typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    console.error(`Invalid date provided: ${date}`);
    return null;
  }
  return dateObj;
}

/**
 * Format a date string (YYYY-MM-DD), timestamp, or Date object to a localized format
 * Uses translatable format patterns to support different locale conventions (e.g., RTL languages)
 *
 * Format patterns use placeholders:
 * - Short format (dateFormat.short): {month}, {day}, {year}
 * - Full format (dateFormat.full): {weekday}, {month}, {day}, {year}
 */
export function formatLocalizedDate(
  date: string | number | Date,
  t: TranslationFunction,
  options?: FormatDateOptions,
): string {
  const dateObj = toValidDate(date);
  if (!dateObj) return String(date);

  if (options?.relative) {
    if (isToday(dateObj)) return t('Today');
    if (isYesterday(dateObj)) return t('Yesterday');
  }

  const weekday = t(DAY_KEYS[dateObj.getDay()]);
  const month = t(MONTH_KEYS[dateObj.getMonth()]);
  const day = format(dateObj, 'd');
  const year = format(dateObj, 'yyyy');

  if (options?.includeWeekday) {
    return t('dateFormat.full', { weekday, month, day, year });
  }

  return t('dateFormat.short', { month, day, year });
}

export function formatTimeLabel(
  date: string | number | Date,
  t: TranslationFunction,
): string {
  const dateObj = toValidDate(date);
  if (!dateObj) return String(date);

  const weekday = t(DAY_KEYS[dateObj.getDay()]);
  const time = format(dateObj, 'HH:mm');
  return t('dateFormat.timeLabel', { weekday, time });
}
