import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_IDS,
  type ThemeConfig,
  type ThemeId,
} from './registry';

export { DEFAULT_THEME_ID, THEMES, THEME_IDS, type ThemeConfig, type ThemeId };

/** Safe default for sheet corner radius when it isn't zero (e.g. brutalism) */
export const DEFAULT_THEME_SHEET_RADIUS = 24;

/** Get config for a theme ID (unknown/removed ids fall back to the default theme) */
export function getThemeConfig(id: string): ThemeConfig {
  return (
    THEMES.find((t) => t.id === id) ??
    THEMES.find((t) => t.id === DEFAULT_THEME_ID) ??
    THEMES[0]!
  );
}

/** Whether a theme ID maps to a dark variant */
export function isThemeDark(id: string): boolean {
  return getThemeConfig(id).variant === 'dark';
}
