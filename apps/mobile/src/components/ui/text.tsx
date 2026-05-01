import * as React from 'react';
import {
  Platform,
  Text as RNText,
  type StyleProp,
  type TextStyle,
  type Role,
} from 'react-native';
import { cn, tv, type VariantProps } from 'tailwind-variants';
import * as Slot from '~/components/primitives/slot';
import { useSettingsStore } from '~/lib/settings';
import {
  FONT_SIZE_DELTA,
  getTitleFont,
  resolveHeadingFontMetrics,
  resolveTitleFontId,
  type BodyFontSize,
} from '~/lib/theme/typography';

const textVariants = tv({
  base: 'text-foreground text-base text-left font-body',
  variants: {
    variant: {
      default: '',
      h1: 'text-center text-4xl font-heading tracking-tight',
      h2: 'text-3xl font-heading tracking-tight',
      h3: 'text-2xl font-heading tracking-tight',
      h4: 'text-xl font-heading tracking-tight',
      p: 'mt-3 leading-7 sm:mt-6',
      blockquote: 'mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6',
      code: 'bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-body-semibold',
      lead: 'text-muted-foreground text-xl',
      large: 'text-lg font-body-semibold',
      small: 'text-sm font-body-medium leading-tight',
      muted: 'text-muted-foreground text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  blockquote: undefined,
  code: undefined,
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

/**
 * Variants that receive the heading vertical-metrics fix (lineHeight adjustment).
 * Kept separate from `usesHeadingFont` because the metrics were tuned for these
 * specific large font sizes (20–36 px). Ad-hoc `font-heading` usage on smaller
 * text (e.g. a date label styled with the heading font) should NOT get the
 * aggressive androidLineHeightScale applied — that inflates their line box and
 * makes pill-shaped buttons visually taller on Android than on iOS.
 */
const HEADING_VARIANTS = new Set<TextVariant>(['h1', 'h2', 'h3', 'h4']);

/**
 * Resolved base font sizes (px) for each Tailwind text-* class used
 * by the variants, assuming the default 16 px rem.
 *
 * The "Default" body font size setting leaves these unchanged.
 * "Small" / "Large" adds a ±2 px delta.  React Native's `allowFontScaling`
 * (which is `true` by default) still applies the phone's system font scale
 * on top, so the user's accessibility preferences are respected.
 */
const VARIANT_BASE_SIZE: Partial<Record<TextVariant, number>> = {
  default: 16, // text-base
  p: 16,
  blockquote: 16,
  code: 14, // text-sm
  lead: 20, // text-xl
  large: 18, // text-lg
  small: 14, // text-sm
  muted: 14, // text-sm
};

/**
 * Maps standard Tailwind text-size class suffixes to their px value.
 * Used to detect when a className overrides the variant's default size
 * (e.g. `<Text className="text-xs">` on the default variant).
 */
const TEXT_SIZE_PX: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
};

// Matches both named sizes (text-sm, text-2xl …) and arbitrary px values
// (text-[10px], text-[13.5px]). Groups: [1] named suffix, [2] arbitrary px number.
// Note: \b is placed after named suffixes only; the closing ] already terminates
// an arbitrary match unambiguously so no trailing boundary is needed there.
const TEXT_SIZE_RE =
  /\btext-(?:(xs|sm|base|lg|xl|[2-9]xl)\b|\[([0-9]+(?:\.[0-9]+)?)px\])/g;
const HEADING_FONT_RE = /\bfont-heading\b/;

function getLastTextSizePx(classes?: string): number | undefined {
  if (!classes) return undefined;

  let resolvedSize: number | undefined;
  for (const match of classes.matchAll(TEXT_SIZE_RE)) {
    if (match[1]) {
      resolvedSize = TEXT_SIZE_PX[match[1]] ?? resolvedSize;
    } else if (match[2]) {
      resolvedSize = parseFloat(match[2]);
    }
  }
  return resolvedSize;
}

/**
 * Resolve the actual base font-size for a Text component by checking:
 * 1. Explicit text-size class in `className` (wins)
 * 2. Explicit text-size class in `textClass`
 * 3. Explicit text-size class in the resolved variant classes
 * 4. Variant's known base size
 * 3. Fallback 16 px
 */
function resolveBaseSize(
  variant: TextVariant,
  variantClasses: string,
  className?: string,
  textClass?: string,
): number {
  for (const cls of [className, textClass, variantClasses]) {
    const size = getLastTextSizePx(cls);
    if (size) return size;
  }
  return VARIANT_BASE_SIZE[variant] ?? 16;
}

function usesHeadingFont(
  variantClasses: string,
  className?: string,
  textClass?: string,
): boolean {
  return [className, textClass, variantClasses].some(
    (classes) => !!classes && HEADING_FONT_RE.test(classes),
  );
}

/** Return the px delta for body text. Memoised selector avoids unnecessary re-renders. */
function useBodyFontDelta(): number {
  const bodyFontSize: BodyFontSize = useSettingsStore((s) => s.bodyFontSize);
  return FONT_SIZE_DELTA[bodyFontSize];
}

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  style,
  ref,
  ...props
}: React.ComponentProps<typeof RNText> &
  TextVariantProps & { ref?: React.Ref<RNText> } & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  const variantClasses = textVariants({ variant });

  const delta = useBodyFontDelta();
  const themeId = useSettingsStore((s) => s.theme);
  const titleFontId = useSettingsStore((s) => s.titleFont);
  const effectiveVariant = variant ?? 'default';
  // Any text carrying font-heading skips body-size scaling (it already has its
  // own font choice and scaling it would be surprising).
  const isHeadingStyled = usesHeadingFont(variantClasses, className, textClass);
  // Only the canonical h1–h4 variants get the lineHeight/metrics fix — the
  // per-font scales were measured at heading sizes (20–36 px).
  const isVariantHeading = HEADING_VARIANTS.has(effectiveVariant);

  let mergedStyle: StyleProp<TextStyle> = style;

  // Body text font-size adjustment (±2 px)
  if (delta !== 0 && !isHeadingStyled) {
    const base = resolveBaseSize(effectiveVariant, variantClasses, className, textClass);
    mergedStyle = [{ fontSize: base + delta }, style];
  }

  // ── Heading vertical-metrics fix ────────────────────────────────────────
  //
  // ROOT CAUSE (Android only)
  // React Native's ReactTextView draws glyphs into a canvas whose height is
  // determined by `lineHeight`. Any part of a glyph that falls outside that
  // canvas is hard-clipped by the Android view system — `paddingBottom` and
  // `overflow: visible` on parent views have NO effect on this.
  // iOS uses Core Text which respects the font's own vertical metrics, so
  // glyphs are almost never clipped there.
  //
  // FIX
  // Set `lineHeight` tall enough to contain the font's full glyph extent.
  // Only applied to h1–h4 variants: the per-font scales were measured at
  // heading sizes and would over-inflate smaller ad-hoc heading-font text.
  if (isVariantHeading) {
    const fontConfig = getTitleFont(resolveTitleFontId(themeId, titleFontId));
    const headingSize = resolveBaseSize(
      effectiveVariant,
      variantClasses,
      className,
      textClass,
    );
    const resolvedMetrics = resolveHeadingFontMetrics(fontConfig.fontFamily, headingSize);

    if (Platform.OS === 'android') {
      // Android can clip deep descenders inside TextView unless lineHeight
      // is expanded; parent padding/overflow cannot fix this draw-canvas limit.
      mergedStyle = [
        {
          includeFontPadding: true,
          ...(resolvedMetrics
            ? {
                lineHeight: resolvedMetrics.lineHeight,
                marginBottom: 0,
              }
            : undefined),
        },
        style,
      ];
    } else if (resolvedMetrics) {
      // iOS handles descenders fine — only apply font-specific overrides
      mergedStyle = [
        {
          lineHeight: resolvedMetrics.lineHeight,
          marginBottom: resolvedMetrics.bottomTrim,
        },
        style,
      ];
    }
  }

  return (
    <Component
      ref={ref}
      className={cn(variantClasses, textClass, className)}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      style={mergedStyle}
      {...props}
    />
  );
}

export { Text, TextClassContext };
