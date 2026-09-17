const { withAppBuildGradle } = require('expo/config-plugins');

// The default Expo preset disables optimization. Keep the optimized preset
// through clean prebuilds; expo-build-properties controls minify/resource flags.
module.exports = function withAndroidReleaseOptimization(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error(
        'withAndroidReleaseOptimization requires a Groovy app build.gradle.',
      );
    }

    const preset =
      /getDefaultProguardFile\(\s*(['"])proguard-android(?:-optimize)?\.txt\1\s*\)/g;
    const contents = mod.modResults.contents;
    if (!preset.test(contents)) {
      throw new Error(
        'withAndroidReleaseOptimization could not find the default ProGuard preset. Review the Android release configuration after the Expo template change.',
      );
    }

    mod.modResults.contents = contents.replace(
      preset,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    return mod;
  });
};
