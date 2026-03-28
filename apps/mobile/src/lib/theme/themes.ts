/**
 * All available themes.
 * Each must have a matching @variant block in global.css and be listed
 * in metro.config.js extraThemes (plus light/dark).
 */
export const THEMES = [
  { id: 'light', name: 'Light', variant: 'light' },
  { id: 'dark', name: 'Dark', variant: 'dark' },
  { id: 'lavender', name: 'Lavender', variant: 'light' },
  { id: 'forest', name: 'Forest', variant: 'dark' },
  { id: 'bubblegum', name: 'Bubblegum', variant: 'light' },
  { id: 'hecker', name: 'Hecker', variant: 'dark' },
  { id: 'peach', name: 'Peach', variant: 'light' },
  { id: 'ember', name: 'Ember', variant: 'dark' },
  { id: 'ocean', name: 'Ocean', variant: 'light' },
  { id: 'navy', name: 'Navy', variant: 'dark' },
  { id: 'sakura', name: 'Sakura', variant: 'light' },
  { id: 'slate', name: 'Slate', variant: 'dark' },
  { id: 'kela', name: 'Kela', variant: 'light' },
] as const;

/** Uniwind / ScopedTheme theme name — keep in sync with uniwind-types.d.ts */
export type ThemeId = (typeof THEMES)[number]['id'];

export type ThemeConfig = (typeof THEMES)[number];

/** The theme applied on fresh install */
export const DEFAULT_THEME_ID: ThemeId = 'light';

/** Safe default for sheet corner radius when it isn't zero (e.g. brutalism) */
export const DEFAULT_THEME_SHEET_RADIUS = 24;

/** All theme IDs for metro.config.js extraThemes */
export const THEME_IDS = THEMES.map((t) => t.id);

/** Get config for a theme ID (falls back to default) */
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
