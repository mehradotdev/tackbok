import * as fs from 'fs';
import * as path from 'path';

const METRO_CONFIG_PATH = path.resolve(__dirname, '../../../metro.config.js');

describe('Metro Theme Config', () => {
  const metroConfigSource = fs.readFileSync(METRO_CONFIG_PATH, 'utf-8');

  test('imports CUSTOM_THEME_IDS from the shared registry', () => {
    // Keep the explicit .js extension here: metro.config.js is ESM and imports
    // the generated runtime registry artifact directly.
    expect(metroConfigSource).toMatch(
      /import\s*\{\s*CUSTOM_THEME_IDS\s*\}\s*from\s*['"]\.\/src\/lib\/theme\/registry\.js['"]\s*;?/,
    );
  });

  test('derives extraThemes from CUSTOM_THEME_IDS instead of hardcoding theme ids', () => {
    expect(metroConfigSource).toMatch(
      /extraThemes\s*:\s*\[\s*\.\.\.\s*CUSTOM_THEME_IDS\s*\]\s*,?/,
    );
  });
});
