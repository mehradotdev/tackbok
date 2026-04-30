import * as fs from 'fs';
import * as path from 'path';

const METRO_CONFIG_PATH = path.resolve(__dirname, '../../../metro.config.js');

describe('Metro Theme Config', () => {
  const metroConfigSource = fs.readFileSync(METRO_CONFIG_PATH, 'utf-8');

  test('imports CUSTOM_THEME_IDS from the shared registry', () => {
    expect(metroConfigSource).toMatch(
      /import\s*\{\s*CUSTOM_THEME_IDS\s*\}\s*from\s*'\.\/src\/lib\/theme\/registry\.js';/,
    );
  });

  test('derives extraThemes from CUSTOM_THEME_IDS instead of hardcoding theme ids', () => {
    expect(metroConfigSource).toMatch(/extraThemes:\s*\[\.\.\.CUSTOM_THEME_IDS\]/);
  });
});
