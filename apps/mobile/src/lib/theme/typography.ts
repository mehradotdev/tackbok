import { Platform, type TextStyle } from 'react-native';
import { Uniwind } from 'uniwind';
import { DEFAULT_TITLE_FONT, THEMES, TITLE_FONTS, type TitleFontId } from './registry';

export { DEFAULT_TITLE_FONT, TITLE_FONTS, type TitleFontId };
export const DEFAULT_TITLE_FONT_SELECTION = 'default' as const;
export type TitleFontSelection = TitleFontId | typeof DEFAULT_TITLE_FONT_SELECTION;

// ── Body Font Size ─────────────────────────────────────────────────
export const BODY_FONT_SIZES = ['small', 'default', 'large'] as const;
export type BodyFontSize = (typeof BODY_FONT_SIZES)[number];
export const DEFAULT_BODY_FONT_SIZE = 'default' as const;

/**
 * Pixel offset applied to every body-text font size.
 * 'default' (0) leaves sizes unchanged — the phone's system font
 * scale is applied on top by React Native via `allowFontScaling`.
 */
export const FONT_SIZE_DELTA: Record<BodyFontSize, number> = {
  small: -2,
  default: 0,
  large: 2,
};

// ── Heading Font Metrics ───────────────────────────────────────────

/**
 * Per-font vertical-metrics adjustments for heading variants (h1–h4).
 *
 * ## Why this exists
 *
 * ### iOS
 * Core Text (iOS) sizes a text run's line-box using the font's own internal
 * ascender + descender metadata, so glyphs are almost never clipped — even
 * for fonts with extreme metrics. No special treatment is usually needed.
 *
 * ### Android
 * React Native on Android renders text inside a `ReactTextView`
 * (a subclass of `TextView`) and hard-clips glyph ink at the view's
 * draw-canvas bounds — **regardless of any padding or overflow on the text
 * or parent views**. `paddingBottom` only adds layout space; it does not
 * expand the draw canvas. `overflow: visible` on a parent only controls
 * whether child *views* can paint outside — it has no effect on
 * intra-component glyph clipping inside `ReactTextView`.
 *
 * With an explicit `lineHeight`, RN's `CustomLineHeightSpan` applies
 * CSS-style *half-leading*: `L = lineHeight − (fontAscent + fontDescent)`,
 * with `L/2` added above the ascent and below the descent (negative when
 * the font's **declared** metric span exceeds the lineHeight — which is
 * what clips descenders on the last line and ascenders on the first).
 *
 * Two levers fix that:
 * 1. The title fonts are vendored with their declared metrics patched down
 *    to real ink extents (assets/fonts/, via scripts/patch-font-metrics.py),
 *    because Google Fonts pad these metrics far beyond the ink. After
 *    patching, every title font fits Tailwind's default heading line
 *    heights on Android — except Gloria Hallelujah.
 * 2. For fonts whose *real ink* still exceeds the default line height, the
 *    only remaining fix is a `lineHeight` ≥ the ink span (an entry below).
 *
 * ## Fields
 * - `lineHeightScale` — iOS lineHeight = `Math.ceil(fontSize × lineHeightScale)`.
 * - `bottomTrim` — negative margin (iOS only) to compensate for the extra
 *   whitespace the enlarged line-box introduces below the last baseline.
 * - `androidLineHeightScale` — same as `lineHeightScale` but used on Android,
 *   where deeper descenders often require a larger canvas than iOS needs.
 *   Falls back to `lineHeightScale` when absent.
 */
export interface HeadingFontMetrics {
  lineHeightScale: number;
  bottomTrim: number;
  androidLineHeightScale?: number;
}

export interface ResolvedHeadingFontMetrics {
  lineHeight: number;
  bottomTrim: number;
}

export const HEADING_FONT_METRICS: Record<string, HeadingFontMetrics> = {
  // Gloria Hallelujah is a handwriting font whose real glyph ink spans
  // 1.73em (patched metrics: ascent 1.13em, 'g' descends to −0.60em) — more
  // than any Tailwind heading line height, so Android needs an explicit
  // lineHeight ≥ the ink span. 1.75 is the floor: the vendored font's
  // declared span is 1.727em (see scripts/patch-font-metrics.py output);
  // anything lower re-clips the descenders. iOS overflows the line box
  // gracefully and keeps the tighter 1.4.
  GloriaHallelujah_400Regular: {
    lineHeightScale: 1.4,
    bottomTrim: -6,
    androidLineHeightScale: 1.75,
  },
};

/** Base font-sizes (px) for each heading variant's Tailwind text-* class. */
export const HEADING_BASE_SIZE: Record<string, number> = {
  h1: 36, // text-4xl
  h2: 30, // text-3xl
  h3: 24, // text-2xl
  h4: 20, // text-xl
};

// ── Helpers ────────────────────────────────────────────────────────

