import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import oxlint from 'eslint-plugin-oxlint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', '.astro', '.wrangler', 'coverage']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  ...astro.configs.recommended,
  // Oxlint runs first (see .oxlintrc.json); turn off the rules it already covers.
  // Oxlint reports unused disable directives, since most name rules it now owns.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  ...oxlint.buildFromOxlintConfigFile(
    fileURLToPath(new URL('.oxlintrc.json', import.meta.url)),
  ),
]);
