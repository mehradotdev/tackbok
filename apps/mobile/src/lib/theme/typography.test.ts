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
