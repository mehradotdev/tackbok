import { getThemeDefinition } from '~/lib/theme/theme-tokens';
import { getThemeConfig, type ThemeId } from '~/lib/theme';

export const SHARE_THEME_IDS = [
  'light',
  'dark',
  'lavender',
  'bubblegum',
  'clemens',
  'weckner',
  'hecker',
  'peach',
  'ember',
] as const satisfies readonly ThemeId[];

export type ShareThemeId = (typeof SHARE_THEME_IDS)[number];

export type SharePalette = {
  id: ThemeId;
  name: string;
  background: string;
  foreground: string;
  border: string;
  accent: string;
};

/**
 * Projects a theme's tokens onto a share card. Any app theme can be projected —
 * the achievement card follows the active theme, which may sit outside the
 * entry composer's grid. The persisted theme id is a plain string, so unknown
 * or removed ids resolve to the default Light theme.
 */
export function getSharePalette(id: string): SharePalette {
  const theme = getThemeDefinition(getThemeConfig(id).id);
  return {
    id: theme.id,
    name: theme.name,
    background: theme.tokens['--color-background'],
    foreground: theme.tokens['--color-foreground'],
    border: theme.tokens['--color-border'],
    accent: theme.tokens['--color-accent'],
  };
}

export const SHARE_PALETTES: readonly SharePalette[] = SHARE_THEME_IDS.map((id) => {
  const palette = getSharePalette(id);
  // The Light fallback must never turn a mistyped grid member into a silent
  // duplicate tile.
  if (palette.id !== id) throw new Error(`Unknown sharing theme: ${id}`);
  return palette;
});

export function isShareThemeId(value: string): value is ShareThemeId {
  return SHARE_THEME_IDS.some((id) => id === value);
}
