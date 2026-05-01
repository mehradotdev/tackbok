import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BODY_FONT_PACKS,
  DEFAULT_THEME_ID,
  DEFAULT_TITLE_FONT,
  FONT_TOKEN_KEYS,
  THEME_DEFINITIONS,
  THEME_TOKEN_KEYS,
  TITLE_FONTS,
  type ThemeDefinition,
  type ThemeId,
  getThemeDefinition,
  resolveThemeVariables,
} from './theme-tokens';

/**
 * Generates the mobile theme runtime artifacts from theme-tokens.ts.
 *
 * This script is the single build step that keeps the typed theme source of truth
 * in sync with the files consumed by the app runtime and tooling:
 * - global.css: preserves handwritten CSS above the generated marker block and
 *   rewrites the generated theme token section below it. If the file is missing,
 *   empty, or imports-only, the script bootstraps it with the required imports and
 *   a minimal handwritten shell before appending generated content.
 * - registry.js: generated JavaScript registry used by runtime code and Metro config.
 * - registry.d.ts: generated TypeScript declarations for the JS registry.
 *
 * Re-running the script is safe and idempotent: manual CSS stays user-owned, while
 * the generated theme block and registry artifacts are replaced from the canonical
 * values in theme-tokens.ts.
 */

const THEME_TOKENS_SOURCE = 'src/lib/theme/theme-tokens.ts';
const GENERATED_THEME_START = '/* @generated theme-artifacts:start */';
const GENERATED_THEME_END = '/* @generated theme-artifacts:end */';

const themeDir = __dirname;
const appRoot = path.resolve(themeDir, '../..');
const globalCssPath = path.resolve(appRoot, 'global.css');
const registryJsPath = path.resolve(themeDir, 'registry.js');
const registryDtsPath = path.resolve(themeDir, 'registry.d.ts');
const GLOBAL_CSS_IMPORTS = `@import 'tailwindcss';\n@import 'uniwind';`;

// This seed is only used when global.css has no manual content to preserve.
// In normal operation, everything above the generated marker block remains user-owned.
const DEFAULT_MANUAL_GLOBAL_CSS = [
  GLOBAL_CSS_IMPORTS,
  '',
  '@theme {',
  '  /* Override default tailwind radii with scalable theme context */',
  '  --radius-xl: calc(var(--theme-radius) + 8px);',
  '  --radius-lg: var(--theme-radius);',
  '  --radius-md: calc(var(--theme-radius) - 2px);',
  '  --radius-sm: calc(var(--theme-radius) - 4px);',
  '}',
  '',
  '@utility border-theme {',
  '  border-width: var(--theme-border-width);',
  '  border-color: var(--color-border);',
  '}',
  '@utility shadow-theme {',
  '  box-shadow: var(--theme-shadow);',
  '}',
].join('\n');

function getDefaultThemeDefinition(): ThemeDefinition {
  const defaultTheme = THEME_DEFINITIONS.find((theme) => theme.id === DEFAULT_THEME_ID);
  if (!defaultTheme) {
    throw new Error(
      `Default theme "${DEFAULT_THEME_ID}" is missing from theme definitions.`,
    );
  }
  return defaultTheme;
}

function assertDefaultThemeConsistency() {
  const defaultTheme = getDefaultThemeDefinition();

  if (defaultTheme.defaultTitleFontId !== DEFAULT_TITLE_FONT) {
    throw new Error(
      `DEFAULT_TITLE_FONT (${DEFAULT_TITLE_FONT}) must match the default theme's title font (${defaultTheme.defaultTitleFontId}).`,
    );
  }

  const titleFontIds = new Set(TITLE_FONTS.map((font) => font.id));
  for (const theme of THEME_DEFINITIONS) {
    if (!titleFontIds.has(theme.defaultTitleFontId)) {
      throw new Error(
        `Theme "${theme.id}" references unknown title font "${theme.defaultTitleFontId}".`,
      );
    }

    if (!BODY_FONT_PACKS[theme.bodyFontPackId]) {
      throw new Error(
        `Theme "${theme.id}" references unknown body font pack "${theme.bodyFontPackId}".`,
      );
    }
  }
}

function toJsLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function quoteUnion(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(' | ');
}

function buildThemeCssVariableLines(themeId: ThemeId): string {
  const theme = getThemeDefinition(themeId);
  const resolvedVariables = resolveThemeVariables(theme);

  return [...THEME_TOKEN_KEYS, ...FONT_TOKEN_KEYS]
    .map((key) => `      ${key}: ${resolvedVariables[key]};`)
    .join('\n');
}

function buildGeneratedThemeFontTokensBlock(): string {
  const defaultTheme = getDefaultThemeDefinition();
  const resolvedVariables = resolveThemeVariables(defaultTheme);

  const lines = FONT_TOKEN_KEYS.map((key) => `  ${key}: ${resolvedVariables[key]};`).join(
    '\n',
  );

  return ['@theme {', lines, '}'].join('\n');
}

function buildGeneratedThemeVariantsLayer(): string {
  const blocks = THEME_DEFINITIONS.map((theme) => {
    const heading = `${theme.id.toUpperCase()} — ${theme.description}`;
    return [
      '    /* ═══════════════════════════════════════════',
      `       ${heading}`,
      '       ═══════════════════════════════════════════ */',
      `    @variant ${theme.id} {`,
      buildThemeCssVariableLines(theme.id),
      '    }',
    ].join('\n');
  }).join('\n\n');

  return ['@layer theme {', '  :root {', blocks, '  }', '}'].join('\n');
}

