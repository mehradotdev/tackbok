import { type Mood } from './types';

export const MOOD_EMOJI: Record<Mood, string> = {
  AMAZING: '🤩',
  HAPPY: '🙂',
  OKAY: '😐',
  SAD: '😔',
  AWFUL: '😢',
};

export const MOOD_OPTIONS = [
  { value: 'AMAZING', emoji: MOOD_EMOJI.AMAZING, label: 'Amazing' },
  { value: 'HAPPY', emoji: MOOD_EMOJI.HAPPY, label: 'Happy' },
  { value: 'OKAY', emoji: MOOD_EMOJI.OKAY, label: 'Okay' },
  { value: 'SAD', emoji: MOOD_EMOJI.SAD, label: 'Sad' },
  { value: 'AWFUL', emoji: MOOD_EMOJI.AWFUL, label: 'Awful' },
] as const;

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

export const DAY_KEYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Separator used for tag names in the CSV tags column */
export const TAG_SEPARATOR = '|';

/** Tackbok CSV header columns */
export const TACKBOK_CSV_HEADER =
  'note_id,text_title,text_content,mood,assets,tags,created_at,updated_at';
