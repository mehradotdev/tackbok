import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isToday, isYesterday } from 'date-fns';
import { MONTH_SHORT_KEYS, DAY_KEYS } from '~/constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateLabel(timestamp: number, t: (key: string) => string): string {
  const date = new Date(timestamp);
  if (isToday(date)) {
    return t('Today');
  } else if (isYesterday(date)) {
    return t('Yesterday');
  } else {
    const day = format(date, 'd');
    const month = t(MONTH_SHORT_KEYS[date.getMonth()]);
    const year = format(date, 'yyyy');
    return `${day} ${month}, ${year}`;
  }
}

export function formatTimeLabel(timestamp: number, t: (key: string) => string): string {
  const date = new Date(timestamp);
  const dayName = t(DAY_KEYS[date.getDay()]);
  const time = format(date, 'HH:mm');
  return `${dayName} ${t('at')} ${time}`;
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
