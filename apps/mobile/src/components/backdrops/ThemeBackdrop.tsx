import type { ComponentType } from 'react';
import { useSettingsStore } from '~/lib/settings';
import { getThemeConfig } from '~/lib/theme/themes';
import type { BackdropId } from '~/lib/theme/registry';
import { BotanicalBackdrop } from './BotanicalBackdrop';

/**
 * One art component per backdrop id. To add a backdrop for a new theme
 * (e.g. a moon-and-outer-space scene for a future `luna` theme):
 *   1. Build the art component in this folder (read colors from theme tokens
 *      via `useCSSVariable`, render one absolute-fill Skia canvas).
 *   2. Set `backdropId: 'luna'` on the theme in `theme-tokens.ts` and run
 *      `bun run generate:themes` — the `BackdropId` type picks it up.
 *   3. Register it here; TypeScript errors until every id has a component.
 */
const BACKDROPS: Record<BackdropId, ComponentType> = {
  botanical: BotanicalBackdrop,
};

/**
 * Renders the active theme's backdrop art, or nothing for themes without one —
 * always safe to mount. Place as the first child of a screen's root view so
 * the scene sits behind the content.
 */
export function ThemeBackdrop() {
  const themeId = useSettingsStore((s) => s.theme);
  const backdropId = getThemeConfig(themeId).backdropId;
  if (!backdropId) return null;

  const Backdrop = BACKDROPS[backdropId];
  return <Backdrop />;
}
