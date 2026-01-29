import { format } from 'date-fns';
import type { TranslationFunction } from './types';
import { MONTH_KEYS } from '~/constants';

/**
 * Format a date string (YYYY-MM-DD) or Date object to a localized format
 * Returns: "January 1, 2022" (localized and capitalized)
 */
export function formatLocalizedDate(date: string | Date, t: TranslationFunction): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Validate the date object
  if (isNaN(dateObj.getTime())) {
    console.error(`Invalid date provided: ${date}`);
    return String(date); // Return the original date string if invalid
  }

  const day = format(dateObj, 'd');
  const month = t(MONTH_KEYS[dateObj.getMonth()]); // Translate month name
  const year = format(dateObj, 'yyyy');
  const formattedDate = `${month} ${day}, ${year}`;

  return formattedDate;
}
