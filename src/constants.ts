import { type Mood } from './types';

export const MOOD_EMOJI: Record<Mood, string> = {
  RAD: '😄',
  GOOD: '🙂',
  MEH: '😐',
  BAD: '😔',
  AWFUL: '😢',
};

/*
 * Android crash fix:
 * We need to close the modal FIRST, wait for the exit animation to likely finish (or at least start),
 * and THEN trigger the parent callback. This avoids the "SafeAreaProvider contains null child"
 * crash that happens when navigation/state updates occur simultaneously with exit animations.
 */
export const MODAL_CLOSE_DELAY = 200;

export const MONTH_KEYS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MONTH_SHORT_KEYS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;
