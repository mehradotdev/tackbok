import * as fs from 'fs';
import * as path from 'path';
import {
  CUSTOM_THEME_IDS,
  DEFAULT_THEME_ID,
  DEFAULT_TITLE_FONT,
  THEMES,
  TITLE_FONTS,
} from './registry';
import {
  DEFAULT_THEME_ID as SOURCE_DEFAULT_THEME_ID,
  DEFAULT_TITLE_FONT as SOURCE_DEFAULT_TITLE_FONT,
  REQUIRED_THEME_VARIABLES,
  THEME_DEFINITIONS,
  TITLE_FONTS as SOURCE_TITLE_FONTS,
  resolveThemeVariables,
} from './theme-tokens';

const GLOBAL_CSS_PATH = path.resolve(__dirname, '../../global.css');
const FONTS_MODULE_PATH = path.resolve(__dirname, './fonts.ts');
const UNIWIND_TYPES_PATH = path.resolve(__dirname, '../../uniwind-types.d.ts');

function extractVariantBlock(content: string, variantId: string): string {
  const variantMarker = `@variant ${variantId}`;
  const variantIndex = content.indexOf(variantMarker);

  if (variantIndex === -1) {
    throw new Error(
      `Could not find @variant block for theme "${variantId}" in global.css`,
    );
  }

  const openBraceIndex = content.indexOf('{', variantIndex);
  if (openBraceIndex === -1) {
    throw new Error(
      `Could not find opening brace for theme "${variantId}" in global.css`,
    );
  }

  let depth = 0;
  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, index);
      }
    }
  }

  throw new Error(`Could not find closing brace for theme "${variantId}" in global.css`);
}

function extractCssVariables(block: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const variableRegex = /^\s*(--[\w-]+)\s*:\s*([^;]+);/gm;

  let match: RegExpExecArray | null;
  while ((match = variableRegex.exec(block)) !== null) {
    variables[match[1]] = match[2].trim();
  }

  return variables;
}

function extractAppFontAssetNames(content: string): string[] {
  const assetsMatch = content.match(
    /export const APP_FONT_ASSETS = \{([\s\S]*?)\} as const;/,
  );

  if (!assetsMatch) {
    throw new Error('Could not find APP_FONT_ASSETS object in fonts.ts');
  }

  const propertyRegex = /^\s*([A-Za-z_]\w*)\s*,?$/gm;
  const assetNames = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = propertyRegex.exec(assetsMatch[1])) !== null) {
    assetNames.add(match[1]);
  }

  return [...assetNames];
}

