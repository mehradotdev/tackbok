// Used by .github/workflows/mobile-fingerprint.yml. Hash native module files, not
// just their package.json, so patches such as patches/react-native-skia@*.patch
// change the fingerprint. Runtime versions still use the appVersion policy.
const { SourceSkips } = require('expo/fingerprint');

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  nativeModuleSourceType: 'files',
  // package.json scripts only drive dev tooling (lint, tests, OTA publishing), so
  // editing one is not a native change. Setting sourceSkips replaces the default
  // preset's skips, so keep its flag too.
  sourceSkips:
    SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun |
    SourceSkips.PackageJsonScriptsAll,
  // Expo's inline modules (app.config.ts experiments.inlineModules) compile into
  // the native build but are not part of the default fingerprint.
  extraSources: [
    {
      type: 'dir',
      filePath: 'src/inlineModules',
      reasons: ['inlineModules'],
    },
  ],
};
