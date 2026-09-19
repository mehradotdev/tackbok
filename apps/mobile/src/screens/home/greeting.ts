import { collectGraphemes } from 'unicode-segmenter/grapheme';

export const WEEKDAY_GREETINGS = [
  'Happy Sunday',
  'Happy Monday',
  'Happy Tuesday',
  'Happy Wednesday',
  'Happy Thursday',
  'Happy Friday',
  'Happy Saturday',
] as const;

export function chooseGreeting(
  date: Date,
  previous: string | null,
  random = Math.random,
) {
  const hour = date.getHours();
  const time = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const choices = [time, WEEKDAY_GREETINGS[date.getDay()]].filter(
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