function extractUniwindThemeIds(content: string): string[] {
  const themesMatch = content.match(/themes:\s*readonly\s*\[([\s\S]*?)\]/);

  if (!themesMatch) {
    throw new Error('Could not find Uniwind theme tuple in uniwind-types.d.ts');
  }

  return [...themesMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe('Theme Registry', () => {
  const globalCss = fs.readFileSync(GLOBAL_CSS_PATH, 'utf-8');
  const fontsModule = fs.readFileSync(FONTS_MODULE_PATH, 'utf-8');
  const uniwindTypesModule = fs.readFileSync(UNIWIND_TYPES_PATH, 'utf-8');
  const titleFontsById = new Map(TITLE_FONTS.map((font) => [font.id, font]));
  const loadedFontFamilies = new Set(extractAppFontAssetNames(fontsModule));
  const uniwindThemeIds = extractUniwindThemeIds(uniwindTypesModule);
  const themeVariablesById = new Map(
    THEMES.map((theme) => [
      theme.id,
      extractCssVariables(extractVariantBlock(globalCss, theme.id)),
    ]),
  );
  const baselineVariableKeys = Object.keys(
    themeVariablesById.get(DEFAULT_THEME_ID) ?? {},
  ).sort();

  test('global.css contains exactly one generated theme block', () => {
    const startMatches = globalCss.match(/\/\* @generated theme-artifacts:start \*\//g) ?? [];
    const endMatches = globalCss.match(/\/\* @generated theme-artifacts:end \*\//g) ?? [];

    expect(startMatches).toHaveLength(1);
    expect(endMatches).toHaveLength(1);
  });

  test('generated registry stays in sync with theme-tokens source', () => {
    const sourceThemes = THEME_DEFINITIONS.map(
      ({ tokens: _tokens, bodyFontPackId: _bodyFontPackId, ...theme }) => theme,
    );

    expect(DEFAULT_THEME_ID).toBe(SOURCE_DEFAULT_THEME_ID);
    expect(DEFAULT_TITLE_FONT).toBe(SOURCE_DEFAULT_TITLE_FONT);
    expect(TITLE_FONTS).toEqual(SOURCE_TITLE_FONTS);
    expect(THEMES).toEqual(sourceThemes);
  });

  test('default ids exist in the shared registries', () => {
    expect(THEMES.some((theme) => theme.id === DEFAULT_THEME_ID)).toBe(true);
    expect(titleFontsById.has(DEFAULT_TITLE_FONT)).toBe(true);
  });

  test('custom theme ids are derived from the theme registry', () => {
    const expectedCustomThemeIds = THEMES.filter(
      (theme) => theme.id !== 'light' && theme.id !== 'dark',
    ).map((theme) => theme.id);

    expect(CUSTOM_THEME_IDS).toEqual(expectedCustomThemeIds);
  });

  test('every registry theme has a matching CSS @variant block', () => {
    expect([...themeVariablesById.keys()].sort()).toEqual(
      THEMES.map((theme) => theme.id).sort(),
    );
  });

  test('uniwind types stay in sync with generated theme ids', () => {
    expect(uniwindThemeIds).toEqual(THEMES.map((theme) => theme.id));
  });

  test('generated CSS theme variables stay in sync with theme-tokens source', () => {
    const mismatches = THEME_DEFINITIONS.flatMap((theme) => {
      const cssVariables = themeVariablesById.get(theme.id) ?? {};
      const expectedVariables = resolveThemeVariables(theme);

      return JSON.stringify(cssVariables) === JSON.stringify(expectedVariables)
        ? []
        : [theme.id];
    });

    expect(mismatches).toEqual([]);
  });

  test('every theme variant defines the same CSS variable set', () => {
    const mismatches = THEMES.flatMap((theme) => {
      const variableKeys = Object.keys(themeVariablesById.get(theme.id) ?? {}).sort();
      return JSON.stringify(variableKeys) === JSON.stringify(baselineVariableKeys)
        ? []
        : [theme.id];
    });

    expect(mismatches).toEqual([]);
  });

  test('the baseline theme defines the required token contract', () => {
    expect(baselineVariableKeys).toEqual(expect.arrayContaining(REQUIRED_THEME_VARIABLES));
  });

  test('every theme default title font exists, is loaded, and matches CSS --font-heading', () => {
    const mismatches = THEMES.flatMap((theme) => {
      const titleFont = titleFontsById.get(theme.defaultTitleFontId);
      const cssVariables = themeVariablesById.get(theme.id) ?? {};
      const cssFontHeading = cssVariables['--font-heading'];

      if (!titleFont) {
        return [`${theme.id}:missing-font:${theme.defaultTitleFontId}`];
      }

      const expectedFontFamily = `'${titleFont.fontFamily}'`;
      const errors: string[] = [];

      if (!loadedFontFamilies.has(titleFont.fontFamily)) {
        errors.push(`${theme.id}:unloaded-font:${titleFont.fontFamily}`);
      }

      if (cssFontHeading !== expectedFontFamily) {
        errors.push(`${theme.id}:css-font-heading:${cssFontHeading ?? 'missing'}`);
      }

      return errors;
    });

    expect(mismatches).toEqual([]);
  });
});
