const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro'); // make sure this import exists

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add SQL source extension for Drizzle
config.resolver.sourceExts.push('sql');

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './src/global.css',
  // optional: path to typings
  dtsFile: './src/uniwind-types.d.ts',
});

module.exports = uniwindConfig;
