const path = require('node:path');
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

// The dev setup for screenshots and QA (#219) ships only in beta bundles. Any
// other variant, including production builds and OTA updates, gets the no-op
// module, decided when the bundle is built (app.config.ts reads the same variable).
const DEV_SETUP_MODULE = path.join(projectRoot, 'src/lib/devSetup/index.ts');
const DEV_SETUP_DISABLED = path.join(projectRoot, 'src/lib/devSetup/disabled.ts');
if (process.env.APP_VARIANT !== 'beta') {
  const upstreamResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = upstreamResolveRequest ?? context.resolveRequest;
    const resolution = resolve(context, moduleName, platform);
    return resolution.type === 'sourceFile' && resolution.filePath === DEV_SETUP_MODULE
      ? { type: 'sourceFile', filePath: DEV_SETUP_DISABLED }
      : resolution;
  };
}

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