function buildGeneratedThemeArtifactsSection(): string {
  return [
    GENERATED_THEME_START,
    `/* Generated from ${THEME_TOKENS_SOURCE}. Do not edit by hand. */`,
    buildGeneratedThemeFontTokensBlock(),
    '',
    buildGeneratedThemeVariantsLayer(),
    GENERATED_THEME_END,
  ].join('\n');
}

function removeMarkedSection(
  content: string,
  startMarker: string,
  endMarker: string,
): string {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return content;

  const endIndex = content.lastIndexOf(endMarker);
  if (endIndex === -1 || endIndex < startIndex) return content;

  const before = content.slice(0, startIndex).trimEnd();
  const after = content.slice(endIndex + endMarker.length).trimStart();

  if (before && after) {
    return `${before}\n\n${after}`;
  }
  return before || after;
}

function removeGeneratedThemeArtifactsSection(content: string): string {
  return removeMarkedSection(
    content,
    GENERATED_THEME_START,
    GENERATED_THEME_END,
  ).trimEnd();
}

// When the file is empty or only contains the two required imports, we restore a
// minimal handwritten shell before appending the generated theme block.
function shouldSeedDefaultManualGlobalCss(content: string): boolean {
  const trimmedContent = content.trim();
  return trimmedContent === '' || trimmedContent === GLOBAL_CSS_IMPORTS;
}

function appendGeneratedThemeArtifactsSection(content: string): string {
  const manualContent = shouldSeedDefaultManualGlobalCss(content)
    ? DEFAULT_MANUAL_GLOBAL_CSS
    : content.trimEnd();

  return `${manualContent}\n\n${buildGeneratedThemeArtifactsSection()}\n`;
}

function generateRegistryJs(): string {
  const themes = THEME_DEFINITIONS.map(
    ({ tokens: _tokens, bodyFontPackId: _bodyFontPackId, ...theme }) => theme,
  );

  return [
    `// This file is generated from ${THEME_TOKENS_SOURCE}. Do not edit by hand.`,
    '',
    `export const TITLE_FONTS = ${toJsLiteral(TITLE_FONTS)};`,
    '',
    `export const DEFAULT_THEME_ID = ${toJsLiteral(DEFAULT_THEME_ID)};`,
    `export const DEFAULT_TITLE_FONT = ${toJsLiteral(DEFAULT_TITLE_FONT)};`,
    '',
    `export const THEMES = ${toJsLiteral(themes)};`,
    '',
    'export const THEME_IDS = THEMES.map((theme) => theme.id);',
    'export const CUSTOM_THEME_IDS = THEMES.filter(',
    `  (theme) => theme.id !== ${toJsLiteral(DEFAULT_THEME_ID)} && theme.id !== 'dark',`,
    ').map((theme) => theme.id);',
    '',
  ].join('\n');
}

function generateRegistryDts(): string {
  const titleFontIds = TITLE_FONTS.map((font) => font.id);
  const themeIds = THEME_DEFINITIONS.map((theme) => theme.id);
  const fontFamilies = TITLE_FONTS.map((font) => font.fontFamily);

  return [
    `// This file is generated from ${THEME_TOKENS_SOURCE}. Do not edit by hand.`,
    '',
    `export type TitleFontId = ${quoteUnion(titleFontIds)};`,
    '',
    `export type ThemeId = ${quoteUnion(themeIds)};`,
    '',
    `export type ThemeVariant = 'light' | 'dark';`,
    '',
    'export interface TitleFontConfig {',
    '  id: TitleFontId;',
    '  label: string;',
    `  fontFamily: ${quoteUnion(fontFamilies)};`,
    '}',
    '',
    'export interface ThemeConfig {',
    '  id: ThemeId;',
    '  name: string;',
    '  description: string;',
    '  variant: ThemeVariant;',
    '  enableTimelineBorders: boolean;',
    '  defaultTitleFontId: TitleFontId;',
    '}',
    '',
    'export declare const TITLE_FONTS: readonly TitleFontConfig[];',
    'export declare const DEFAULT_THEME_ID: ThemeId;',
    'export declare const DEFAULT_TITLE_FONT: TitleFontId;',
    'export declare const THEMES: readonly ThemeConfig[];',
    'export declare const THEME_IDS: readonly ThemeId[];',
    `export declare const CUSTOM_THEME_IDS: readonly Exclude<ThemeId, '${DEFAULT_THEME_ID}' | 'dark'>[];`,
    '',
  ].join('\n');
}

function writeIfChanged(filePath: string, nextContent: string) {
  const currentContent = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf-8')
    : null;

  if (currentContent !== nextContent) {
    fs.writeFileSync(filePath, nextContent);
  }
}

function readTextFileOrEmpty(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
}

// global.css is split into two ownership zones:
// 1. Manual CSS above the generated marker block.
// 2. Generated theme CSS inside the marker block.
// Re-running this script preserves the manual section and replaces only the generated one.
function main() {
  assertDefaultThemeConsistency();

  const globalCss = readTextFileOrEmpty(globalCssPath);
  const nextGlobalCss = appendGeneratedThemeArtifactsSection(
    removeGeneratedThemeArtifactsSection(globalCss),
  );

  writeIfChanged(globalCssPath, nextGlobalCss);
  writeIfChanged(registryJsPath, generateRegistryJs());
  writeIfChanged(registryDtsPath, generateRegistryDts());

  console.log('Generated theme artifacts from theme-tokens.ts');
}

main();
