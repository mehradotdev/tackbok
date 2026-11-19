import { ALL_SUPPORTED_LOCALES, type LocalePreference } from '~/lib/i18n/types';
import { THEME_IDS, type ThemeId } from '~/lib/theme/themes';
import {
  BODY_FONT_SIZES,
  DEFAULT_TITLE_FONT_SELECTION,
  isKnownTitleFontId,
  type BodyFontSize,
  type TitleFontSelection,
} from '~/lib/theme/typography';

/** Launch-argument key on iOS and query parameter in the launch URL. */
export const DEV_SETUP_KEY = 'tackbokDevSetup';

export interface DevSetup {
  reset?: true;
  /** File name of a Tackbok backup ZIP in the device's dev-setup folder. */
  restore?: string;
  theme?: ThemeId;
  fontSize?: BodyFontSize;
  titleFont?: TitleFontSelection;
  locale?: LocalePreference;
  onboarding?: 'done' | 'show';
  coachMarks?: boolean;
  greeting?: boolean;
  betaBadge?: boolean;
  /** Absolute route path, for example `/insights`. */
  screen?: string;
}

const ON_OFF: Record<string, boolean> = { on: true, off: false };

/**
 * Parses `key=value` pairs separated by commas, for example
 * `theme=dark,fontSize=large,onboarding=done`. Commas instead of `&` keep the
 * value intact through `adb shell am start`, which runs a device shell.
 * Unknown keys and values are reported, not guessed.
 */
export function parseDevSetup(raw: string): { setup: DevSetup; errors: string[] } {
  const setup: DevSetup = {};
  const errors: string[] = [];
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    const key = (separator === -1 ? trimmed : trimmed.slice(0, separator)).trim();
    const value = separator === -1 ? '' : trimmed.slice(separator + 1).trim();
    const invalid = () => errors.push(`${key}: unsupported value "${value}"`);
    switch (key) {
      case 'reset':
        if (value === '1' || value === 'on') setup.reset = true;
        else invalid();
        break;
      case 'restore':
        // A bare file name: the folder is fixed per platform.
        if (/^[\w.-]+\.zip$/i.test(value)) setup.restore = value;
        else invalid();
        break;
      case 'theme':
        if ((THEME_IDS as readonly string[]).includes(value)) {
          setup.theme = value as ThemeId;
        } else invalid();
        break;
      case 'fontSize':
        if ((BODY_FONT_SIZES as readonly string[]).includes(value)) {
          setup.fontSize = value as BodyFontSize;
        } else invalid();
        break;
      case 'titleFont':
        if (value === DEFAULT_TITLE_FONT_SELECTION || isKnownTitleFontId(value)) {
          setup.titleFont = value;
        } else invalid();
        break;
      case 'locale':
        if (
          value === 'device' ||
          (ALL_SUPPORTED_LOCALES as readonly string[]).includes(value)
        ) {
          setup.locale = value as LocalePreference;
        } else invalid();
        break;
      case 'onboarding':
        if (value === 'done' || value === 'show') setup.onboarding = value;
        else invalid();
        break;
      case 'coachMarks':
      case 'greeting':
      case 'betaBadge':
        if (value === 'on' || value === 'off') setup[key] = ON_OFF[value];
        else invalid();
        break;
      case 'run':
        // Any token: a new one makes the same settings apply again.
        if (!/^[\w.-]+$/.test(value)) invalid();
        break;
      case 'screen':
        if (/^(\/[\w-]+)+$/.test(value)) setup.screen = value;
        else invalid();
        break;
      default:
        errors.push(`unknown setting "${key}"`);
    }
  }
  return { setup, errors };
}

/** Reads the setup string from a launch URL such as `tackbok-beta://?tackbokDevSetup=…`. */
export function getDevSetupFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = new RegExp(`[?&]${DEV_SETUP_KEY}=([^&#]*)`).exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}
