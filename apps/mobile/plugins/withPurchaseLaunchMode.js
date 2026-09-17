const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// RevenueCat requires standard or singleTop when payment verification leaves
// the app. Keep this in a plugin so Expo prebuild preserves the setting.
module.exports = function withPurchaseLaunchMode(config) {
  return withAndroidManifest(config, (mod) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    mainActivity.$['android:launchMode'] = 'singleTop';
    return mod;
  });
};
