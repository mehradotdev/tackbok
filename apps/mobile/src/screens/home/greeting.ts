import type { TranslationKey } from '~/lib/i18n/types';
import { collectGraphemes } from 'unicode-segmenter/grapheme';

export const GREETING_EMOJIS = [
  '😊',
  '🙏',
  '😄',
  '😇',
  '🙂',
  '👋',
  '🌻',
  '✨',
  '💛',
  '🌿',
] as const;

const NIGHT_EMOJIS = ['😪', '😴'] as const;

export function chooseGreetingEmoji(greeting: TranslationKey, random = Math.random) {
  const emojis = greeting === 'greeting.goodNight' ? NIGHT_EMOJIS : GREETING_EMOJIS;
  return emojis[Math.floor(random() * emojis.length)];
}

export const WEEKDAY_GREETINGS = [
  'greeting.happySunday',
  'greeting.happyMonday',
  'greeting.happyTuesday',
  'greeting.happyWednesday',
  'greeting.happyThursday',
  'greeting.happyFriday',
  'greeting.happySaturday',
] as const;

export function chooseGreeting(
  date: Date,
  previous: string | null,
  random = Math.random,
) {
  const hour = date.getHours();
  const weekday = WEEKDAY_GREETINGS[date.getDay()];
  // This window has only one eligible greeting, so allow consecutive repeats.
  if (hour >= 3 && hour < 5) return weekday;

  const time =
    hour >= 5 && hour < 12
      ? 'greeting.goodMorning'
      : hour >= 12 && hour < 17
        ? 'greeting.goodAfternoon'
        : hour >= 17 && hour < 22
          ? 'greeting.goodEvening'
          : 'greeting.goodNight';
  const choices: TranslationKey[] = ([time, weekday] as const).filter(
    (key) => key !== previous,
  );
  return choices[Math.floor(random() * choices.length)];
}

/** Keep contextual shaping intact, including connected-script names in an English UI. */
export function greetingUnits(text: string): string[] {
  if (/[\u0600-\u08ff\u0900-\u109f\u1780-\u17ff\ua840-\ua87f]/u.test(text)) {
    return text.match(/\S+\s*/gu) ?? [text];
  }
  // Use the same Unicode segmentation on Hermes and in tests, without Intl support.
  return collectGraphemes(text);
}

export function fitGreeting(widths: number[], available: number, ellipsisWidth: number) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const scale = Math.max(0.8, Math.min(1, available / (total || 1)));
  if (total * scale <= available)
    return { scale, count: widths.length, truncated: false };
  let used = ellipsisWidth;
  let count = 0;
  while (count < widths.length && (used + widths[count]) * scale <= available) {
    used += widths[count++];
  }
  return { scale, count, truncated: true };
}
