/**
 * All available themes.
 * Each must have a matching @variant block in global.css and be listed
 * in metro.config.js extraThemes (plus light/dark).
 */
export const THEMES = [
  { id: 'light', name: 'Light', variant: 'light', enableTimelineBorders: false },
  { id: 'dark', name: 'Dark', variant: 'dark', enableTimelineBorders: false },
  { id: 'lavender', name: 'Lavender', variant: 'light', enableTimelineBorders: false },
  { id: 'forest', name: 'Forest', variant: 'dark', enableTimelineBorders: false },
  { id: 'bubblegum', name: 'Bubblegum', variant: 'light', enableTimelineBorders: true },
  { id: 'hecker', name: 'Hecker', variant: 'dark', enableTimelineBorders: true },
  { id: 'peach', name: 'Peach', variant: 'light', enableTimelineBorders: false },
  { id: 'ember', name: 'Ember', variant: 'dark', enableTimelineBorders: false },
  { id: 'ocean', name: 'Ocean', variant: 'light', enableTimelineBorders: false },
  { id: 'navy', name: 'Navy', variant: 'dark', enableTimelineBorders: false },
  { id: 'sakura', name: 'Sakura', variant: 'light', enableTimelineBorders: false },
  { id: 'slate', name: 'Slate', variant: 'dark', enableTimelineBorders: false },
  { id: 'kela', name: 'Kela', variant: 'light', enableTimelineBorders: true },
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
