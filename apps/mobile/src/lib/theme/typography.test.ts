import { Uniwind } from 'uniwind';
import {
  BODY_FONT_SIZES,
  DEFAULT_BODY_FONT_SIZE,
  DEFAULT_TITLE_FONT_SELECTION,
  TITLE_FONTS,
  applyTitleFont,
  getThemeDefaultTitleFontId,
  getTitleFont,
  normalizeBodyFontSize,
  normalizeTitleFontSelection,
  resolveHeadingFontMetrics,
} from './typography';
import { THEMES } from './registry';

jest.mock('uniwind', () => ({
  Uniwind: {
    updateCSSVariables: jest.fn(),
  },
}));

const updateCSSVariablesMock = jest.mocked(Uniwind.updateCSSVariables);

describe('typography normalization', () => {
  beforeEach(() => {
    updateCSSVariablesMock.mockClear();
  });

  test('normalizeTitleFontSelection falls back to default for invalid values', () => {
    expect(normalizeTitleFontSelection(undefined)).toBe(DEFAULT_TITLE_FONT_SELECTION);
    expect(normalizeTitleFontSelection(null)).toBe(DEFAULT_TITLE_FONT_SELECTION);
    expect(normalizeTitleFontSelection('not-a-font')).toBe(DEFAULT_TITLE_FONT_SELECTION);
  });

  test('normalizeBodyFontSize keeps known sizes', () => {
    for (const size of BODY_FONT_SIZES) {
      expect(normalizeBodyFontSize(size)).toBe(size);
    }
  });

  test('normalizeBodyFontSize falls back to default for stale values', () => {
    expect(normalizeBodyFontSize(undefined)).toBe(DEFAULT_BODY_FONT_SIZE);
    expect(normalizeBodyFontSize(null)).toBe(DEFAULT_BODY_FONT_SIZE);
    expect(normalizeBodyFontSize('huge')).toBe(DEFAULT_BODY_FONT_SIZE);
  });

  test('applyTitleFont preserves each theme default when selection is default', () => {
    applyTitleFont(DEFAULT_TITLE_FONT_SELECTION);

    expect(updateCSSVariablesMock).toHaveBeenCalledTimes(THEMES.length);

    for (const theme of THEMES) {
      expect(updateCSSVariablesMock).toHaveBeenCalledWith(theme.id, {
        '--font-heading': getTitleFont(getThemeDefaultTitleFontId(theme.id)).fontFamily,
      });
    }
  });

  test('applyTitleFont applies explicit font selection to all themes', () => {
    const explicitFontId = TITLE_FONTS.find(
      (font) => font.id !== getThemeDefaultTitleFontId(THEMES[0]!.id),
    )!.id;

    applyTitleFont(explicitFontId);

    expect(updateCSSVariablesMock).toHaveBeenCalledTimes(THEMES.length);

    for (const theme of THEMES) {
      expect(updateCSSVariablesMock).toHaveBeenCalledWith(theme.id, {
        '--font-heading': getTitleFont(explicitFontId).fontFamily,
      });
    }
  });
});

describe('resolveHeadingFontMetrics', () => {
  // Gloria Hallelujah's real ink span (1.73em) exceeds every Tailwind heading
  // line height, so Android needs the enlarged 1.75 scale with no bottom trim,
  // while iOS keeps the tighter 1.4 scale plus trim (see HEADING_FONT_METRICS).
  test('Gloria Hallelujah on Android uses the enlarged line height and no trim', () => {
    for (const fontSize of [36, 30, 24, 20]) {
      expect(
        resolveHeadingFontMetrics('GloriaHallelujah_400Regular', fontSize, 'android'),
      ).toEqual({
        lineHeight: Math.ceil(fontSize * 1.75),
        bottomTrim: 0,
      });
    }
  });

  test('Gloria Hallelujah on iOS keeps the tighter scale and bottom trim', () => {
    expect(
      resolveHeadingFontMetrics('GloriaHallelujah_400Regular', 36, 'ios'),
    ).toEqual({
      lineHeight: Math.ceil(36 * 1.4),
      bottomTrim: -6,
    });
  });

  test('fonts without registered metrics resolve to undefined', () => {
    expect(resolveHeadingFontMetrics('Baskervville_700Bold', 36, 'android')).toBeUndefined();
    expect(resolveHeadingFontMetrics('Lora_700Bold', 36, 'ios')).toBeUndefined();
  });
});
