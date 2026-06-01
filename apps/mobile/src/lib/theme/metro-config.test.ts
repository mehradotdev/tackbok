import * as fs from 'fs';
import * as path from 'path';

const METRO_CONFIG_PATH = path.resolve(__dirname, '../../../metro.config.js');

describe('Metro Theme Config', () => {
  const metroConfigSource = fs.readFileSync(METRO_CONFIG_PATH, 'utf-8');

  test('imports the CommonJS theme registry for Node-side tooling', () => {
    expect(metroConfigSource).toMatch(
      /require\(['"]\.\/src\/lib\/theme\/registry\.cjs['"]\)/,
    );
    expect(metroConfigSource).toMatch(
      /const\s*\{\s*CUSTOM_THEME_IDS\s*\}\s*=\s*require\(['"]\.\/src\/lib\/theme\/registry\.cjs['"]\)\s*;?/,
    );
  });

  test('derives extraThemes from CUSTOM_THEME_IDS instead of hardcoding theme ids', () => {
    expect(metroConfigSource).toMatch(
      /extraThemes\s*:\s*\[\s*\.\.\.\s*CUSTOM_THEME_IDS\s*\]\s*,?/,
    );
  });
});
