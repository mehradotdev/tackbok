import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { TranslationFunction } from './types';

/**
 * Format a date string (YYYY-MM-DD) or Date object to a localized format
 * Returns: "January 1, 2022" (localized and capitalized)
 */
export function formatLocalizedDate(date: string | Date, t: TranslationFunction): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const day = format(dateObj, 'd');
  const month = t(format(dateObj, 'MMMM', { locale: enUS })); // Translate month abbreviation
  const year = format(dateObj, 'yyyy');

  let formattedDate = `${month} ${day}, ${year}`;
  // Capitalize first letter of month
  formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  return formattedDate;
}
