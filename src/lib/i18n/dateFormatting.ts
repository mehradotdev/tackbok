import { format } from 'date-fns';
import type { TranslationFunction } from './types';
import { DAY_KEYS, MONTH_KEYS } from '~/constants';

export interface FormatDateOptions {
  /** Include the weekday (e.g., "Sunday, January 1, 2022") */
  includeWeekday?: boolean;
}

/**
 * Format a date string (YYYY-MM-DD) or Date object to a localized format
 * Uses translatable format patterns to support different locale conventions (e.g., RTL languages)
 *
 * Format patterns use placeholders:
 * - Short format (dateFormat.short): {month}, {day}, {year}
 * - Full format (dateFormat.full): {weekday}, {month}, {day}, {year}
 */
export function formatLocalizedDate(
  date: string | Date,
  t: TranslationFunction,
  options?: FormatDateOptions,
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Validate the date object
  if (isNaN(dateObj.getTime())) {
    console.error(`Invalid date provided: ${date}`);
    return String(date);
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
