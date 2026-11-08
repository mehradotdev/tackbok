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

const BYTE_UNITS = [
  { unit: 'gigabyte', fallback: 'GB', size: 1e9 },
  { unit: 'megabyte', fallback: 'MB', size: 1e6 },
  { unit: 'kilobyte', fallback: 'kB', size: 1e3 },
] as const;

/**
 * A file size for display, in decimal units like the system file browsers:
 * "640 kB", "8.4 MB". One decimal below ten units, none above.
 */
export function formatByteSize(bytes: number, locale: SupportedLocale): string {
  const scale = BYTE_UNITS.find(({ size }) => bytes >= size) ?? BYTE_UNITS[2];
  const digits = bytes / scale.size < 10 ? 1 : 0;
  // Rounded here too: Hermes on iOS ignores fraction digits in unit style.
  const value = Math.round((bytes / scale.size) * 10 ** digits) / 10 ** digits;
  const options: Intl.NumberFormatOptions = { maximumFractionDigits: digits };
  try {
    return formatLocalizedNumber(value, locale, {
      ...options,
      style: 'unit',
      unit: scale.unit,
    });
  } catch {
    // Older Intl implementations lack unit formatting.
    return `${formatLocalizedNumber(value, locale, options)} ${scale.fallback}`;
  }
}
