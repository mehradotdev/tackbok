// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import reactCompiler from 'eslint-plugin-react-compiler';
import i18nPlugin from './eslint-plugins/i18n.mjs';

export default defineConfig([
  expoConfig,
  reactCompiler.configs.recommended,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    plugins: {
      i18n: i18nPlugin,
    },
    rules: {
      'i18n/no-missing-translation-key': 'warn',
      // Reanimated mutates shared values via `.value` by design; the
      // compiler-powered lint can't model them and flags every write.
      'react-hooks/immutability': 'off',
      // Flags intentional patterns: the latest-ref shim in use-compose-refs
      // and LiveWaveform's ref-backed sample buffer drawn via forceRender.
      'react-hooks/refs': 'warn',
      // The "sync draft state when a modal opens" pattern trips this in ~9
      // components; restructuring them all isn't worth the regression risk.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
