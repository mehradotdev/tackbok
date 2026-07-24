export const MOODS = ['AMAZING', 'HAPPY', 'OKAY', 'SAD', 'AWFUL'] as const;
export type Mood = (typeof MOODS)[number];

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

/** Global names for TrueSheet to allow invocation from anywhere */
export const SHEET_NAMES = {
  MOOD: 'mood-sheet',
  TAGS: 'tags-sheet',
  VOICE_MEMO: 'voice-memo-sheet',
  PROMPT_LIBRARY: 'prompt-library-sheet',
  PROMPT_FORM: 'prompt-form-sheet',
  WORKSHEET_TEMPLATE: 'worksheet-template-sheet',
  THEME_PICKER: 'theme-picker-sheet',
  JOURNAL_FOCUS_AREAS: 'journal-focus-areas-sheet',
  FONT_PICKER: 'font-picker-sheet',
  ONBOARDING_IMPORT: 'onboarding-import-sheet',
  ANALYTICS_DETAILS: 'analytics-details-sheet',
} as const;

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

/** Directory within the app's document storage where photos are persisted */
export const PHOTOS_DIR_NAME = 'photos';

/** Directory within the app's document storage where voice memos are persisted */
export const VOICE_MEMOS_DIR_NAME = 'voice_memos';

/** Maximum dimension (width or height) for compressed photos */
export const PHOTO_MAX_DIMENSION = 1280;

/** JPEG compression quality (0–1) for saved photos */
export const PHOTO_QUALITY = 0.7;

/** Maximum number of photos allowed per entry for performance reasons */
export const MAX_PHOTOS_PER_ENTRY = 10;

/** Maximum number of voice memos allowed per entry for performance reasons */
export const MAX_VOICE_MEMOS_PER_ENTRY = 3;

/** Separator used for tag names in the CSV tags column */
export const TAG_SEPARATOR = '|';

/** Number of seconds the "Delete All Data" button stays disabled after the dialog opens */
export const DELETE_CONFIRM_DELAY_SECONDS = 11;
