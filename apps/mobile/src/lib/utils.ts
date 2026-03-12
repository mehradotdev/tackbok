import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  result.setHours(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  );
  return result;
}
