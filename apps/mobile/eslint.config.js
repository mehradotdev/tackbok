// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const reactCompiler = require('eslint-plugin-react-compiler');
const i18nPlugin = require('./eslint-plugins/i18n');

module.exports = defineConfig([
  expoConfig,
  reactCompiler.configs.recommended,
  {
    ignores: ["dist/*"],
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
