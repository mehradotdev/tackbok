import type { SupportedLocale } from './types';

/**
 * Format a number using the active app language's grouping conventions
 * (e.g. de → "1.234", en → "1,234") instead of the device locale, so numbers
 * read correctly next to translated labels.
 *
 * Digits are pinned to Latin (`-u-nu-latn`): plain `ar` would switch to
 * Eastern Arabic-Indic digits, while dates and interpolated counts elsewhere
 * in the app always render Latin digits.
 */
export function formatLocalizedNumber(value: number, locale: SupportedLocale): string {
  return value.toLocaleString(`${locale}-u-nu-latn`);
}
