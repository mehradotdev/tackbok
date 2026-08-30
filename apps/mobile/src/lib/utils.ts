import { TAG_SEPARATOR } from '~/constants';

/**
 * Combine a calendar date with the current wall-clock time.
 * Useful when back-dating an entry so it doesn't default to midnight (00:00:00),
 * ensuring the entry captures "when" it was written on that specific day.
 */
export function combineDateWithCurrentTime(date: Date): Date {
  const now = new Date();
  const result = new Date(date);
  result.setHours(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );
  return result;
}

/**
 * Sanitizes a tag name to ensure compatibility with CSV exports.
 * Removes commas and tag separators (pipes).
 */
export function sanitizeTagName(name: string): string {
  return name.replace(new RegExp(`[,${TAG_SEPARATOR}]`, 'g'), ' ').trim();
}

/**
 * Sanitizes a custom prompt title for storage and duplicate comparison.
 */
export function sanitizePromptTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}
