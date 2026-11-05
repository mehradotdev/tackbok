// Used by .github/workflows/mobile-fingerprint.yml. Hash native module files, not
// just their package.json, so patches such as patches/react-native-skia@*.patch
// change the fingerprint. Runtime versions still use the appVersion policy.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  nativeModuleSourceType: 'files',
};
