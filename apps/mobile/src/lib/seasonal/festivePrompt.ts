import type { AppIconName } from '~/lib/appIcon/icons';
import {
  activeSeasonalEvent,
  inWindow,
  seasonKey,
  SEASONAL_EVENTS,
  type MonthDay,
  type SeasonalEvent,
  type SeasonalSuggestion,
} from './events';

/** The look someone had when they took up a festive suggestion. */
export interface FestiveSwitch {
  season: string;
  theme: string;
  icon: AppIconName;
  /** Local midnight (epoch ms) from which the switch-back may be offered. */
  offerFrom: number;
}

export interface FestiveLook {
  festiveTouchesEnabled: boolean;
  /** Season key of the last suggestion shown on this device. */
  festivePromptSeason: string | null;
  festiveSwitch: FestiveSwitch | null;
  theme: string;
  icon: AppIconName;
}

export type FestivePrompt =
  | {
      kind: 'suggest';
      season: string;
      suggestion: SeasonalSuggestion;
    }
  | {
      kind: 'switchBack';
      /** What to restore; null leaves that part as it is. */
      theme: string | null;
      icon: AppIconName | null;
    }
  /** The saved look is spent (the festive look is gone) or from an earlier season. */
  | { kind: 'forget' };

const ordinal = ([month, day]: MonthDay) => month * 100 + day;

const isFestiveTheme = (suggestion: SeasonalSuggestion, theme: string) =>
  (suggestion.themes as readonly string[]).includes(theme);

/** Which festive prompt, if any, is due at `now`. */
export function festivePromptFor(
  now: Date,
  look: FestiveLook,
  events: readonly SeasonalEvent[] = SEASONAL_EVENTS,
): FestivePrompt | null {
  if (!look.festiveTouchesEnabled) return null;

  const saved = look.festiveSwitch;
  if (saved) {
    // A later season has begun: last season's look is no longer the one to offer.
    const current = activeSeasonalEvent(now, events);
    if (current?.suggestion && seasonKey(current, now) !== saved.season) {
      return { kind: 'forget' };
    }
    if (now.getTime() < saved.offerFrom) return null;
    // Season keys are `<event id>-<start year>`.
    const eventId = saved.season.slice(0, saved.season.lastIndexOf('-'));
    const suggestion = events.find((event) => event.id === eventId)?.suggestion;
    const theme =
      suggestion && isFestiveTheme(suggestion, look.theme) && look.theme !== saved.theme
        ? saved.theme
        : null;
    const icon =
      suggestion?.icon === look.icon && look.icon !== saved.icon ? saved.icon : null;
    return theme || icon ? { kind: 'switchBack', theme, icon } : { kind: 'forget' };
  }

  const event = activeSeasonalEvent(now, events);
  const suggestion = event?.suggestion;
  if (!event || !suggestion || !inWindow(now, event.start, suggestion.until)) return null;
  const season = seasonKey(event, now);
  if (look.festivePromptSeason === season) return null;
  // Already festive: nothing to suggest.
  if (isFestiveTheme(suggestion, look.theme) || look.icon === suggestion.icon) {
    return null;
  }
  return { kind: 'suggest', season, suggestion };
}

/** Remembers the current look when someone takes up the suggestion at `now`. */
export function festiveSwitchFrom(
  now: Date,
  prompt: Extract<FestivePrompt, { kind: 'suggest' }>,
  look: Pick<FestiveLook, 'theme' | 'icon'>,
): FestiveSwitch {
  const [month, day] = prompt.suggestion.switchBackFrom;
  // The first such day after now: 2 Jan follows a December suggestion.
  let offer = new Date(now.getFullYear(), month - 1, day);
  if (ordinal([month, day]) <= ordinal([now.getMonth() + 1, now.getDate()])) {
    offer = new Date(now.getFullYear() + 1, month - 1, day);
  }
  return {
    season: prompt.season,
    theme: look.theme,
    icon: look.icon,
    offerFrom: offer.getTime(),
  };
}
