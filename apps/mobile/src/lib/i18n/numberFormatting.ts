import type { SupportedLocale } from './types';
import { getFormattingLocale } from './formattingLocale';

/** Display only: never use localized numbers in IDs, storage, or backup formats. */
export function formatLocalizedNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(getFormattingLocale(locale), options).format(value);
}
