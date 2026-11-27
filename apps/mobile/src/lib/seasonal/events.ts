import type { AppIconName } from '~/lib/appIcon/icons';
import type { TranslationKey } from '~/lib/i18n/types';
import type { ThemeId } from '~/lib/theme/registry';

/** A calendar day in local device time: [month 1–12, day of month]. */
export type MonthDay = readonly [month: number, day: number];

/** The short header decoration that plays with a special day's greeting. */
export type SeasonalEffect = 'snow' | 'sparkle';

export interface SeasonalDay {
  date: MonthDay;
  greeting: TranslationKey;
  emoji: string;
  effect: SeasonalEffect;
}

/**
 * The festive look an event suggests once per season ("Feeling festive?"). The
 * app never switches by itself; a switch-back is offered later only to people
 * who took a look and are still on the festive theme or icon.
 */
export interface SeasonalSuggestion {
  themes: readonly ThemeId[];
  icon: AppIconName;
  /** Last day the suggestion can appear, inside the event's window. */
  until: MonthDay;
  /** First day the switch-back can appear; it stays on offer after the window. */
  switchBackFrom: MonthDay;
}

export interface SeasonalEvent {
  /** Stable id; with the season's start year it keys once-per-season memory. */
  id: string;
  /** Inclusive local-date window. `end` may fall in the next calendar year. */
  start: MonthDay;
  end: MonthDay;
  /** Replace the everyday greeting emojis across the whole window. */
  emojis: readonly string[];
  /** Days that get their own greeting and decoration. */
  days: readonly SeasonalDay[];
  suggestion?: SeasonalSuggestion;
}

/**
 * Seasonal events, checked against the device's local date. Adding a festival
 * is one entry here (plus its greeting strings). No region targeting: everyone
 * sees every event, and the "Festive touches" setting turns them all off.
 * Kept free of React Native imports so other features (e.g. a splash variant)
 * can read it.
 */
export const SEASONAL_EVENTS: readonly SeasonalEvent[] = [
  {
    id: 'winter-holidays',
    start: [12, 1],
    end: [1, 6],
    emojis: ['🎄', '❄️', '✨', '⛄', '🎁', '🌟'],
    days: [
      {
        date: [12, 24],
        greeting: 'greeting.christmasEve',
        emoji: '🎄',
        effect: 'snow',
      },
      {
        date: [12, 25],
        greeting: 'greeting.merryChristmas',
        emoji: '🎁',
        effect: 'snow',
      },
      {
        date: [12, 31],
        greeting: 'greeting.newYearsEve',
        emoji: '✨',
        effect: 'sparkle',
      },
      {
        date: [1, 1],
        greeting: 'greeting.happyNewYear',
        emoji: '🎉',
        effect: 'sparkle',
      },
    ],
    suggestion: {
      themes: ['christmas', 'new-year'],
      icon: 'Christmas',
      until: [12, 26],
      switchBackFrom: [1, 2],
    },
  },
];

const ordinal = ([month, day]: MonthDay) => month * 100 + day;

export function inWindow(date: Date, start: MonthDay, end: MonthDay) {
  const today = ordinal([date.getMonth() + 1, date.getDate()]);
  const from = ordinal(start);
  const to = ordinal(end);
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

export function activeSeasonalEvent(
  date: Date,
  events: readonly SeasonalEvent[] = SEASONAL_EVENTS,
): SeasonalEvent | null {
  return events.find((event) => inWindow(date, event.start, event.end)) ?? null;
}

export function seasonalDay(
  date: Date,
  events: readonly SeasonalEvent[] = SEASONAL_EVENTS,
): SeasonalDay | null {
  const event = activeSeasonalEvent(date, events);
  const month = date.getMonth() + 1;
  return (
    event?.days.find(({ date: [m, d] }) => m === month && d === date.getDate()) ?? null
  );
}

/**
 * Identifies one occurrence of an event, e.g. `winter-holidays-2026` for both
 * 20 Dec 2026 and 3 Jan 2027, so "once per season" survives the year change.
 * Only meaningful for a date inside the event's window (check
 * `activeSeasonalEvent` first); outside it the key names a neighbouring season.
 */
export function seasonKey(event: SeasonalEvent, date: Date) {
  const month = date.getMonth() + 1;
  const wraps = ordinal(event.start) > ordinal(event.end);
  const startYear =
    wraps && ordinal([month, date.getDate()]) <= ordinal(event.end)
      ? date.getFullYear() - 1
      : date.getFullYear();
  return `${event.id}-${startYear}`;
}
