// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import reactCompiler from 'eslint-plugin-react-compiler';
import i18nPlugin from './eslint-plugins/i18n.mjs';

export default defineConfig([
  expoConfig,
  reactCompiler.configs.recommended,
  {
    ignores: ['dist/*'],
  },
  {
    plugins: {
      i18n: i18nPlugin,
    },
    rules: {
      'i18n/no-missing-translation-key': 'warn',
    },
  },
]);