/** Look up a title font entry by id. Falls back to the first font if not found. */
export function getTitleFont(id: string) {
  return TITLE_FONTS.find((f) => f.id === id) ?? TITLE_FONTS[0]!;
}

/** Return true when the provided string matches a registered title font ID. */
export function isKnownTitleFontId(fontId: string): fontId is TitleFontId {
  return TITLE_FONTS.some((font) => font.id === fontId);
}

/** Return true when the selection explicitly follows the active theme default. */
export function isDefaultTitleFontSelection(
  fontId: string | null | undefined,
): fontId is typeof DEFAULT_TITLE_FONT_SELECTION {
  return fontId === DEFAULT_TITLE_FONT_SELECTION;
}

/** Coerce persisted or user-provided input into a safe title-font selection value. */
export function normalizeTitleFontSelection(
  fontId: string | null | undefined,
): TitleFontSelection {
  if (!fontId || isDefaultTitleFontSelection(fontId)) {
    return DEFAULT_TITLE_FONT_SELECTION;
  }

  return isKnownTitleFontId(fontId) ? fontId : DEFAULT_TITLE_FONT_SELECTION;
}

/** Coerce persisted or user-provided input into a safe body-font-size value. */
export function normalizeBodyFontSize(size: string | null | undefined): BodyFontSize {
  return BODY_FONT_SIZES.includes(size as BodyFontSize)
    ? (size as BodyFontSize)
    : DEFAULT_BODY_FONT_SIZE;
}
/** Return the built-in title font ID for a given theme. */
export function getThemeDefaultTitleFontId(themeId: string): TitleFontId {
  return (
    THEMES.find((theme) => theme.id === themeId)?.defaultTitleFontId ?? DEFAULT_TITLE_FONT
  );
}

/** Resolve a title-font selection to the concrete font ID that should be rendered. */
export function resolveTitleFontId(
  themeId: string,
  fontId: string | null | undefined,
): TitleFontId {
  const normalizedFontId = normalizeTitleFontSelection(fontId);

  return isDefaultTitleFontSelection(normalizedFontId)
    ? getThemeDefaultTitleFontId(themeId)
    : normalizedFontId;
}

/**
 * Resolve the final `lineHeight` and `bottomTrim` for a heading font at a given size.
 * Returns `undefined` when no custom metrics are registered for the font family.
 */
export function resolveHeadingFontMetrics(
  fontFamily: string,
  fontSize: number,
  platform: string = Platform.OS,
): ResolvedHeadingFontMetrics | undefined {
  const metrics = HEADING_FONT_METRICS[fontFamily];
  if (!metrics) return undefined;

  // Use the Android-specific scale if defined (needed for fonts like Gloria
  // Hallelujah whose glyph descenders extend beyond a normal lineHeight).
  // Note: paddingBottom / overflow on parent views do NOT fix glyph
  // clipping - only lineHeight expands the actual draw canvas on Android.
  const scale =
    platform === 'android'
      ? (metrics.androidLineHeightScale ?? metrics.lineHeightScale)
      : metrics.lineHeightScale;

  return {
    lineHeight: Math.ceil(fontSize * scale),
    bottomTrim: platform === 'android' ? 0 : metrics.bottomTrim,
  };
}

/**
 * Build a `TextStyle` suitable for rendering a font preview at the given size.
 * Includes heading font metrics (lineHeight) when available.
 */
export function getTitleFontPreviewStyle(
  fontFamily: string,
  fontSize: number,
): TextStyle {
  const resolvedMetrics = resolveHeadingFontMetrics(fontFamily, fontSize);

  return {
    fontFamily,
    fontSize,
    ...(resolvedMetrics ? { lineHeight: resolvedMetrics.lineHeight } : undefined),
  };
}

/**
 * Apply the selected title font by overriding `--font-heading` on every theme.
 * This should be called when the font setting changes *and* on app boot
 * (after store hydration).
 */
export function applyTitleFont(fontId: string | null | undefined) {
  // Update every theme variant, not just the active one, because the app can
  // render non-active themes at the same time via ScopedTheme previews.
  if (isDefaultTitleFontSelection(normalizeTitleFontSelection(fontId))) {
    // "default" selection: each theme uses its own curated heading font, so
    // resolve the font per-theme inside the loop.
    for (const theme of THEMES) {
      const font = getTitleFont(resolveTitleFontId(theme.id, fontId));

      Uniwind.updateCSSVariables(theme.id, {
        '--font-heading': font.fontFamily,
      });
    }

    return;
  }

  // Explicit font selection: every theme gets the same font, so resolve once
  // outside the loop and reuse the same override object for all themes.
  const font = getTitleFont(normalizeTitleFontSelection(fontId));
  const override: Record<string, string> = {
    '--font-heading': font.fontFamily,
  };

  for (const theme of THEMES) {
    Uniwind.updateCSSVariables(theme.id, override);
  }
}
