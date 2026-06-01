const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const { CUSTOM_THEME_IDS } = require('./src/lib/theme/registry.cjs');

// Metro config runs under Node, not the app runtime.
// Keep this file in CommonJS because Radon / React Native IDE starts Expo through
// a loader path that still require()s metro.config.js. When this file used ESM
// syntax, that path hit Node 24's ERR_INTERNAL_ASSERTION while Expo was loading
// the Metro config. The generated theme registry stays ESM for app imports, so
// Metro reads the CommonJS companion here instead.

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Add SQL source extension for Drizzle
config.resolver.sourceExts.push('sql');

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './src/global.css',
  // optional: path to typings
  dtsFile: './src/uniwind-types.d.ts',
  // Custom themes
  extraThemes: [...CUSTOM_THEME_IDS],
});

module.exports = uniwindConfig;
