import type { ComponentType } from 'react';
import { useSettingsStore } from '~/lib/settings';
import { getThemeConfig } from '~/lib/theme/themes';
import type { BackdropId } from '~/lib/theme/registry';
import { BotanicalBackdrop } from './BotanicalBackdrop';
import { HelenaBackdrop, PoonamBackdrop } from './SkyBackdrop';
import { ShiroBackdrop, ShadowBackdrop } from './PetBackdrop';

/** Every backdrop component renders the full scene; `preview` freezes all
 *  animation for static contexts like the theme picker cards. */
export interface BackdropProps {
  preview?: boolean;
}

/**
 * One art component per backdrop id. To add a backdrop for a new theme
 * (e.g. a moon-and-outer-space scene for a future `luna` theme):
 *   1. Build the art component in this folder (read colors from theme tokens
 *      via `useCSSVariable`, render one absolute-fill Skia canvas, accept a
 *      `preview` prop that freezes animation).
 *   2. Set `backdropId: 'luna'` on the theme in `theme-tokens.ts` and run
 *      `bun run generate:themes` — the `BackdropId` type picks it up.
 *   3. Register it here; TypeScript errors until every id has a component.
 * The same map serves full screens (ThemeBackdrop) and picker previews
 * (ThemePickerSheet), so every theme with a backdrop gets picker art.
 */
export const BACKDROPS: Record<BackdropId, ComponentType<BackdropProps>> = {
  botanical: BotanicalBackdrop,
  helena: HelenaBackdrop,
  poonam: PoonamBackdrop,
  shiro: ShiroBackdrop,
  shadow: ShadowBackdrop,
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
